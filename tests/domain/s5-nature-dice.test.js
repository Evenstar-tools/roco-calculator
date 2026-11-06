import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { previewMatchup } from '../../public/tools/s5-nature/matchup-preview.mjs';

const catalog = JSON.parse(readFileSync('public/tools/s5-nature/data/catalog.json', 'utf8'));
const species = name => catalog.spirits.find(row => row.name === name);
const move = catalog.skills.find(row => row.name === '先发制人');
const input = () => ({ targetId: species('可爱猿').id, level: 41,
  profile: { spiritId: species('罗隐').id, level: 60, awakening: 5,
    panel: { hp: 403, physicalAttack: 312, magicalAttack: 136, physicalDefense: 183, magicalDefense: 137, speed: 176 } },
  skillIds: [move.id] });
const row = result => result.outgoing[0];
const hpNature = result => row(result).predictions.find(p => p.upStat === 'hp' && p.downStat === 'speed');
const dice = { dice: [
  { id: 'attack', name: '双攻增加', supported: true, effects: { physicalAttackMultiplier: 1.1 } },
  { id: 'attack-2', name: '另一项双攻增加', supported: true, effects: { physicalAttackMultiplier: 1.2 } },
  { id: 'attack-power', name: '明确合计数值夹具', supported: true, effects: { physicalAttackMultiplier: 1.1, skillPowerAdd: 40 } },
  { id: 'unknown', name: '未知事件', supported: false, effects: {}, unsupportedReason: '回合事件尚未适配。' },
  ...[[7, 'super-effective', 2.5], [8, 'resistance', .4], [14, 'super-effective', 3.5], [15, 'resistance', .25]]
    .map(([gameEffectId, relation, value]) => ({ id: `game-dice-effect-${gameEffectId}`, gameEffectId,
      name: relation === 'resistance' ? '抵抗' : '克制', supported: false, effects: {}, typeCoefficient: { relation, value } })),
] };
const preview = (x, data = catalog, effects = dice) => previewMatchup(x, data, effects);

test.each(['wildAttackRaceStats', 'wildDefenseRaceStats'])('missing %s blocks only its damage direction during dice integration', field => {
  const x = input(), data = structuredClone(catalog);
  delete data.spirits.find(spirit => spirit.id === x.targetId)[field];
  x.incomingSkillId = move.id;
  const result = preview(x, data);
  assert.equal(result.outgoing[0].status, field === 'wildDefenseRaceStats' ? 'unsupported' : 'estimated');
  assert.equal(result.incoming.status, field === 'wildAttackRaceStats' ? 'unsupported' : 'estimated');
  assert.ok(result.targetHpRange.min > 0);
});

test('known attack and defense dice preserve automatic/manual 48.4 -> 49 rounding', () => {
  const x = input();
  x.ownDiceEffects = { physicalAttackMultiplier: 1.1 };
  x.targetDiceEffects = { physicalDefenseMultiplier: 1.25 };
  const automatic = preview(x);
  assert.equal(row(automatic).displayedPower, 48.4);
  assert.equal(hpNature(automatic).damage, 49);
  x.skillOverrides = { [move.id]: { displayedPower: 48.4 } };
  assert.deepEqual(row(preview(x)).predictions.map(p => p.damage), row(automatic).predictions.map(p => p.damage));
});

test('already-included integer combat panel skips stat dice but keeps flat and reported power effects', () => {
  const x = input();
  x.ownDiceIds = ['attack-power'];
  x.profile.panel.physicalAttack = 343;
  x.profile.panelIncludesDice = true;
  const result = preview(x);
  assert.equal(result.status, 'estimated');
  assert.equal(result.ownPanel.physicalAttack, 343);
  assert.equal(row(result).displayedPower, 104.5);
  assert.equal(result.panelIncludesDice, true);
  assert.equal(result.diceApplication.ownPanel, 'already-included');
  assert(result.warnings.some(value => /已含.*不重复/.test(value)));
  const plain = input();
  plain.profile.panel.physicalAttack = 343;
  plain.ownDiceEffects = { skillPowerAdd: 40 };
  assert.deepEqual(row(result).predictions.map(p => p.damage), row(preview(plain)).predictions.map(p => p.damage));
});

test('not-included panel still applies the known multiplier once and reports its mode', () => {
  const x = input();
  x.ownDiceIds = ['attack'];
  const result = preview(x);
  assert.equal(result.ownPanel.physicalAttack, 312 * 1.1);
  assert.equal(row(result).displayedPower, 60.5);
  assert.equal(result.panelIncludesDice, false);
  assert.equal(result.diceApplication.ownPanel, 'apply-selected-effects');
});

