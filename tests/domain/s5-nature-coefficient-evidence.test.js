import { readFileSync } from 'node:fs';
import { previewMatchup } from '../../public/tools/s5-nature/matchup-preview.mjs';
import { test, expect } from 'vitest';
import { resolveWildDefense, calculateWildDefense } from '../../public/tools/s5-nature/wild-defense.mjs';
import { resolveWildAttack, calculateWildAttack } from '../../public/tools/s5-nature/wild-attack.mjs';

const neutral = { upStat: 'hp', downStat: 'speed' };
const defenseUp = { upStat: 'physicalDefense', downStat: 'speed' };

test('decimal half boundaries round upward without floating-point coefficient drift', () => {
  // 魔力猫42级加魔防：基础149 → 性格164 → 175 × 1.38 = 241.5。
  expect(calculateWildDefense(151, 42, { upStat: 'magicalDefense', downStat: 'speed' }, 'magicalDefense', 3)).toBe(242);
  // 棋骑士（黑子）42/43级减魔防：基础71 → 性格64 → 75 × 1.38 = 103.5。
  for (const level of [42, 43]) {
    expect(calculateWildDefense(66, level, { upStat: 'hp', downStat: 'magicalDefense' }, 'magicalDefense', 3)).toBe(104);
  }
});

test('a confirmed source stage does not promote its fallback coefficient to a game constant', () => {
  const result = resolveWildDefense(99, 42, neutral, 'magicalDefense', 2, 3211);
  expect(result.kind).toBe('stage-extrapolation');
  expect(result.coefficient).toBe(1.955);
  expect(result.formulaVerified).toBe(false);
  expect(result.value).toBe(calculateWildDefense(99, 42, neutral, 'magicalDefense', 2, 3211));
  const attack = resolveWildAttack(152, 42, neutral, 'magicalAttack', 2);
  expect(attack.kind).toBe('stage-fit');
  expect(attack.coefficient).toBe(2.4);
  expect(attack.formulaVerified).toBe(false);
  expect(attack.value).toBe(calculateWildAttack(152, 42, neutral, 'magicalAttack', 2));
});

test('a source-specific fit retains its limited level and nature evidence', () => {
  const measured = resolveWildDefense(73, 42, defenseUp, 'physicalDefense', 2, 3209);
  const unmeasured = resolveWildDefense(73, 43, defenseUp, 'physicalDefense', 2, 3209);
  expect(measured.kind).toBe('source-fit');
  expect(measured.sampleScopeMatches).toBe(true);
  expect(measured.measuredScopes.filter(scope => scope.stat === 'physicalDefense').map(scope => scope.level)).toEqual([42]);
  expect(unmeasured.kind).toBe('source-fit');
  expect(unmeasured.sampleScopeMatches).toBe(false);
  expect(unmeasured.formulaVerified).toBe(false);
  expect(unmeasured.value).toBe(calculateWildDefense(73, 43, defenseUp, 'physicalDefense', 2, 3209));
});

test('recorded effective-defense points are conditional fits and cannot leak into another source or condition', () => {
  const point = resolveWildDefense(46, 42, neutral, 'physicalDefense', 1, 3398);
  expect(point.kind).toBe('effective-defense-point');
  expect(point.value).toBe(174);
  expect(point.coefficient).toBe(2.76);
  expect(point.value).toBe(calculateWildDefense(46, 42, neutral, 'physicalDefense', 1));
  expect(point.fixedOutgoingCorrectionMultiplier).toBe(1.8);
  expect(point.formulaVerified).toBe(false);
  for (const result of [
    resolveWildDefense(76, 41, neutral, 'physicalDefense', 1, 3398),
    resolveWildDefense(76, 42, defenseUp, 'physicalDefense', 1, 3398),
    resolveWildDefense(76, 42, neutral, 'physicalDefense', 1, 3399),
    resolveWildDefense(76, 42, neutral, 'magicalDefense', 1, 3398),
  ]) expect(result.kind).toBe('stage-extrapolation');
});


