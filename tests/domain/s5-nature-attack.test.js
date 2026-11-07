import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { previewMatchup } from '../../public/tools/s5-nature/matchup-preview.mjs';
import { wildPanel, predictObservation } from '../../public/tools/s5-nature/engine.mjs';
import { calculateWildAttack, WILD_ATTACK_MODEL } from '../../public/tools/s5-nature/wild-attack.mjs';
import { resolveAwakeningType } from '../../public/tools/s5-nature/awakening.mjs';

const read = name => JSON.parse(readFileSync(`public/tools/s5-nature/data/${name}.json`, 'utf8'));
const catalog = read('catalog'), dice = read('dice'), mapping = read('wild-attack-races');
const fieldSamples = read('field-samples').entries;
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

test('whale author table replays all 30 readings automatically including conditional damage skills', () => {
  // BV1WE4a6eE8p author table, transcribed in whale-dimo-cli.mjs/.txt.
  // Water cannon/Heavenly Flood only change energy cost after this hit. Spring
  // uses its unchanged-energy-cost case. No manual power is required.
  const groups = [
    [41, 'neutral', { 甩水: 41, 水弹枪: 111, 音爆: 144, 水炮: 153, 激流: 167, 天洪: 209 }],
    [41, 'up', { 甩水: 45, 水弹枪: 121, 音爆: 158, 激流: 182 }],
    [42, 'neutral', { 甩水: 42, 水弹枪: 114, 涌泉: 128, 水炮: 156, 音爆: 148, 激流: 171, 天洪: 214 }],
    [42, 'up', { 甩水: 46, 音爆: 161, 水炮: 171 }],
    [43, 'neutral', { 甩水: 44, 气泡: 147, 音爆: 153, 激流: 176, 天洪: 220 }],
    [43, 'up', { 甩水: 48, 气泡: 160, 音爆: 166 }],
    [43, 'down', { 气泡: 133, 音爆: 139 }],
  ];
  let count = 0;
  for (const [level, direction, observations] of groups) for (const [name, observed] of Object.entries(observations)) {
    const input = inputFor('深蓝鲸', level), selected = skill(name);
    input.profile.spiritId = species('迪莫').id;
    input.profile.awakening = 5;
    input.incomingSkillId = selected.id;
    const entry = previewMatchup(input, catalog, dice).incoming;
    assert.equal(entry.status, 'estimated', `${level}/${direction}/${name}`);
    assert.equal(entry.manualPower, false);
    const row = entry.predictions.find(row => row.natureId === natureFor('magicalAttack', direction).id);
    assert.equal(row.damage, observed, `${level}/${direction}/${name}`);
    if (name === '甩水') assert.equal(entry.effectivePower, 37.5);
    count++;
  }
  assert.equal(count, 30);
  assert.equal(WILD_ATTACK_MODEL.natureRounding, 'round-half-up');
  assert.equal(WILD_ATTACK_MODEL.originalGameFormulaRecovered, false);
  assert.deepEqual(catalog.meta.wildAttackModel, WILD_ATTACK_MODEL);
});

test('five wing-dragon claw readings use selected-form stage2 attack including final rounding', () => {
  const samples = [[43, 'up', 149], [43, 'neutral', 136],
    [43, 'down', 125], [42, 'up', 145], [42, 'neutral', 133]];
  for (const [level, direction, observed] of samples) {
    const input = inputFor('小翼龙', level);
    input.incomingSkillId = skill('龙之利爪').id;
    input.incomingOverrides = { effectivePower: 162.5 };
    const row = previewMatchup(input, catalog, dice).incoming.predictions
      .find(row => row.natureId === natureFor('physicalAttack', direction).id);
    assert.equal(row.damage, observed, `${level}/${direction}`);
  }
});

test('nature is rounded before the growth tail while later dice and effective power retain fractions', () => {
  const up = natureFor('physicalAttack', 'up');
  assert.equal(calculateWildAttack(114, 42, up, 'physicalAttack', 3), 276);
  assert.equal(calculateWildAttack(50, 41, up, 'physicalAttack', 3), 146);
  assert.equal(calculateWildAttack(91, 42, up, 'physicalAttack', 2), 274);
  const input = inputFor('小翼龙', 42);
  input.incomingSkillId = skill('龙之利爪').id;
  input.incomingOverrides = { effectivePower: 162.5 };
  input.targetDiceEffects = { physicalAttackMultiplier: 1.1 };
  const entry = previewMatchup(input, catalog, dice).incoming;
  assert.equal(entry.effectivePower, 162.5);
  assert.ok(Math.abs(entry.predictions.find(row => row.natureId === up.id).attackerStat - 301.4) < 1e-9);
});