test('base and already-included integer panel report the same dice power without applying attack twice', () => {
  const x = input();
  x.ownDiceIds = ['attack'];
  const base = preview(x);
  x.profile.panel.physicalAttack = 343;
  x.profile.panelIncludesDice = true;
  const included = preview(x);
  assert.equal(row(base).displayedPower, 60.5);
  assert.equal(row(included).displayedPower, 60.5);
  assert.equal(hpNature(base).damage, 62);
  assert.equal(hpNature(included).damage, 62);
  assert.equal(hpNature(included).attackerStat, 343);
});

test('included combat panel plus displayed power rejects ambiguous encoded attack/defense', () => {
  const x = input();
  x.profile.panelIncludesDice = true;
  x.profile.panel.physicalAttack = 343;
  x.ownDiceIds = ['attack'];
  x.skillOverrides = { [move.id]: { displayedPower: 60.5 } };
  assert.equal(row(preview(x)).status, 'unsupported');
  assert.match(row(preview(x)).reason, /显示威力.*已含.*基础面板/);
  x.ownDiceIds = [];
  x.ownDiceEffects = { physicalDefenseMultiplier: 1.25 };
  x.incomingSkillId = move.id;
  x.incomingOverrides = { displayedPower: 44 };
  assert.equal(preview(x).incoming.status, 'unsupported');
  assert.match(preview(x).incoming.reason, /显示威力.*已含.*基础面板/);
});

test('included panel flag does not reject displayed power when only unrelated stats change', () => {
  const x = input();
  x.profile.panelIncludesDice = true;
  x.ownDiceEffects = { magicalAttackMultiplier: 1.3, hpMultiplier: 1.3 };
  x.skillOverrides = { [move.id]: { displayedPower: 55 } };
  const result = preview(x);
  assert.equal(row(result).status, 'estimated');
  assert.equal(result.ownPanel.hp, 403);
  assert.equal(result.ownPanel.magicalAttack, 136);
});

test('included own defense stays unchanged for incoming damage without suppressing enemy dice', () => {
  const x = input();
  x.incomingSkillId = move.id;
  x.profile.panelIncludesDice = true;
  x.ownDiceEffects = { physicalDefenseMultiplier: 1.25 };
  const plain = input();
  plain.incomingSkillId = move.id;
  const baseline = preview(plain);
  const included = preview(x);
  assert.equal(included.ownPanel.physicalDefense, 183);
  assert.deepEqual(included.incoming.predictions.map(p => p.damage), baseline.incoming.predictions.map(p => p.damage));
  assert.equal(included.incoming.displayedPower, baseline.incoming.displayedPower / 1.25);
  x.targetDiceEffects = { physicalAttackMultiplier: 1.1, physicalDefenseMultiplier: 1.25 };
  const enemyBoosted = preview(x);
  assert(enemyBoosted.incoming.predictions[0].damage > included.incoming.predictions[0].damage);
  assert(row(enemyBoosted).predictions[0].defenderDefense > row(included).predictions[0].defenderDefense);
});

test('original all-stat effect applies five stats, not HP, and remains visibly trial-only', () => {
  const originalDice = JSON.parse(readFileSync('public/tools/s5-nature/data/dice.json', 'utf8'));
  const x = input();
  x.ownDiceIds = ['game-dice-effect-19'];
  const result = preview(x, catalog, originalDice);
  assert.equal(result.status, 'estimated');
  assert.equal(result.ownPanel.hp, 403);
  for (const stat of ['physicalAttack', 'magicalAttack', 'physicalDefense', 'magicalDefense', 'speed']) {
    assert.equal(result.ownPanel[stat], x.profile.panel[stat] * 1.3);
  }
  assert(result.warnings.some(value => /原包.*试算/.test(value)));
  assert.equal(result.calibrationStatus, 'unverified');
});

test.each([null, 1, 'true', {}, []].map(value => ({ value })))('invalid panelIncludesDice flag $value is rejected', ({ value }) => {
  const x = input();
  x.profile.panelIncludesDice = value;
  assert.equal(preview(x).status, 'unsupported');
  assert.match(preview(x).reason, /panelIncludesDice.*布尔/);
});

test('single-side duplicate IDs deduplicate but different dice cannot multiply silently', () => {
  const x = input();
  x.ownDiceIds = ['attack', 'attack', 'none'];
  assert.equal(preview(x).ownPanel.physicalAttack, 312 * 1.1);
  x.ownDiceIds = ['attack', 'attack-2'];
  assert.equal(preview(x).status, 'unsupported');
  assert.match(preview(x).reason, /一个.*合计/);
  delete x.ownDiceIds;
  x.targetDiceIds = ['attack', 'attack-2'];
  assert.equal(preview(x).status, 'unsupported');
});