test('preview evidence follows the exact pre-dice source used for each direction', () => {
  const catalog = JSON.parse(readFileSync('public/tools/s5-nature/data/catalog.json', 'utf8'));
  const target = catalog.spirits.find(row => row.name === '星尘虫');
  const own = catalog.spirits.find(row => row.name === '罗隐');
  const physical = catalog.skills.find(row => row.name === '火焰切割');
  const magical = catalog.skills.find(row => row.name === '音爆');
  const result = previewMatchup({ targetId: target.id, level: 42,
    profile: { spiritId: own.id, level: 60, awakening: 5,
      panel: { hp: 403, physicalAttack: 312, magicalAttack: 136, physicalDefense: 183, magicalDefense: 137, speed: 176 } },
    skillIds: [physical.id], incomingSkillId: magical.id }, catalog);
  expect(result.status).toBe('estimated');
  expect(result.wildStrengthStage).toBe(1);
  expect(result.wildStrengthStageEvidence.status).toBe('verified');
  expect(result.outgoing[0].predictions).toHaveLength(30);
  for (const row of result.outgoing[0].predictions) {
    expect(row.wildStatEvidence.value).toBe(row.defenderDefense);
    expect(row.wildStatEvidence.sourcePetbaseId).toBe(3398);
    expect(row.wildStatEvidence.formulaVerified).toBe(false);
  }
  expect(result.incoming.predictions).toHaveLength(30);
  for (const row of result.incoming.predictions) {
    expect(row.wildStatEvidence.value).toBe(row.attackerStat);
    expect(row.wildStatEvidence.kind).toBe('stage-fit');
    expect(row.wildStatEvidence.formulaVerified).toBe(false);
  }
});


test('bird42 defense is conditional on its shield-breaking ground hit, not the post-shield fire hit', () => {
  const point = resolveWildDefense(85, 42, neutral, 'physicalDefense', 3, 3444);
  expect(point.kind).toBe('effective-defense-point');
  expect(point.value).toBe(137);
  expect(point.evidencePhase).toBe('shield-break');
  expect(point.observedDamage).toBe(1331);
  expect(point.fixedOutgoingCorrectionMultiplier).toBe(1.8);
  expect(point.interval[0]).toBeCloseTo(182452 / 1332, 8);
  expect(point.interval[1]).toBeCloseTo(182452 / 1331, 8);
  expect(point.formulaVerified).toBe(false);
});


test('whale direct observation annotates its matching rounded fit and never claims a raw panel', () => {
  const point = resolveWildDefense(125, 41, defenseUp, 'physicalDefense', 3, 3381);
  expect(point.kind).toBe('effective-defense-point');
  expect(point.value).toBe(203);
  expect(point.interval).toEqual([50681 / 250, 39278 / 193]);
  expect(point.intervalBounds).toBe('(lower,upper]');
  expect(point.valueMeaning).toBe('effective-damage-divisor');
  expect(point.rawPanelVerified).toBe(false);
  expect(point.positiveNatureConfirmed).toBe(true);
  expect(point.negativeNatureConfirmed).toBe(false);
  expect(point.formulaVerified).toBe(false);
  expect(point.levelEvidence).toBe('independent-hp-intersection508');
  for (const [race, level, nature, stat, stage, source] of [
    [126, 41, defenseUp, 'physicalDefense', 3, 3381],
    [125, 41, defenseUp, 'physicalDefense', 2, 3381],
    [125, 41, defenseUp, 'physicalDefense', 3, 3382],
    [140, 43, neutral, 'magicalDefense', 3, 3381],
    [141, 43, neutral, 'magicalDefense', 2, 3381],
    [141, 43, neutral, 'magicalDefense', 3, 3382],
    [141, 43, neutral, 'physicalDefense', 3, 3381],
    [125, 43, neutral, 'magicalDefense', 3, 3381],
  ]) {
    const actual = resolveWildDefense(race, level, nature, stat, stage, source);
    expect(actual.kind).toBe('stage-extrapolation');
    expect(actual.value).toBe(calculateWildDefense(race, level, nature, stat, stage));
  }
});