test('43 ilei roar at MD137 and +30% attack reproduces660 without doubling a displayed-power bonus', () => {
  const target = species('伊雷龙'), input = inputFor(target.name, 43);
  input.profile.awakening = 5;
  input.profile.panel.magicalDefense = 137;
  input.targetDiceEffects = { magicalAttackMultiplier: 1.3 };
  input.incomingSkillId = skill('升龙咆哮').id;
  const automatic = previewMatchup(input, catalog, dice).incoming;
  const explicit = previewMatchup({ ...input, incomingOverrides: { displayedPower: 325 } }, catalog, dice).incoming;
  for (const [direction, expected] of [['neutral', 660], ['up', 721], ['down', 599]]) {
    const nature = natureFor('magicalAttack', direction);
    for (const entry of [automatic, explicit]) {
      assert.equal(entry.status, 'estimated');
      assert.equal(entry.predictions.find(row => row.natureId === nature.id).damage, expected, direction);
    }
  }
  const neutral = natureFor('magicalAttack', 'neutral');
  const panel = wildPanel(target.raceStats, 43, neutral, {
    attackRaceStats: target.wildAttackRaceStats, strengthStage: target.wildStrengthStage,
  });
  assert.equal(panel.magicalAttack, 389);
  // The record solver accepts simple neutral hits, so verify the same attack
  // through 角击 without a dice modifier or an unsupported charged-skill record.
  const plain = { ...input, targetDiceEffects: {}, incomingSkillId: skill('角击').id };
  const preview = previewMatchup(plain, catalog, dice).incoming.predictions.find(row => row.natureId === neutral.id);
  const observation = { id: 'ilei-horn', skillId: plain.incomingSkillId, profileId: 'own',
    direction: 'incoming', damage: 203, context: 'clean', reduction: 1 };
  const record = predictObservation({ targetId: target.id, level: 43, profiles: [plain.profile] }, observation, neutral, catalog);
  assert.equal(preview.damage, 203);
  assert.equal(record.status, 'used', record.reason);
  assert.equal(record.damage, preview.damage);
  assert.equal(record.compatible, true);
});

// Reuse the preserved user-image rows. Their zero-star/zero-defense-IV receiver
// is replayed at explicit L60/neutral PD108, MD124; that panel was not present in
// the original image. "not-up" is neutral only for this conditional replay.
function replayImageSample(sample) {
  const target = catalog.spirits.find(row => row.id === sample.targetId);
  const input = inputFor(target.name, sample.level);
  input.profile.spiritId = species('嘟嘟锅').id;
  input.profile.panel.physicalDefense = 108;
  input.profile.panel.magicalDefense = 124;
  input.skillIds = [];
  input.incomingSkillId = sample.skillId;
  if (sample.skillName === '突袭') input.incomingOverrides = { powerMultiplier: 3 };
  const entry = previewMatchup(input, catalog, dice).incoming;
  assert.equal(entry.status, 'estimated', `${sample.id}: ${entry.reason}`);
  const nature = natureFor(sample.stat, sample.label === 'not-up' ? 'neutral' : sample.label);
  return entry.predictions.find(row => row.natureId === nature.id).damage;
}

test('all13 historical ilei readings share the explicit MD124 receiver under stage2', () => {
  const samples = fieldSamples.filter(row => row.id.startsWith('image-1-elan-magical-'));
  assert.equal(samples.length, 13);
  for (const sample of samples) assert.equal(replayImageSample(sample), sample.damage, sample.id);
});

test('stage1 ape replays seven readings while retaining the unresolved image rows and skill identity', () => {
  const ape = fieldSamples.filter(row => row.id.startsWith('image-3-ape-physical-'));
  const matched = ape.filter(row => row.skillId && row.skillName !== '炎息');
  assert.equal(matched.length, 7);
  for (const sample of matched) assert.equal(replayImageSample(sample), sample.damage, sample.id);
  const unresolved = [
    ['image-1-wing-physical-01-damage-5', 187, 205],
    ['image-1-wing-physical-06-damage-1', 251, 256],
    ['image-3-ape-physical-04-damage-3', 88, 97],
  ];
  for (const [id, observed, predicted] of unresolved) {
    const sample = fieldSamples.find(row => row.id === id);
    assert.equal(sample.damage, observed, 'preserve the recorded value');
    assert.equal(replayImageSample(sample), predicted, id);
    assert.notEqual(predicted, observed, 'do not relabel or override unresolved readings');
  }
  assert.equal(ape.find(row => row.skillName === '先发').skillId, null);
});

