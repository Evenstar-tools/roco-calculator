import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { previewMatchup } from '../../public/tools/s5-nature/matchup-preview.mjs';

const read = name => JSON.parse(readFileSync(`public/tools/s5-nature/data/${name}.json`, 'utf8'));
const catalog = read('catalog'), dice = read('dice'), traits = read('traits');
const species = name => catalog.spirits.find(row => row.name === name);
const skill = name => catalog.skills.find(row => row.name === name);
const input = (name = '可爱猿', level = 41) => ({ targetId: species(name).id, level,
  profile: { spiritId: species('罗隐').id, level: 60, awakening: 5,
    panel: { hp: 403, physicalAttack: 312, magicalAttack: 136, physicalDefense: 183, magicalDefense: 137, speed: 176 } },
  skillIds: [skill('火焰切割').id, skill('地刺').id] });
const preview = x => previewMatchup(x, catalog, dice, traits);
const natureRow = (entry, up = 'hp', down = 'speed') => entry.predictions.find(row => row.upStat === up && row.downStat === down);

test('game display power keeps PVE polarization outside, reproducing monkey and dragon readings', () => {
  const ape = input();
  ape.skillOverrides = { [skill('火焰切割').id]: { displayedPower: 110 }, [skill('地刺').id]: { displayedPower: 396 } };
  ape.ownDiceEffects = { physicalAttackMultiplier: 1.1 };
  const result = preview(ape);
  assert.deepEqual(result.outgoing.map(row => natureRow(row).damage), [113, 735]);
  assert.deepEqual(result.outgoing.map(row => row.displayedPower), [110, 396]);
  assert.ok(Math.abs(result.outgoing[1].effectivePower - 712.8) < 1e-9);
  assert.equal(natureRow(result.outgoing[0]).attackerStat, 312);
  assert.equal(natureRow(result.outgoing[0]).hpMax, 446);
  for (const [level, up, down, firePower, damage] of [
    [41, 'hp', 'speed', 50, [182, 364]],
    [42, 'physicalDefense', 'speed', 40, [133, 333]],
    [41, 'speed', 'physicalDefense', 50, [199, 399]],
  ]) {
    const x = input('伊雷龙', level);
    x.skillOverrides = { [skill('火焰切割').id]: { displayedPower: firePower }, [skill('地刺').id]: { displayedPower: 180 } };
    assert.deepEqual(preview(x).outgoing.map(row => natureRow(row, up, down).damage), damage);
  }
});

test('automatic display tracks attack/defense dice once and keeps fractional power', () => {
  const x = input();
  x.skillIds = [skill('先发制人').id];
  x.ownDiceEffects = { physicalAttackMultiplier: 1.1 };
  const boosted = preview(x).outgoing[0];
  assert.equal(boosted.displayedPower, 60.5);
  x.targetDiceEffects = { physicalDefenseMultiplier: 1.25 };
  const defended = preview(x).outgoing[0];
  assert.equal(defended.displayedPower, 48.4);
  x.skillOverrides = { [skill('先发制人').id]: { displayedPower: 48.4 } };
  const manual = preview(x).outgoing[0];
  assert.deepEqual(manual.predictions.map(p => p.damage), defended.predictions.map(p => p.damage));
  assert.equal(manual.powerMode, 'displayed');
  assert(natureRow(defended).damage < natureRow(boosted).damage);
});

test('conditional damage previews use base power and base hits before optional conditions', () => {
  const x = input('伊雷龙');
  x.skillIds = ['先发制人', '地刺', '连续爪击'].map(name => skill(name).id);
  const result = preview(x);
  assert.deepEqual(result.outgoing.map(row => row.status), ['estimated', 'estimated', 'estimated']);
  assert.deepEqual(result.outgoing.map(row => row.displayedPower), [55, 180, 30]);
  assert.deepEqual(result.outgoing.map(row => row.hitCount), [1, 1, 2]);
  assert.deepEqual(result.outgoing.map(row => natureRow(row).damage), [111, 364, 120]);
  x.skillOverrides = { [skill('连续爪击').id]: { hitCount: 4 } };
  assert.equal(natureRow(preview(x).outgoing[2]).damage, 240);
  x.skillOverrides = { [skill('连续爪击').id]: { effectivePower: 30 } };
  assert.equal(preview(x).outgoing[2].hitCount, 1, 'legacy final-power records keep their old count');
  x.skillIds = [skill('魔能爆').id, skill('严霜').id];
  assert.deepEqual(preview(x).outgoing.map(row => row.status), ['unsupported', 'unsupported']);
  x.skillOverrides = { [skill('魔能爆').id]: { displayedPower: 80 } };
  assert.equal(preview(x).outgoing[0].status, 'estimated');
});

test('incoming display overrides keep base attacks and skip already encoded dice and own trait defense', () => {
  const x = input('深蓝鲸');
  x.profile.spiritId = species('迪莫').id;
  x.profile.panel.magicalDefense = 163;
  x.ownTrait = { stacks: 1 };
  x.targetDiceEffects = { magicalAttackMultiplier: 1.1, skillPowerAdd: 40 };
  x.ownDiceEffects = { magicalDefenseMultiplier: 1.25 };
  x.incomingSkillId = skill('甩水').id;
  x.incomingOverrides = { displayedPower: 37.5 };
  const manual = preview(x).incoming;
  assert.equal(natureRow(manual).damage, 41);
  assert.equal(natureRow(manual).defenderDefense, 163);
  delete x.incomingOverrides;
  const automatic = preview(x).incoming;
  assert(automatic.displayedPower > manual.displayedPower);
  assert(automatic.predictions[0].defenderDefense > 163);
});

test('legacy final overrides retain meaning and conflicting override kinds fail explicitly', () => {
  const x = input('伊雷龙');
  x.skillOverrides = { [skill('火焰切割').id]: { effectivePower: 50 } };
  assert.equal(preview(x).outgoing[0].effectivePower, 50);
  assert.equal(preview(x).outgoing[0].powerMode, 'final');
  assert.equal(preview(x).outgoing[0].displayedPower, null);
  x.skillOverrides[skill('火焰切割').id].displayedPower = 50;
  assert.equal(preview(x).outgoing[0].status, 'unsupported');
  assert.match(preview(x).outgoing[0].reason, /不可同时/);
});

test('empirical incoming dulling is visible as approximate and preserves neutral whale readings', () => {
  const x = input('深蓝鲸', 42);
  x.incomingSkillId = skill('气泡').id;
  const row = preview(x).incoming;
  assert.equal(row.typeInteraction.correctionMultiplier, .72);
  assert.equal(row.typeInteraction.approximate, true);
  assert.equal(row.typeInteraction.formulaVerified, false);
  assert.equal(natureRow(row, 'magicalAttack', 'speed').damage, 266);
});
