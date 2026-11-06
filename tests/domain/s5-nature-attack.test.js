import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { previewMatchup } from '../../public/tools/s5-nature/matchup-preview.mjs';
import { wildPanel, predictObservation } from '../../public/tools/s5-nature/engine.mjs';
import { calculateWildAttack, WILD_ATTACK_MODEL } from '../../public/tools/s5-nature/wild-attack.mjs';

const read = name => JSON.parse(readFileSync(`public/tools/s5-nature/data/${name}.json`, 'utf8'));
const catalog = read('catalog'), dice = read('dice'), mapping = read('wild-attack-races');
const species = name => catalog.spirits.find(row => row.name === name);
const skill = name => catalog.skills.find(row => row.name === name);
const natureFor = (stat, direction) => catalog.natures.find(row => direction === 'up'
  ? row.upStat === stat && row.downStat === 'speed'
  : direction === 'down' ? row.upStat === 'speed' && row.downStat === stat
    : row.upStat === 'hp' && row.downStat === 'speed');
const inputFor = (name, level) => ({ targetId: species(name).id, level,
  profile: { id: 'own', spiritId: species('罗隐').id, level: 60, awakening: 0,
    panel: { hp: 403, physicalAttack: 312, magicalAttack: 136, physicalDefense: 216, magicalDefense: 163, speed: 143 } },
  skillIds: [skill('火焰切割').id], ownDiceIds: [], targetDiceIds: [] });

test('whale author table replays all 30 readings through automatic and explicit-condition preview paths', () => {
  // BV1WE4a6eE8p author table, transcribed in whale-dimo-cli.mjs/.txt.
  // Water cannon/Heavenly Flood only change energy cost after this hit. Spring
  // uses its unchanged-energy-cost case. These retain the explicit-power path;
  // their unsupported flags are never promoted by this test.
  const conditionalPower = { 水炮: 137.5, 天洪: 187.5, 涌泉: 112.5 };
  const groups = [
    [41, 'neutral', { 甩水: 41, 水弹枪: 111, 音爆: 144, 水炮: 153, 激流: 167, 天洪: 209 }],
    [41, 'up', { 甩水: 45, 水弹枪: 121, 音爆: 158, 激流: 182 }],
    [42, 'neutral', { 甩水: 42, 水弹枪: 114, 涌泉: 128, 水炮: 156, 音爆: 148, 激流: 171, 天洪: 214 }],
    [42, 'up', { 甩水: 46, 音爆: 161, 水炮: 171 }],
    [43, 'neutral', { 甩水: 44, 气泡: 147, 音爆: 153, 激流: 176, 天洪: 220 }],
    [43, 'up', { 甩水: 48, 气泡: 160, 音爆: 166 }],
    [43, 'down', { 气泡: 133, 音爆: 139 }],
  ];
  let count = 0, automatic = 0;
  for (const [level, direction, observations] of groups) for (const [name, observed] of Object.entries(observations)) {
    const input = inputFor('深蓝鲸', level), selected = skill(name);
    input.profile.spiritId = species('迪莫').id;
    input.profile.awakening = 5;
    input.incomingSkillId = selected.id;
    const manual = Object.hasOwn(conditionalPower, name);
    assert.equal(selected.supported, !manual, name);
    if (manual) input.incomingOverrides = { effectivePower: conditionalPower[name] };
    const entry = previewMatchup(input, catalog, dice).incoming;
    assert.equal(entry.status, 'estimated', `${level}/${direction}/${name}`);
    assert.equal(entry.manualPower, manual);
    const row = entry.predictions.find(row => row.natureId === natureFor('magicalAttack', direction).id);
    assert.equal(row.damage, observed, `${level}/${direction}/${name}`);
    if (name === '甩水') assert.equal(entry.effectivePower, 37.5);
    count++;
    if (!manual) automatic++;
  }
  assert.equal(count, 30);
  assert.equal(automatic, 23);
  assert.equal(WILD_ATTACK_MODEL.natureRounding, 'round-half-up');
  assert.equal(WILD_ATTACK_MODEL.originalGameFormulaRecovered, false);
  assert.deepEqual(catalog.meta.wildAttackModel, WILD_ATTACK_MODEL);
});

test('wing-dragon records preserve both discrepancies instead of manufacturing exact matches', () => {
  const samples = [[43, 'up', 149, 149], [43, 'neutral', 136, 136],
    [43, 'down', 125, 123], [42, 'up', 145, 146], [42, 'neutral', 133, 133]];
  const mismatches = [];
  for (const [level, direction, observed, expected] of samples) {
    const input = inputFor('小翼龙', level);
    input.incomingSkillId = skill('龙之利爪').id;
    input.incomingOverrides = { effectivePower: 162.5 };
    const row = previewMatchup(input, catalog, dice).incoming.predictions
      .find(row => row.natureId === natureFor('physicalAttack', direction).id);
    assert.equal(row.damage, expected);
    if (row.damage !== observed) mismatches.push({ level, observed, calculated: row.damage });
  }
  assert.deepEqual(mismatches, [{ level: 43, observed: 125, calculated: 123 }, { level: 42, observed: 145, calculated: 146 }]);
});

