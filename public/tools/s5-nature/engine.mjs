import { calculateDamage } from './vendor/damage.mjs';
import { getAwakeningBonuses } from './awakening.mjs';
import { calculateWildHp, wildTargetShiny } from './wild-hp.mjs';

const STATS = ['hp', 'physicalAttack', 'magicalAttack', 'physicalDefense', 'magicalDefense', 'speed'];
const STAT_NAMES = { hp: '生命', physicalAttack: '物攻', magicalAttack: '魔攻', physicalDefense: '物防', magicalDefense: '魔防', speed: '速度' };
const DIRECTIONS = new Set(['incoming', 'outgoing', 'hp']);
const isNumber = value => typeof value === 'number' && Number.isFinite(value);
const integer = (value, min, max) => isNumber(value) && Number.isSafeInteger(value) && value >= min && value <= max;
const present = value => value !== null && value !== undefined;
const halfUp = (numerator, denominator) => Math.floor((numerator + denominator / 2) / denominator);

function checkNature(nature) {
  if (!nature || !STATS.includes(nature.upStat) || !STATS.includes(nature.downStat) || nature.upStat === nature.downStat) {
    throw new RangeError('性格的增强项和削弱项必须是不同的六维属性。');
  }
}

/** HP uses the calibrated S5 curve; the five other stat hypotheses stay unchanged. */
export function wildPanel(raceStats, level, nature, options = {}) {
  if (![41, 42, 43].includes(level)) throw new RangeError('野生等级仅支持41、42、43。');
  checkNature(nature);
  const panel = {};
  for (const stat of STATS) {
    const race = raceStats?.[stat];
    if (!integer(race, 1, 1000)) throw new RangeError(`种族值${stat}缺失或超出范围。`);
    if (stat === 'hp') {
      panel.hp = calculateWildHp(race, level, nature, options);
      continue;
    }
    const numerator = 1000 + race * (level + 50);
    const base = halfUp(numerator, 100);
    const percent = nature.upStat === stat ? 110 : nature.downStat === stat ? 90 : 100;
    panel[stat] = halfUp(base * percent, 100);
  }
  return panel;
}

function prepare(session, catalog) {
  if (!session || typeof session !== 'object') throw new RangeError('请建立一组观测记录。');
  if (![41, 42, 43].includes(session.level)) throw new RangeError('野生等级仅支持41、42、43。');
  if (!catalog || !Array.isArray(catalog.spirits) || !Array.isArray(catalog.natures)) throw new RangeError('精灵或性格数据未就绪。');
  const target = catalog.spirits.find(row => row.id === session.targetId);
  if (!target) throw new RangeError('请选择数据中已收录的野生精灵。');
  const missingStats = STATS.filter(stat => !integer(target.raceStats?.[stat], 1, 1000));
  if (missingStats.length) throw new RangeError(`${target.name || '该精灵'}种族资料不足（${missingStats.map(stat => STAT_NAMES[stat]).join('、')}），请补齐后计算野怪面板。`);
  const ids = new Set();
  const pairs = new Set();
  for (const nature of catalog.natures) {
    checkNature(nature);
    if (typeof nature.id !== 'string' || !nature.id || ids.has(nature.id)) throw new RangeError('性格数据存在缺失或重复编号。');
    ids.add(nature.id);
    pairs.add(`${nature.upStat}/${nature.downStat}`);
  }
  if (catalog.natures.length !== 30 || pairs.size !== 30) throw new RangeError('需要完整的30种性格数据，避免遗漏性格。');
  return { target, catalog, session };
}

function percentError(value, digits) {
  if (!present(value)) return '';
  if (!isNumber(value) || value < 0 || value > 100) return '生命百分比必须是0至100的有限数字。';
  const scale = 10 ** digits;
  if (Math.round(value * scale) / scale !== value) return '生命百分比的小数位数与记录精度不符。';
  return '';
}

