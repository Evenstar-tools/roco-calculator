import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { previewMatchup } from '../../public/tools/s5-nature/matchup-preview.mjs';
import { calculableDiceRecords, normalizeDiceSettings, validatePreviewSettings } from '../../public/tools/s5-nature/matchup-ui.mjs';

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

const sourceDice = JSON.parse(readFileSync('public/tools/s5-nature/data/dice.json', 'utf8'));
test('dice menu keeps only damage/HP effects, including resistance, without deleting source records', () => {
  assert.deepEqual(calculableDiceRecords(sourceDice).map(row => row.gameEffectId).sort((a,b) => a-b),
    [1, 2, 3, 7, 8, 11, 12, 13, 14, 15, 17, 19, 33, 35, 37]);
  assert.equal(sourceDice.dice.filter(row => Number.isInteger(row.gameEffectId)).length, 40);
  for (const selected of calculableDiceRecords(sourceDice)) {
    for (const side of ['ownDiceIds', 'targetDiceIds']) {
      const x = input(); x[side] = [selected.id]; x.incomingSkillId = move.id;
      const result = preview(x, catalog, sourceDice);
      assert.equal(result.status, 'estimated', `${side}: ${selected.name}`);
      assert.ok(result.targetHpRange.min > 0);
      assert.ok(result.outgoing[0].predictions.every(p => Number.isInteger(p.damage)));
      assert.ok(result.incoming.predictions.every(p => Number.isInteger(p.damage)));
    }
  }
});

test('old unsupported dice and remembered selections cannot blank calculations after reload or import', () => {
  const observations = { 0: { damage: 311, remainingPercent: 27 } };
  const session = { profiles: [
    { name: '圣代甜甜', preview: { diceId: 'game-dice-effect-18', diceLast: 'game-dice-effect-18', observed: observations } },
    { name: '迪莫', preview: { diceId: 'unresolved-all-stats-plus-30', diceLast: 'game-dice-effect-36' } },
  ], preview: { diceId: 'game-dice-effect-4', diceLast: 'game-dice-effect-4', incomingDamages: [24, 7] } };
  validatePreviewSettings(session);
  const cleanup = normalizeDiceSettings(session, sourceDice);
  assert.equal(cleanup.changed, true);
  assert.equal(cleanup.removed.length, 3);
  for (const holder of [...session.profiles.map(p => p.preview), session.preview]) {
    assert.equal(holder.diceId, 'none'); assert.equal(holder.diceLast, 'none');
  }
  assert.deepEqual(session.profiles[0].preview.observed, observations);
  assert.deepEqual(session.preview.incomingDamages, [24, 7]);
  assert.deepEqual(normalizeDiceSettings(JSON.parse(JSON.stringify(session)), sourceDice), { changed: false, removed: [] });
});

test('supported dice and custom combat stats survive migration; old power alias keeps its exact effect', () => {
  const session = { profiles: [
    { preview: { diceId: 'manual-power-plus-40', diceLast: 'manual-power-plus-40' } },
    { preview: { diceId: 'custom', diceEffects: { physicalAttackMultiplier: 1.1, speedMultiplier: 1.5 } } },
  ], preview: { diceId: 'game-dice-effect-8', diceLast: 'game-dice-effect-15' } };
  validatePreviewSettings(session);
  normalizeDiceSettings(session, sourceDice);
  assert.equal(session.profiles[0].preview.diceId, 'game-dice-effect-17');
  assert.equal(session.profiles[0].preview.diceLast, 'game-dice-effect-17');
  assert.deepEqual(session.profiles[1].preview.diceEffects, { physicalAttackMultiplier: 1.1 });
  assert.deepEqual(session.preview, { diceId: 'game-dice-effect-8', diceLast: 'game-dice-effect-15' });
  validatePreviewSettings(session);
});