test('whale rounded source fit marks measured bands and extrapolation separately', () => {
  const scopes = [
    { level: 41, stat: 'physicalDefense', naturePercents: [100, 110] },
    { level: 42, stat: 'physicalDefense', naturePercents: [90, 100, 110] },
    { level: 43, stat: 'physicalDefense', naturePercents: [100] },
    { level: 41, stat: 'magicalDefense', naturePercents: [100] },
    { level: 42, stat: 'magicalDefense', naturePercents: [100] },
    { level: 43, stat: 'magicalDefense', naturePercents: [100] },
  ];
  for (const stat of ['physicalDefense', 'magicalDefense']) {
    const race = stat === 'physicalDefense' ? 125 : 141;
    for (const level of [41, 42, 43]) {
      for (const naturePercent of [90, 100, 110]) {
        const nature = naturePercent === 100 ? neutral : naturePercent === 110
          ? { upStat: stat, downStat: 'speed' } : { upStat: 'speed', downStat: stat };
        const result = resolveWildDefense(race, level, nature, stat, 3, 3381);
        if (stat === 'physicalDefense' && level === 41 && naturePercent === 110) {
          expect(result.kind).toBe('effective-defense-point');
          expect(result.value).toBe(203);
          continue;
        }
        expect(result.kind).toBe('source-fit');
        expect(result.coefficient).toBe(1.38);
        expect(result.rounding).toBe('round-half-up-base-nature-final');
        expect(result.roundedBase).toBe(Math.round(10 + race * (level + 50) / 100));
        expect(result.roundedNature).toBe(Math.round(result.roundedBase * naturePercent / 100));
        expect(result.value).toBe(Math.round((result.roundedNature + 11) * 1.38));
        expect(result.measuredScopes).toEqual(scopes);
        expect(result.sampleScopeMatches).toBe(scopes.some(scope => scope.level === level
          && scope.stat === stat && scope.naturePercents.includes(naturePercent)));
        expect(result.natureBandEvidence).toMatch(/^inverse-damage-fit/);
        expect(result.rawPanelVerified).toBe(false);
        expect(result.formulaVerified).toBe(false);
      }
    }
  }
});

test('stage3 extension applies rounded defenses without inventing source measurements', () => {
  for (const [race, source, level, stat] of [
    [125, 3499, 42, 'physicalDefense'], [125, 3499, 42, 'magicalDefense'],
    [128, 99999, 43, 'magicalDefense'],
  ]) {
    const result = resolveWildDefense(race, level, neutral, stat, 3, source);
    expect(result.value).toBe(Math.round((Math.round(10 + race * (level + 50) / 100) + 11) * 1.38));
    expect(result.kind).toBe('stage-extrapolation');
    expect(result.coefficient).toBe(1.38);
    expect(result.sampleScopeMatches).toBe(false);
    expect(result.measuredScopes).toEqual([]);
    expect(result.rawPanelVerified).toBe(false);
    expect(result.formulaVerified).toBe(false);
  }
  const birdMeasured = resolveWildDefense(85, 41,
    { upStat: 'magicalDefense', downStat: 'speed' }, 'magicalDefense', 3, 3444);
  expect(birdMeasured.value).toBe(148);
  expect(birdMeasured.kind).toBe('source-fit');
  expect(birdMeasured.sampleScopeMatches).toBe(true);
  // The43-level/nature assumptions in340/204 were inferred, not captured.
  for (const stat of ['physicalDefense', 'magicalDefense']) {
    const birdInferred = resolveWildDefense(85, 43, neutral, stat, 3, 3444);
    expect(birdInferred.value).toBe(138);
    expect(birdInferred.sampleScopeMatches).toBe(false);
  }
  const stork = resolveWildDefense(81, 43, neutral, 'magicalDefense', 3, 3069);
  expect(stork.value).toBe(132);
  expect(stork.kind).toBe('stage-extrapolation');
  expect(stork.sampleScopeMatches).toBe(false);
  expect(resolveWildDefense(101, 43, neutral, 'physicalDefense', 3, 3069).sampleScopeMatches).toBe(true);
});