function observationError(obs) {
  if (obs?.direction === 'poison') return '中毒记录已交由独立生命上限反推，不参与直接伤害公式。';
  if (!obs || !DIRECTIONS.has(obs.direction)) return '请选择正确的观测方向。';
  if (typeof obs.id !== 'string' || !obs.id) return '观测记录缺少编号。';
  const predictLoss = obs.direction === 'outgoing' && !present(obs.damage) && present(obs.afterPercent);
  if (!predictLoss && !integer(obs.damage, 0, 1000000)) return '请填写非负整数的实际扣血；出伤记录也可只填写敌方扣血后的生命百分比。';
  if (obs.context !== 'clean') return '场上状态尚未确认；请排除增减攻防、护盾、暴击及其他额外效果。';
  if (present(obs.defeated) && typeof obs.defeated !== 'boolean') return '敌方倒下标记必须是布尔值。';
  if (present(obs.ownDefeated) && typeof obs.ownDefeated !== 'boolean') return '我方倒下标记必须是布尔值。';
  if (obs.direction === 'incoming' && obs.ownDefeated === true) return '我方已倒下，实际扣血受剩余生命截断；本条暂不反推性格。';
  const hasPercent = present(obs.beforePercent) || present(obs.afterPercent);
  if (obs.direction === 'incoming' && hasPercent) return '承伤记录不读取敌方生命百分比；请另建一条已知扣血的生命记录。';
  if (obs.direction === 'hp' && (!present(obs.beforePercent) || !present(obs.afterPercent))) return '生命记录需要扣血前后两个百分比，不默认从满血开始。';
  if (hasPercent) {
    if (![0, 1].includes(obs.percentDigits)) return '百分比精度仅支持整数或一位小数。';
    if (!['game', 'round', 'floor'].includes(obs.percentMode)) return '请选择百分比显示算法：游戏整数显示、四舍五入或向下取整。';
    if (obs.percentMode === 'game' && obs.percentDigits !== 0) return '游戏百分比只显示整数，请将小数精度设为整数。';
    const error = percentError(obs.beforePercent, obs.percentDigits) || percentError(obs.afterPercent, obs.percentDigits);
    if (error) return error;
  }
  if (obs.direction === 'outgoing' && present(obs.damage) && obs.afterPercent === 0 && obs.defeated !== true) return '显示0%不能确认实际倒下；请确认敌方是否倒下后再使用这条实际扣血记录。';
  if (obs.direction !== 'hp' && obs.reduction !== 1) return '本版仅核算无减伤的简单单击；请确认减伤倍率为1。';
  if (present(obs.hitCount) && obs.hitCount !== 1) return '本版仅支持单次命中的简单技能。';
  return '';
}