test('an unavailable dice catalog never erases stored choices; a migrated speed-only custom dice switches off', () => {
  const session = { profiles: [{ preview: { diceId: 'game-dice-effect-17' } }],
    preview: { diceId: 'custom', diceLast: 'custom', diceEffects: { speedMultiplier: 1.5 } } };
  const original = structuredClone(session);
  assert.deepEqual(normalizeDiceSettings(session, { dice: [] }), { changed: false, removed: [] });
  assert.deepEqual(session, original);
  normalizeDiceSettings(session, sourceDice);
  assert.equal(session.profiles[0].preview.diceId, 'game-dice-effect-17');
  assert.deepEqual(session.preview, { diceId: 'none', diceLast: 'none', diceEffects: {} });
  const freshCustom = { profiles: [{ preview: { diceId: 'custom', diceEffects: {} } }] };
  assert.deepEqual(normalizeDiceSettings(freshCustom, sourceDice), { changed: false, removed: [] });
});

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

test('base panel stays unchanged while the attack dice enters the combat stage once', () => {
  const x = input();
  x.ownDiceIds = ['attack'];
  const result = preview(x);
  assert.equal(result.ownPanel.physicalAttack, 312);
  assert.equal(hpNature(result).attackerStat, 312);
  assert.equal(row(result).displayedPower, 60.5);
  assert.equal(result.panelIncludesDice, false);
  assert.equal(result.diceApplication.ownPanel, 'base-with-battle-hp');
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
  assert.equal(row(enemyBoosted).predictions[0].defenderDefense, row(included).predictions[0].defenderDefense);
  assert(row(enemyBoosted).displayedPower < row(included).displayedPower);
});

test('all-stat dice preserve the base combat stats and apply attack and defense stages', () => {
  const originalDice = JSON.parse(readFileSync('public/tools/s5-nature/data/dice.json', 'utf8'));
  const x = input();
  x.ownDiceIds = ['game-dice-effect-19'];
  x.incomingSkillId = move.id;
  const result = preview(x, catalog, originalDice);
  assert.equal(result.status, 'estimated');
  assert.equal(result.ownPanel.hp, 403);
  for (const stat of ['physicalAttack', 'magicalAttack', 'physicalDefense', 'magicalDefense']) {
    assert.equal(result.ownPanel[stat], x.profile.panel[stat]);
  }
  assert.equal(result.ownPanel.speed, x.profile.panel.speed);
  assert.equal(hpNature(result).attackerStat, 312);
  assert.equal(row(result).displayedPower, 71.5);
  assert.equal(result.incoming.predictions[0].defenderDefense, 183);
  assert.ok(Math.abs(result.incoming.displayedPower - 27.5 / 1.3) < 1e-9);
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
  assert.equal(preview(x).ownPanel.physicalAttack, 312);
  assert.equal(hpNature(preview(x)).attackerStat, 312);
  assert.equal(row(preview(x)).displayedPower, 60.5);
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
  assert.equal(preview(x).ownPanel.physicalAttack, 312);
  assert.equal(hpNature(preview(x)).attackerStat, 312);
  assert.equal(row(preview(x)).displayedPower, 72.6);
});