test('nature is rounded before the growth tail while later dice and effective power retain fractions', () => {
  const up = natureFor('physicalAttack', 'up');
  assert.equal(calculateWildAttack(114, 42, up, 'physicalAttack'), 276);
  assert.equal(calculateWildAttack(50, 41, up, 'physicalAttack'), 146);
  const input = inputFor('小翼龙', 42);
  input.incomingSkillId = skill('龙之利爪').id;
  input.incomingOverrides = { effectivePower: 162.5 };
  input.targetDiceEffects = { physicalAttackMultiplier: 1.1 };
  const entry = previewMatchup(input, catalog, dice).incoming;
  assert.equal(entry.effectivePower, 162.5);
  assert.ok(Math.abs(entry.predictions.find(row => row.natureId === up.id).attackerStat - 303.6) < 1e-9);
});

test('initial forms use package strength-stage 3 attacks and every catalog record has explicit mapping or null', () => {
  for (const [name, id, attack, magic] of [['可爱猿', 3085, 162, 72], ['伊雷龙', 3412, 91, 190],
    ['小翼龙', 3210, 114, 31], ['深蓝鲸', 3381, 44, 121]]) {
    const mapped = species(name).wildAttackRaceStats;
    assert.equal(mapped.attackPetbaseId, id, name);
    assert.equal(mapped.physicalAttack, attack, name);
    assert.equal(mapped.magicalAttack, magic, name);
  }
  assert.equal(species('伊雷龙').wildAttackRaceStats.attackFormName, '伊兰亚龙');
  for (const spirit of catalog.spirits) {
    assert(Object.hasOwn(spirit, 'wildAttackRaceStats'), spirit.name);
    assert.deepEqual(spirit.wildAttackRaceStats, mapping.bySpiritId[spirit.id] ?? null, spirit.name);
    if (spirit.wildAttackRaceStats === null) assert(mapping.missing[spirit.id], spirit.name);
  }
});

test('missing or partial attack mappings never fall back to initial-form attacks', () => {
  const target = species('乐乐鲨'), input = inputFor(target.name, 'all');
  assert.equal(target.wildAttackRaceStats, null);
  input.incomingSkillId = skill('甩水').id;
  const preview = previewMatchup(input, catalog, dice);
  assert.equal(preview.incoming.status, 'unsupported');
  assert.match(preview.incoming.reason, /三阶段双攻资料缺失/);
  assert.equal(preview.outgoing[0].status, 'estimated');
  assert.equal(preview.targetHpByLevel.length, 3);
  const nature = natureFor('magicalAttack', 'up');
  const panel = wildPanel(target.raceStats, 41, nature, { attackRaceStats: null });
  assert.equal(panel.physicalAttack, null);
  assert.equal(panel.magicalAttack, null);
  assert(panel.hp > 0 && panel.physicalDefense > 0);
  const observation = { id: 'incoming', skillId: input.incomingSkillId, profileId: 'own', direction: 'incoming', damage: 1, context: 'clean', reduction: 1 };
  const record = predictObservation({ targetId: target.id, level: 41, profiles: [input.profile] }, observation, nature, catalog);
  assert.equal(record.status, 'blocked');
  assert.match(record.reason, /三阶段双攻资料缺失/);
  assert.throws(() => wildPanel(target.raceStats, 41, nature, { attackRaceStats: { physicalAttack: 114 } }), /攻击种族值/);
});

test('changing target attack races leaves outgoing damage, selected-form HP, defense and own panel intact', () => {
  const input = inputFor('可爱猿', 42), target = species('可爱猿');
  const plain = previewMatchup(input, catalog, dice);
  const hpUp = plain.outgoing[0].predictions.find(row => row.upStat === 'hp' && row.downStat === 'magicalDefense');
  assert.equal(hpUp.damage, 316);
  assert.equal(hpUp.hpMax, 454);
  assert.deepEqual(plain.ownPanel, input.profile.panel);
  const panel = wildPanel(target.raceStats, 42, natureFor('physicalAttack', 'up'), { attackRaceStats: target.wildAttackRaceStats });
  assert.deepEqual([panel.hp, panel.physicalDefense, panel.magicalDefense], [416, 89, 72]);
  const changed = structuredClone(catalog);
  changed.spirits.find(row => row.id === target.id).wildAttackRaceStats = { physicalAttack: 999, magicalAttack: 999 };
  changed.spirits.find(row => row.id === input.profile.spiritId).wildAttackRaceStats = null;
  const replay = previewMatchup(input, changed, dice);
  assert.deepEqual(replay.outgoing, plain.outgoing);
  assert.deepEqual(replay.targetHpByNature, plain.targetHpByNature);
  assert.deepEqual(replay.ownPanel, plain.ownPanel);
});