function damageContext(prepared, obs) {
  if (obs.direction === 'hp') return {};
  const { session, catalog, target } = prepared;
  const profiles = Array.isArray(session.profiles) ? session.profiles : [];
  const matches = profiles.filter(row => row?.id === obs.profileId);
  if (matches.length !== 1) return { error: '请选择一套编号唯一的我方实际面板。' };
  const profile = matches[0];
  if (!integer(profile.level, 1, 100) || !integer(profile.awakening, 0, 5)) return { error: '请填写我方等级及0至5次的觉醒次数。' };
  const ownSpirit = catalog.spirits.find(row => row.id === profile.spiritId);
  if (!ownSpirit) return { error: '我方精灵未收录，无法核对属性和学习面。' };
  const traitWarnings = [];
  if (Object.hasOwn(catalog.calculationRules || {}, 'traitSafeIds')) {
    const safeIds = catalog.calculationRules.traitSafeIds;
    if (!Array.isArray(safeIds)) return { error: '特性适用范围资料不完整，暂不核算伤害。' };
    for (const spirit of [target, ownSpirit]) {
      if (safeIds.includes(spirit.id)) continue;
      const label = `${spirit.name || '该精灵'}${spirit.traitName ? `「${spirit.traitName}」` : ''}`;
      if (catalog.meta?.calibrationStatus === 'unverified' && catalog.calculationRules.unverifiedTraitPreview === true) {
        traitWarnings.push(`本条未计入${label}特性；按档案面板计算。`);
      } else {
        return { error: `${label}的特性尚未纳入中性单击适用范围；请改用已知扣血的生命验证。` };
      }
    }
  }
  const skill = catalog.skills?.find(row => row.id === obs.skillId);
  if (!skill || skill.supported !== true || !['physical', 'magical'].includes(skill.category) || !isNumber(skill.basePower) || skill.basePower <= 0 || skill.basePower > 10000) {
    return { error: '该技能尚未纳入简单单击白名单，暂不参与反推。' };
  }
  const requiredStat = obs.direction === 'incoming'
    ? skill.category === 'physical' ? 'physicalDefense' : 'magicalDefense'
    : skill.category === 'physical' ? 'physicalAttack' : 'magicalAttack';
  if (!integer(profile.panel?.[requiredStat], 1, 100000)) return { error: '请填写本条伤害所需的我方实际攻击或防御面板。' };
  if (!STATS.every(stat => !present(profile.panel?.[stat]) || integer(profile.panel[stat], 1, 100000))) return { error: '已填写的我方面板必须是正整数，留空的非必需属性可稍后补充。' };
  const attacker = obs.direction === 'incoming' ? target : ownSpirit;
  const defender = obs.direction === 'incoming' ? ownSpirit : target;
  if (!catalog.learnsets?.find(row => row.spiritId === attacker.id)?.skillIds?.includes(skill.id)) return { error: '攻击方的学习面中没有该技能，请核对技能选择。' };
  const types = catalog.typeChart?.types;
  const row = Array.isArray(types) ? types.indexOf(skill.type) : -1;
  if (!Array.isArray(attacker.types) || !attacker.types.length || !Array.isArray(defender.types) || !defender.types.length || row < 0) return { error: '属性资料不完整，无法确认中性伤害。' };
  for (const type of defender.types) {
    const column = types.indexOf(type);
    if (column < 0 || catalog.typeChart.matrix?.[row]?.[column] !== 1) return { error: '本版仅核算对每个防守属性都中性的技能；克制、抵抗及两者抵消暂不参与。' };
  }
  const stab = attacker.types.includes(skill.type)
    ? getAwakeningBonuses(obs.direction === 'incoming' ? 0 : profile.awakening).sameTypeMultiplier
    : 1;
  return { profile, skill, stab, traitWarnings };
}

// Compare integer display intervals without floating-point tolerances.
function matchesPercent(hp, maxHp, percent, obs) {
  if (!present(percent)) return true;
  const scale = 10 ** obs.percentDigits;
  const shown = Math.round(percent * scale);
  const scaledHp = hp * 100 * scale;
  if (obs.percentMode === 'game') {
    if (shown === 0) return hp === 0;
    if (shown === 100) return hp === maxHp;
    if (shown === 99) return 98 * maxHp < scaledHp && scaledHp < 100 * maxHp;
    return (shown - 1) * maxHp < scaledHp && scaledHp <= shown * maxHp;
  }
  if (obs.percentMode === 'floor') return shown * maxHp <= scaledHp && scaledHp < (shown + 1) * maxHp;
  return (2 * shown - 1) * maxHp <= 2 * scaledHp && 2 * scaledHp < (2 * shown + 1) * maxHp;
}

function possibleHp(maxHp) {
  return new Set(Array.from({ length: maxHp }, (_, index) => index + 1));
}

function hpRange(states) {
  if (!states?.size) return null;
  const values = [...states];
  return { min: Math.min(...values), max: Math.max(...values), count: values.length };
}