test('four saved incoming hits share the resisted .6 fit with native-stage attacks', () => {
  const fixture = JSON.parse(readFileSync('tests/fixtures/s5-stage-incoming-samples.json', 'utf8'));
  assert.equal(fixture.rows.length, 4);
  for (const sample of fixture.rows) {
    const entry = previewMatchup(sample.previewInput, catalog).incoming;
    assert.equal(entry.status, 'estimated', sample.id);
    const row = entry.predictions.find(item => item.natureName === sample.nature);
    assert.equal(row.attackerStat, sample.newAttack, sample.id);
    assert.equal(row.damage, sample.observed, sample.id);
    assert.equal(entry.typeInteraction.correctionMultiplier, .6);
    assert.equal(entry.typeInteraction.approximate, true);
    assert.equal(entry.typeInteraction.formulaVerified, false);
    assert.equal(sample.observedDynamicPower, null, 'preserve the missing runtime-power field');
    assert(sample.pointer.startsWith('/events/'));
  }
  assert.equal(resolveAwakeningType(2, 0, 5).correctionMultiplier, .72);
  assert.equal(resolveAwakeningType(1, 0, 5).correctionMultiplier, 1);
});

test('evolved attack mappings remain explicit provenance, without replacing selected-form attack races', () => {
  for (const [name, id, attack, magic] of [['可爱猿', 3085, 162, 72], ['伊雷龙', 3412, 91, 190],
    ['小翼龙', 3210, 114, 31], ['深蓝鲸', 3381, 44, 121]]) {
    const mapped = species(name).wildAttackRaceStats;
    assert.equal(mapped.attackPetbaseId, id, name);
    assert.equal(mapped.physicalAttack, attack, name);
    assert.equal(mapped.magicalAttack, magic, name);
  }
  assert.equal(species('伊雷龙').wildAttackRaceStats.attackFormName, '伊兰亚龙');
  assert.equal(species('伊雷龙').raceStats.magicalAttack, 152);
  assert.equal(WILD_ATTACK_MODEL.raceSource, 'selected-form');
  for (const spirit of catalog.spirits) {
    assert(Object.hasOwn(spirit, 'wildAttackRaceStats'), spirit.name);
    assert.deepEqual(spirit.wildAttackRaceStats, mapping.bySpiritId[spirit.id] ?? null, spirit.name);
    if (spirit.wildAttackRaceStats === null) assert(mapping.missing[spirit.id], spirit.name);
  }
});

test('missing or partial attack mappings never fall back to initial-form attacks', () => {
  const target = species('乐乐鲨'), input = inputFor(target.name, 'all');
  const missingCatalog = structuredClone(catalog);
  missingCatalog.spirits.find(row => row.id === target.id).wildAttackRaceStats = null;
  input.incomingSkillId = skill('甩水').id;
  const preview = previewMatchup(input, missingCatalog, dice);
  assert.equal(preview.incoming.status, 'unsupported');
  assert.match(preview.incoming.reason, /攻击来源资料缺失/);
  assert.equal(preview.outgoing[0].status, 'estimated');
  assert.equal(preview.targetHpByLevel.length, 3);
  const nature = natureFor('magicalAttack', 'up');
  const panel = wildPanel(target.raceStats, 41, nature, { attackRaceStats: null });
  assert.equal(panel.physicalAttack, null);
  assert.equal(panel.magicalAttack, null);
  assert(panel.hp > 0 && panel.physicalDefense > 0);
  const observation = { id: 'incoming', skillId: input.incomingSkillId, profileId: 'own', direction: 'incoming', damage: 1, context: 'clean', reduction: 1 };
  const record = predictObservation({ targetId: target.id, level: 41, profiles: [input.profile] }, observation, nature, missingCatalog);
  assert.equal(record.status, 'blocked');
  assert.match(record.reason, /攻击来源资料缺失/);
  assert.throws(() => wildPanel(target.raceStats, 41, nature, { attackRaceStats: { physicalAttack: 114 } }), /攻击种族值/);
});