function typedInput(targetTypes = ['plain']) {
  const x = input();
  const data = structuredClone(catalog);
  data.spirits.find(p => p.id === x.profile.spiritId).types = ['plain'];
  data.spirits.find(p => p.id === x.targetId).types = targetTypes;
  data.skills.find(p => p.id === move.id).type = 'plain';
  data.typeChart = { types: ['plain', 'resist', 'weak', 'immune', 'resist2', 'weak2'], matrix: [
    [1, .5, 2, 0, .5, 2], ...Array.from({ length: 5 }, () => Array(6).fill(1)),
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

test.each([['resist', 'resist2'], ['weak', 'weak2'], ['resist', 'weak']].map(types => ({ types })))('type dice keep composite factors $types explicit in auto and displayed paths', ({ types }) => {
  const { x, data } = typedInput(types);
  x.targetDiceIds = ['game-dice-effect-8'];
  for (const displayed of [false, true]) {
    if (displayed) x.skillOverrides = { [move.id]: { displayedPower: 27.5 } };
    const entry = row(preview(x, data));
    assert.equal(entry.status, 'unsupported');
    assert.match(entry.reason, /骰子.*极化.*钝化.*未.*验证/);
  }
});

test.each([[8, .4], [15, .25]])('defending resistance dice %i replace the base relation once in both power modes', (id, factor) => {
  const { x, data } = typedInput(['resist']);
  x.targetDiceIds = [`game-dice-effect-${id}`];
  const automatic = row(preview(x, data));
  assert.equal(automatic.status, 'estimated');
  assert.equal(automatic.displayedPower, 55 * 2 * factor);
  assert.equal(automatic.effectivePower, 55 * 2 * factor * 1.8);
  assert.equal(automatic.typeInteraction.diceBaseMultiplier, factor);
  assert.equal(automatic.typeInteraction.appliedDiceEffects[0].side, '敌方');
  assert.equal(automatic.typeInteraction.formulaVerified, false);
  x.skillOverrides = { [move.id]: { displayedPower: automatic.displayedPower } };
  const manual = row(preview(x, data));
  assert.equal(manual.effectivePower, automatic.effectivePower);
  assert.deepEqual(manual.predictions.map(p => p.damage), automatic.predictions.map(p => p.damage));
  // A second, neutral defending type does not create a composite relationship.
  data.spirits.find(p => p.id === x.targetId).types.push('plain');
  assert.equal(row(preview(x, data)).effectivePower, automatic.effectivePower);
});

test.each([[7, 2.5], [14, 3.5]])('attacking super-effective dice %i replace 2 without clamping the new coefficient', (id, factor) => {
  const { x, data } = typedInput(['weak']);
  x.ownDiceIds = [`game-dice-effect-${id}`];
  const result = row(preview(x, data));
  assert.equal(result.status, 'estimated');
  assert.equal(result.displayedPower, 55 * 2 * factor);
  assert.equal(result.effectivePower, 55 * 2 * factor * 1.8);
  assert.equal(result.typeInteraction.appliedDiceEffects[0].side, '我方');
});

test('own resistance and enemy offense dice do not modify the wrong damage direction', () => {
  const { x, data } = typedInput(['resist']);
  const baseline = row(preview(x, data));
  x.ownDiceIds = ['game-dice-effect-8'];
  x.targetDiceIds = ['game-dice-effect-7'];
  const result = row(preview(x, data));
  assert.equal(result.status, 'estimated');
  assert.equal(result.effectivePower, baseline.effectivePower);
  assert.equal(result.typeInteraction.appliedDiceEffects.length, 0);
});

test('both relevant type dice keep their unverified interaction explicit', () => {
  const { x, data } = typedInput(['resist']);
  x.ownDiceIds = ['game-dice-effect-7'];
  x.targetDiceIds = ['game-dice-effect-8'];
  assert.equal(row(preview(x, data)).status, 'unsupported');
});

test('incoming resistance dice use the defending own side and existing dulling once', () => {
  const { x, data } = typedInput();
  data.spirits.find(p => p.id === x.profile.spiritId).types = ['resist'];
  x.incomingSkillId = move.id;
  x.ownDiceIds = ['game-dice-effect-8'];
  const result = preview(x, data).incoming;
  assert.equal(result.status, 'estimated');
  assert.equal(result.displayedPower, 55 * 1.25 * .4);
  assert.equal(result.effectivePower, 55 * 1.25 * .4 * .6);
  assert.equal(result.typeInteraction.appliedDiceEffects[0].side, '我方');
  x.incomingOverrides = { displayedPower: result.displayedPower };
  assert.equal(preview(x, data).incoming.effectivePower, result.effectivePower);
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

test('incoming composite type dice keep the same boundary and unsupported events remain explicit', () => {
  const { x, data } = typedInput();
  data.spirits.find(p => p.id === x.profile.spiritId).types = ['resist', 'resist2'];
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