test('preset plus non-neutral manual effects requires a single explicit total', () => {
  const x = input();
  x.ownDiceIds = ['attack'];
  x.ownDiceEffects = { physicalAttackMultiplier: 1.2 };
  assert.equal(preview(x).status, 'unsupported');
  assert.match(preview(x).reason, /预设.*合计/);
  x.ownDiceEffects = { physicalAttackMultiplier: 1, skillPowerAdd: 0 };
  assert.equal(preview(x).status, 'estimated');
  x.ownDiceIds = ['none'];
  x.ownDiceEffects = { physicalAttackMultiplier: 1.32 };
  assert.equal(preview(x).ownPanel.physicalAttack, 411.84000000000003);
});

function typedInput(targetTypes = ['plain']) {
  const x = input();
  const data = structuredClone(catalog);
  data.spirits.find(p => p.id === x.profile.spiritId).types = ['plain'];
  data.spirits.find(p => p.id === x.targetId).types = targetTypes;
  data.skills.find(p => p.id === move.id).type = 'plain';
  data.typeChart = { types: ['plain', 'resist', 'weak', 'immune'], matrix: [
    [1, .5, 2, 0], [1, 1, 1, 1], [1, 1, 1, 1], [1, 1, 1, 1],
  ] };
  return { x, data };
}

test.each([7, 8, 14, 15])('known type coefficient %i is recorded without changing pure-neutral damage', gameEffectId => {
  const { x, data } = typedInput();
  const baseline = preview(x, data);
  x.ownDiceIds = [`game-dice-effect-${gameEffectId}`];
  const result = preview(x, data);
  assert.equal(row(result).status, 'estimated');
  assert.deepEqual(row(result).predictions.map(p => p.damage), row(baseline).predictions.map(p => p.damage));
  assert(result.warnings.some(value => /系数.*未.*验证/.test(value)));
  assert.equal(result.diceApplication.typeCoefficientEffects[0].gameEffectId, gameEffectId);
});

test.each([['resist'], ['weak'], ['resist', 'weak']].map(types => ({ types })))('type dice reject non-neutral factors $types in auto and displayed paths', ({ types }) => {
  const { x, data } = typedInput(types);
  x.targetDiceIds = ['game-dice-effect-8'];
  for (const displayed of [false, true]) {
    if (displayed) x.skillOverrides = { [move.id]: { displayedPower: 27.5 } };
    const entry = row(preview(x, data));
    assert.equal(entry.status, 'unsupported');
    assert.match(entry.reason, /骰子.*极化.*钝化.*未.*验证/);
  }
});

test('type dice never turn immunity into damage, even with a nonzero displayed override', () => {
  const { x, data } = typedInput(['immune', 'weak']);
  x.ownDiceIds = ['game-dice-effect-8'];
  for (const displayed of [false, true]) {
    if (displayed) x.skillOverrides = { [move.id]: { displayedPower: 55 } };
    const entry = row(preview(x, data));
    assert.equal(entry.status, 'estimated');
    assert.equal(entry.displayedPower, 0);
    assert(entry.predictions.every(p => p.damage === 0));
  }
});

test('legacy final-power input bypasses unresolved type correction but never claims it verified', () => {
  const { x, data } = typedInput(['resist']);
  x.ownDiceIds = ['game-dice-effect-8'];
  x.skillOverrides = { [move.id]: { effectivePower: 20 } };
  const result = preview(x, data);
  assert.equal(row(result).status, 'estimated');
  assert.equal(row(result).effectivePower, 20);
  assert.equal(row(result).typeInteraction.formulaVerified, false);
  assert.match(row(result).reason, /最终威力.*未.*验证/);
  assert.equal(result.calibrationStatus, 'unverified');
});

test('incoming type dice use the same gate and unsupported events remain explicit', () => {
  const { x, data } = typedInput();
  data.spirits.find(p => p.id === x.profile.spiritId).types = ['resist'];
  x.incomingSkillId = move.id;
  x.ownDiceIds = ['game-dice-effect-8'];
  assert.equal(preview(x, data).incoming.status, 'unsupported');
  x.ownDiceIds = ['unknown'];
  const result = preview(x, data);
  assert.equal(result.status, 'unsupported');
  assert.match(result.reason, /回合事件尚未适配/);
});

test.each([
  { gameEffectId: 999, typeCoefficient: { relation: 'resistance', value: .4 } },
  { gameEffectId: 8, typeCoefficient: { relation: 'resistance', value: .6 } },
  { gameEffectId: 8, typeCoefficient: { relation: 'super-effective', value: .4 } },
  { gameEffectId: 8, typeCoefficient: { relation: 'resistance', value: .4 }, effects: { skillPowerAdd: 999 } },
])('unrecognized type coefficient descriptor cannot enable unsupported effects %j', changes => {
  const { x, data } = typedInput();
  const effects = structuredClone(dice);
  Object.assign(effects.dice.find(p => p.id === 'game-dice-effect-8'), changes);
  x.ownDiceIds = ['game-dice-effect-8'];
  assert.equal(preview(x, data, effects).status, 'unsupported');
});