test('missing stage keeps HP-only records usable while blocking attacks instead of assuming stage3', () => {
  const target = species('伊雷龙'), nature = natureFor('magicalAttack', 'neutral');
  const input = inputFor(target.name, 43);
  input.incomingSkillId = skill('角击').id;
  const missing = structuredClone(catalog);
  delete missing.spirits.find(row => row.id === target.id).wildAttackRaceStats;
  const preview = previewMatchup(input, missing, dice);
  assert.equal(preview.incoming.status, 'unsupported');
  assert.equal(preview.outgoing[0].status, 'estimated');
  const observation = { id: 'missing-source', skillId: input.incomingSkillId, profileId: 'own',
    direction: 'incoming', damage: 1, context: 'clean', reduction: 1 };
  assert.equal(predictObservation({ targetId: target.id, level: 43, profiles: [input.profile] }, observation, nature, missing).status, 'blocked');
  assert.equal(wildPanel(target.raceStats, 43, nature).magicalAttack, null);
  const hpObservation = { id: 'known-hp', direction: 'hp', damage: 430,
    beforePercent: 100, afterPercent: 0, percentDigits: 0, percentMode: 'game', context: 'clean', defeated: true };
  const session = { targetId: target.id, level: 43, profiles: [input.profile] };
  for (const strengthStage of [undefined, null, 0, 4, '2', NaN]) {
    assert.throws(() => calculateWildAttack(152, 43, nature, 'magicalAttack', strengthStage), /强度阶段/);
    const changed = structuredClone(catalog);
    changed.spirits.find(row => row.id === target.id).wildStrengthStage = strengthStage;
    const entry = previewMatchup(input, changed, dice).incoming;
    assert.equal(entry.status, 'unsupported');
    assert.match(entry.reason, /强度阶段/);
    // A configured defense mapping still requires its own stage. Do not change
    // that older restriction as part of making attack data optional for HP.
    assert.equal(predictObservation(session, hpObservation, nature, changed).status, 'blocked');
    changed.spirits.find(row => row.id === target.id).wildDefenseRaceStats = null;
    const panel = wildPanel(target.raceStats, 43, nature, {
      attackRaceStats: target.wildAttackRaceStats, defenseRaceStats: null, strengthStage,
    });
    assert.equal(panel.hp, 430);
    assert.equal(panel.physicalAttack, null);
    assert.equal(panel.magicalAttack, null);
    const health = predictObservation(session, hpObservation, nature, changed);
    assert.equal(health.status, 'used', health.reason);
    assert.equal(health.hpMax, 430);
    assert.equal(health.compatible, true);
    const incoming = predictObservation(session, observation, nature, changed);
    assert.equal(incoming.status, 'blocked');
    assert.match(incoming.reason, /强度阶段/);
    const hpPreview = previewMatchup(input, changed, dice);
    assert.equal(hpPreview.targetHpByNature.up, 430);
    assert.equal(hpPreview.incoming.status, 'unsupported');
    assert.match(hpPreview.incoming.reason, /强度阶段/);
  }
});

test('changing target attack races leaves outgoing damage, selected-form HP, defense and own panel intact', () => {
  const input = inputFor('可爱猿', 42), target = species('可爱猿');
  const plain = previewMatchup(input, catalog, dice);
  const hpUp = plain.outgoing[0].predictions.find(row => row.upStat === 'hp' && row.downStat === 'magicalDefense');
  assert.equal(hpUp.damage, 102);
  assert.equal(hpUp.hpMax, 454);
  assert.deepEqual(plain.ownPanel, input.profile.panel);
  const panel = wildPanel(target.raceStats, 42, natureFor('physicalAttack', 'up'), { attackRaceStats: target.wildAttackRaceStats, strengthStage: target.wildStrengthStage });
  assert.deepEqual([panel.hp, panel.physicalDefense, panel.magicalDefense], [416, 89, 72]);
  const changed = structuredClone(catalog);
  changed.spirits.find(row => row.id === target.id).wildAttackRaceStats = { physicalAttack: 999, magicalAttack: 999 };
  changed.spirits.find(row => row.id === input.profile.spiritId).wildAttackRaceStats = null;
  const replay = previewMatchup(input, changed, dice);
  assert.deepEqual(replay.outgoing, plain.outgoing);
  assert.deepEqual(replay.targetHpByNature, plain.targetHpByNature);
  assert.deepEqual(replay.ownPanel, plain.ownPanel);
});