function calculatePrediction(prepared, obs, nature, context, beforeStates) {
  const panel = wildPanel(prepared.target.raceStats, prepared.session.level, nature, { shiny: wildTargetShiny(prepared.session) });
  let damage = null;
  if (obs.direction !== 'hp') {
    const physical = context.skill.category === 'physical';
    const attackStat = physical ? 'physicalAttack' : 'magicalAttack';
    const defenseStat = physical ? 'physicalDefense' : 'magicalDefense';
    const incoming = obs.direction === 'incoming';
    damage = calculateDamage({
      attackerStat: incoming ? panel[attackStat] : context.profile.panel[attackStat],
      defenderDefense: incoming ? context.profile.panel[defenseStat] : panel[defenseStat],
      displayedPower: context.skill.basePower * context.stab,
      level: incoming ? prepared.session.level : context.profile.level,
      damageReductionMultiplier: 1,
      hitCount: 1,
      finalDamageMultiplier: 1,
    }).total;
  }
  let nextStates = new Set();
  const predictedLoss = obs.direction === 'outgoing' && !present(obs.damage);
  const damageCompatible = obs.direction === 'hp' || predictedLoss || (obs.direction === 'outgoing' && obs.defeated === true ? damage >= obs.damage : damage === obs.damage);
  if (damageCompatible) {
    for (const beforeHp of beforeStates) {
      if (obs.direction === 'incoming') {
        if (beforeHp > 0) nextStates.add(beforeHp);
        continue;
      }
      const actualLoss = predictedLoss ? Math.min(damage, beforeHp) : obs.damage;
      if (beforeHp <= 0 || beforeHp < actualLoss || !matchesPercent(beforeHp, panel.hp, obs.beforePercent, obs)) continue;
      const afterHp = beforeHp - actualLoss;
      if (obs.defeated === true && afterHp !== 0) continue;
      if (matchesPercent(afterHp, panel.hp, obs.afterPercent, obs)) nextStates.add(afterHp);
    }
  }
  return {
    prediction: {
      natureId: nature.id, damage, hpMax: panel.hp, actualDamage: obs.damage ?? null,
      compatible: nextStates.size > 0, remainingHp: hpRange(nextStates),
      warnings: context.traitWarnings || [],
      estimated: prepared.catalog.meta?.calibrationStatus === 'unverified' || Boolean(context.traitWarnings?.length),
    },
    nextStates,
  };
}

/** An isolated prediction starts at unknown remaining HP, never at full HP. */
export function predictObservation(session, obs, nature, catalog) {
  const calibrationStatus = catalog?.meta?.calibrationStatus ?? 'not-specified';
  try {
    const prepared = prepare(session, catalog);
    checkNature(nature);
    const error = observationError(obs);
    const context = error ? {} : damageContext(prepared, obs);
    if (error || context.error) return { status: 'blocked', reason: error || context.error, natureId: nature?.id, compatible: false, calibrationStatus };
    const maxHp = wildPanel(prepared.target.raceStats, session.level, nature, { shiny: wildTargetShiny(session) }).hp;
    return { status: 'used', reason: context.traitWarnings?.length ? context.traitWarnings.join(' ') : '按当前模型及条件核算。', ...calculatePrediction(prepared, obs, nature, context, possibleHp(maxHp)).prediction, calibrationStatus };
  } catch (error) {
    return { status: 'blocked', reason: error.message, natureId: nature?.id, compatible: false, calibrationStatus };
  }
}

