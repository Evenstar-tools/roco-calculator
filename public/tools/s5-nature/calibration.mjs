import { invertHpObservations, invertPoisonTick } from './hp-inverse.mjs';
import { calculateWildHp, wildTargetShiny, WILD_HP_MODEL } from './wild-hp.mjs';
import { targetLevels } from './engine.mjs';

export function poisonMultiplier(target, catalog) {
  if (!target?.types?.length || target.types.includes('毒')) return null;
  const chart = catalog.typeChart;
  const attack = chart?.types?.indexOf('毒');
  let value = 1;
  for (const type of new Set(target.types)) {
    const factor = chart?.matrix?.[attack]?.[chart.types.indexOf(type)];
    if (!Number.isFinite(factor) || factor <= 0) return null;
    value *= factor;
  }
  return value >= 4 ? 3 : value <= 0.25 ? 0.25 : value;
}

function intersectRanges(left, right) {
  return left.flatMap(a => right.flatMap(b => {
    const min = Math.max(a.min, b.min), max = Math.min(a.max, b.max);
    return min <= max ? [{ min, max }] : [];
  }));
}

export function analyzeHealth(session, catalog) {
  const target = catalog.spirits.find(row => row.id === session.targetId);
  const poison = session.observations.flatMap((obs, index) => {
    if (obs.direction !== 'poison') return [];
    let reason;
    if (obs.context !== 'clean' || obs.poison?.confirmed !== true) reason = '请确认总层数、单跳读数及无额外修正。';
    if (obs.defeated) reason = '目标倒下，毒伤受剩余生命截断，不能反推理论单跳。';
    const naturalMultiplier = poisonMultiplier(target, catalog);
    if (naturalMultiplier === null) reason = '该属性无法按普通中毒模型反推。';
    const multiplier = obs.poison?.multiplier;
    if (![0.25, 0.5, 1, 2, 3, 4].includes(multiplier)) reason = '毒系倍率未确认。';
    if (reason) return [{ index, status: 'unconfirmed', reason }];
    const result = invertPoisonTick(obs.damage, {
      layers: obs.poison.layers, percentPerLayer: { numerator: 3, denominator: 100 },
      typeMultiplier: { numerator: multiplier * 4, denominator: 4 },
      rounding: 'floor', repeatCount: 1,
    });
    return [{ ...result, index, reason: result.reason || result.blocked?.join?.(' ') || '',
      label: `${obs.poison.layers}层 × 3% × ${multiplier}倍，单跳向下取整` }];
  });
  const hpObservations = session.observations.map((obs, index) => {
    if (obs.direction === 'incoming') {
      const skill = catalog.skills.find(row => row.id === obs.skillId);
      const traitMayChangeHp = !catalog.calculationRules?.traitSafeIds?.includes(target?.id)
        || /生命|吸血|回血/.test(target?.traitDescription ?? '');
      return { ...obs, hpChainBreak: obs.hpChainBreak || !skill?.supported || traitMayChangeHp };
    }
    if (obs.direction !== 'poison') return obs;
    const item = poison.find(row => row.index === index);
    return { ...obs, poison: {
      confirmed: ['range', 'unique'].includes(item?.status),
      layers: obs.poison?.layers, percentPerLayer: { numerator: 3, denominator: 100 },
      typeMultiplier: { numerator: (obs.poison?.multiplier ?? 0) * 4, denominator: 4 },
      rounding: 'floor', repeatCount: 1,
      immune: poisonMultiplier(target, catalog) === null,
    } };
  });
  const knownPoison = poison.filter(item => ['range', 'unique', 'conflict'].includes(item.status));
  const candidateRanges = knownPoison.reduce((ranges, item) => {
    const next = item.status === 'conflict' ? [] : [{min:item.min,max:item.max}];
    return ranges === null ? next : intersectRanges(ranges, next);
  }, null);
  const percentages = invertHpObservations(hpObservations, candidateRanges === null ? {} : {candidateRanges});
  let ranges = percentages.usedCount ? percentages.ranges : null;
  const usedIndices = new Set(hpObservations.flatMap((obs, index) => obs.direction !== 'incoming'
    && !percentages.blocked.some(row => row.index === index) ? [index] : []));
  for (const item of poison) {
    if (!['range', 'unique', 'conflict'].includes(item.status)) continue;
    const next = item.status === 'conflict' ? [] : [{ min: item.min, max: item.max }];
    ranges = ranges === null ? next : intersectRanges(ranges, next);
    usedIndices.add(item.index);
  }
  ranges ??= [];
  const usedCount = usedIndices.size;
  const count = ranges.reduce((sum, range) => sum + range.max - range.min + 1, 0);
  const status = !usedCount ? 'empty' : !count ? 'conflict' : count === 1 ? 'unique' : 'range';
  const capped = percentages.capped && ranges.some(range => range.max === percentages.upperBoundSearched);
  const levels = [41, 42, 43, 'all'].includes(session.level) ? targetLevels(session.level) : [];
  const naturePreview = usedCount && Number.isInteger(target?.raceStats?.hp) && levels.length
    ? catalog.natures.flatMap(nature => {
      const hpByLevel = levels.map(level => ({ level,
        hp: calculateWildHp(target.raceStats.hp, level, nature, { shiny: wildTargetShiny(session) }) }))
        .filter(row => ranges.some(range => range.min <= row.hp && row.hp <= range.max));
      return hpByLevel.length ? [{ ...nature, levels: hpByLevel.map(row => row.level), hpByLevel }] : [];
    }) : null;
  return { status, ranges, count, usedCount, capped, percentages, poison, naturePreview, hpModel: WILD_HP_MODEL };
}

// Exact historical matches only. Never extrapolate a table's summary threshold.
export function compareFieldSamples(session, catalog, data) {
  const target = catalog.spirits.find(row => row.id === session.targetId);
  return session.observations.flatMap((obs, index) => {
    const levels = [41, 42, 43, 'all'].includes(session.level) ? targetLevels(session.level) : [];
    const matches = data.entries.filter(row => row.targetId === target?.id && levels.includes(row.level)
      && row.direction === obs.direction && row.damage === obs.damage
      && (obs.direction === 'poison' || row.skillId && row.skillId === obs.skillId));
    if (!matches.length) return [];
    const profile = session.profiles.find(row => row.id === obs.profileId);
    const own = catalog.spirits.find(row => row.id === profile?.spiritId);
    const skill = catalog.skills.find(row => row.id === obs.skillId);
    const defenseStat = skill?.category === 'physical' ? 'physicalDefense'
      : skill?.category === 'magical' ? 'magicalDefense' : null;
    return [{ index, matches: matches.map(row => ({ ...row,
      configurationMatches: obs.direction === 'poison'
        // A current layer count cannot supply missing historical conditions.
        ? row.poison?.confirmed === true && obs.poison?.confirmed === true
          && row.poison.layers === obs.poison.layers && row.poison.multiplier === obs.poison.multiplier
          && obs.context === 'clean'
        : own?.name === row.defenderName && obs.context === 'clean'
          && defenseStat != null && row.defenderDefense != null && profile?.panel?.[defenseStat] === row.defenderDefense
          && profile?.level === row.defenderLevel && profile?.awakening === row.defenderAwakening,
    })) }];
  });
}
