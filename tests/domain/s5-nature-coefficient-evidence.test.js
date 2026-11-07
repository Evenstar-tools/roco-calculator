import { readFileSync } from 'node:fs';
import { previewMatchup } from '../../public/tools/s5-nature/matchup-preview.mjs';
import { test, expect } from 'vitest';
import { resolveWildDefense, calculateWildDefense } from '../../public/tools/s5-nature/wild-defense.mjs';
import { resolveWildAttack, calculateWildAttack } from '../../public/tools/s5-nature/wild-attack.mjs';

const neutral = { upStat: 'hp', downStat: 'speed' };
const defenseUp = { upStat: 'physicalDefense', downStat: 'speed' };

test('a confirmed source stage does not promote its fallback coefficient to a game constant', () => {
  const result = resolveWildDefense(99, 42, neutral, 'magicalDefense', 2, 3211);
  expect(result.kind).toBe('stage-extrapolation');
  expect(result.coefficient).toBe(1.6005);
  expect(result.formulaVerified).toBe(false);
  expect(result.value).toBe(calculateWildDefense(99, 42, neutral, 'magicalDefense', 2, 3211));
  const attack = resolveWildAttack(152, 42, neutral, 'magicalAttack', 2);
  expect(attack.kind).toBe('stage-fit');
  expect(attack.coefficient).toBe(2.4);
  expect(attack.formulaVerified).toBe(false);
  expect(attack.value).toBe(calculateWildAttack(152, 42, neutral, 'magicalAttack', 2));
});

test('a source-specific fit retains its limited level and nature evidence', () => {
  const measured = resolveWildDefense(91, 42, defenseUp, 'physicalDefense', 2, 3209);
  const unmeasured = resolveWildDefense(91, 43, defenseUp, 'physicalDefense', 2, 3209);
  expect(measured.kind).toBe('source-fit');
  expect(measured.sampleScopeMatches).toBe(true);
  expect(measured.measuredLevels).toEqual([42]);
  expect(unmeasured.kind).toBe('source-fit');
  expect(unmeasured.sampleScopeMatches).toBe(false);
  expect(unmeasured.formulaVerified).toBe(false);
  expect(unmeasured.value).toBe(calculateWildDefense(91, 43, defenseUp, 'physicalDefense', 2, 3209));
});

test('recorded effective-defense points are conditional fits and cannot leak into another source or condition', () => {
  const point = resolveWildDefense(76, 42, neutral, 'physicalDefense', 1, 3398);
  expect(point.kind).toBe('effective-defense-point');
  expect(point.value).toBe(174);
  expect(point.coefficient).toBeNull();
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