export function solve(session, catalog) {
  // Calibration belongs to the shipped catalog, never to imported session input.
  const calibrationStatus = catalog?.meta?.calibrationStatus ?? 'not-specified';
  const unverified = calibrationStatus === 'unverified';
  let prepared;
  let all;
  try {
    prepared = prepare(session, catalog);
    all = catalog.natures.map(nature => ({ nature, panel: wildPanel(prepared.target.raceStats, session.level, nature, { shiny: wildTargetShiny(session) }) }));
    if (!Array.isArray(session.observations)) throw new RangeError('观测记录必须是数组。');
  } catch (error) {
    return {
      status: 'incomplete', modelStatus: 'incomplete', calibrationStatus, candidatesEstimated: unverified, candidates: [],
      observations: (Array.isArray(session?.observations) ? session.observations : []).map(obs => ({ id: obs?.id, status: 'blocked', reason: error.message, remainingCount: 0, predictions: [] })),
      suggestions: ['补齐输入后再核算。'], warnings: [error.message],
    };
  }
  let candidates = all;
  const states = new Map(all.map(row => [row.nature.id, possibleHp(row.panel.hp)]));
  const observations = [];
  const warnings = [];
  const seenIds = new Set();
  let used = 0;
  let blocked = 0;
  for (const obs of session.observations) {
    let error = observationError(obs);
    if (!error && seenIds.has(obs.id)) error = '观测编号重复，请保留唯一编号。';
    if (obs?.id) seenIds.add(obs.id);
    const context = error ? {} : damageContext(prepared, obs);
    error ||= context.error;
    if (error) {
      blocked++;
      observations.push({ id: obs?.id, status: 'blocked', reason: error, remainingCount: candidates.length, predictions: [] });
      // Even an incoming move can heal the enemy (for example, life steal).
      // No blocked event is safe to skip while retaining an exact HP history.
      for (const candidate of candidates) states.set(candidate.nature.id, possibleHp(candidate.panel.hp));
      warnings.push(`记录${obs?.id || observations.length}未能核算，可能改变敌方生命，已中断连续生命约束；后续从未知剩余生命继续。`);
      continue;
    }
    const predictions = [];
    const nextCandidates = [];
    for (const candidate of candidates) {
      const result = calculatePrediction(prepared, obs, candidate.nature, context, states.get(candidate.nature.id));
      predictions.push(result.prediction);
      states.set(candidate.nature.id, result.nextStates);
      if (result.prediction.compatible) nextCandidates.push(candidate);
    }
    candidates = nextCandidates;
    used++;
    for (const warning of context.traitWarnings || []) if (!warnings.includes(warning)) warnings.push(warning);
    observations.push({
      id: obs.id, status: 'used', remainingCount: candidates.length, predictions,
      reason: (context.traitWarnings?.length ? '本条未计入特性；按档案面板计算。' : '') + (obs.direction === 'hp'
        ? '按已知实际扣血、显示取整区间及连续剩余生命筛选。'
        : obs.direction === 'outgoing' && !present(obs.damage)
          ? '按计算伤害接续同一遭遇的剩余生命，并用前后百分比区间筛选；倒下时仅扣除剩余生命。'
        : obs.direction === 'outgoing' && obs.defeated === true
          ? '敌方确认倒下，实际扣血仅作为理论伤害下界，并接续剩余生命约束。'
          : '按中性简单单击精确核算；出伤记录接续同一遭遇的剩余生命。'),
    });
  }
  const modelStatus = used && !candidates.length ? 'conflict' : blocked ? 'incomplete' : !used ? 'empty' : candidates.length === 1 ? 'unique' : 'multiple';
  const status = unverified && session.demo !== true && modelStatus !== 'conflict' ? 'incomplete' : modelStatus;
  const suggestions = [];
  if (blocked) suggestions.push('修改标记为未参与匹配的记录，补齐列出的条件。');
  if (blocked && !candidates.length) warnings.push('另有记录未参与核算；当前冲突来自已核算记录。');
  if (!candidates.length) suggestions.push('检查实际扣血、技能、面板、取整方式和记录顺序；换一只野怪时请清空旧记录。');
  else if (candidates.length > 1) suggestions.push('补充另一伤害类别的中性单击承伤，或已知扣血前后的生命百分比。');
  if (session.observations.length) warnings.push('所有记录按同一只野怪的时间顺序核算；换我方面板不会重置敌方生命。');
  if (modelStatus === 'conflict') warnings.push('没有性格同时匹配已核算记录，请核对技能、面板、回合状态及记录顺序。');
  return { status, modelStatus, calibrationStatus, candidatesEstimated: unverified, candidates, observations, suggestions, warnings };
}
