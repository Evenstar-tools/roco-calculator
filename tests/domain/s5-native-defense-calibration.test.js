import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { previewMatchup } from '../../public/tools/s5-nature/matchup-preview.mjs';
import { calculateWildDefense } from '../../public/tools/s5-nature/wild-defense.mjs';
import { formatGamePercent } from '../../public/tools/s5-nature/hp-inverse.mjs';
import { restoreS5RuntimeRelations } from '../../public/tools/s5-nature/vendor/s5-runtime-relations.js';

// User observations and conditions are preserved in
// output/coefficient-full-replay-20261109/{stage1,stage2,wing42-naive}-replay.*.
// Expected damage is the recorded hit, never generated from the new formula.
const read = name => JSON.parse(readFileSync(`public/tools/s5-nature/data/${name}.json`, 'utf8'));
const catalog = restoreS5RuntimeRelations(read('catalog'));
const dice = read('dice'), traits = read('traits');
const species = name => {
  const value = catalog.spirits.find(row => row.name === name);
  assert(value, name);
  return value;
};
const skill = name => {
  const value = catalog.skills.find(row => row.name === name);
  assert(value, name);
  return value;
};
const nature = name => {
  const value = catalog.natures.find(row => row.name === name);
  assert(value, name);
  return value;
};
const natureBand = (stat, direction) => catalog.natures.find(row => direction === 'up'
  ? row.upStat === stat && row.downStat === 'speed'
  : direction === 'down' ? row.downStat === stat && row.upStat === 'speed'
    : row.upStat === 'hp' && row.downStat === 'speed');
const panels = {
  罗隐: { hp: 403, physicalAttack: 312, magicalAttack: 136, physicalDefense: 183, magicalDefense: 137, speed: 176 },
  迪莫: { hp: 425, physicalAttack: 138, magicalAttack: 181, physicalDefense: 175, magicalDefense: 175, speed: 223 },
};
function inputFor(target, level, own, names) {
  return { targetId: species(target).id, level,
    profile: { id: 'own', spiritId: species(own).id, level: 60, awakening: 5, panel: { ...panels[own] } },
    ownTrait: { stacks: 0, active: false }, skillIds: names.map(name => skill(name).id),
    ownDiceIds: [], targetDiceIds: [] };
}
function predicted(entry, selectedNature, label) {
  assert.equal(entry.status, 'estimated', `${label}: ${entry.reason}`);
  // Exercise the live automatic type/STAB/awakening path, including when a
  // powerMultiplier marks a known lucky critical; no displayedPower override.
  assert.equal(entry.powerMode, 'auto', label);
  assert.equal(entry.manualPower, false, label);
  const value = entry.predictions.find(row => row.natureId === selectedNature.id);
  assert(value, `${label}/${selectedNature.name}`);
  return value;
}
function outgoing(input, selectedNature, expected, powers) {
  const result = previewMatchup(input, catalog, dice, traits);
  const rows = result.outgoing.map((entry, index) => predicted(entry, selectedNature, entry.skillName));
  assert.deepEqual(rows.map(row => row.damage), expected);
  if (powers) assert.deepEqual(result.outgoing.map(entry => entry.displayedPower), powers);
  return rows;
}

test('native defense races and source-free formula reproduce the same calibrated divisors', () => {
  const cases = [
    ['沉金兽', 1, 76, 53, 42, '坦率', 273, 193],
    ['可爱猿', 1, 86, 67, 41, '平和', 273, 226],
    ['小翼龙', 2, 73, 63, 42, '天真', 188, 154],
    ['棋棋（白子）', 2, 70, 56, 43, '胆小', 168, 143],
  ];
  for (const [name, stage, pd, md, level, natureName, expectedPd, expectedMd] of cases) {
    const target = species(name), selected = nature(natureName), mapping = target.wildDefenseRaceStats;
    assert.equal(target.wildStrengthStage, stage, name);
    assert.deepEqual([target.raceStats.physicalDefense, target.raceStats.magicalDefense], [pd, md], name);
    assert.deepEqual([mapping.physicalDefense, mapping.magicalDefense], [pd, md], name);
    assert.equal(mapping.resolution, 'selected-form', name);
    for (const [stat, expected] of [['physicalDefense', expectedPd], ['magicalDefense', expectedMd]]) {
      assert.equal(calculateWildDefense(mapping[stat], level, selected, stat, stage), expected, name);
      assert.equal(calculateWildDefense(mapping[stat], level, selected, stat, stage, mapping.sourcePetbaseId), expected, name);
    }
  }
  // Former exact-point overrides must not conceal a different common formula.
  for (const [source, race, stage, level, direction, expected] of [
    [3398, 46, 1, 42, 'neutral', 174], [3802, 76, 1, 43, 'neutral', 254],
    [3381, 125, 3, 41, 'up', 203], [3444, 85, 3, 42, 'neutral', 137],
    [3444, 85, 3, 43, 'down', 126],
  ]) {
    const selected = natureBand('physicalDefense', direction);
    assert.equal(calculateWildDefense(race, level, selected, 'physicalDefense', stage), expected);
    assert.equal(calculateWildDefense(race, level, selected, 'physicalDefense', stage, source), expected);
  }
});

test('42 frank metal and 41 peaceful initial ape replay automatic physical and magical hits', () => {
  const metal = outgoing(inputFor('沉金兽', 42, '罗隐', ['火焰切割', '地刺']), nature('坦率'), [103, 668], [100, 360]);
  assert.equal(metal[0].hpMax, 348);
  assert.equal(formatGamePercent(metal[0].remainingPercent), 71);
  outgoing(inputFor('沉金兽', 42, '迪莫', ['光球', '热砂']), nature('坦率'), [135, 243], [160, 160]);
  const ape = outgoing(inputFor('可爱猿', 41, '罗隐', ['火焰切割', '地刺']), nature('平和'), [103, 668], [100, 360]);
  assert.equal(ape[0].hpMax, 446);
  assert.equal(formatGamePercent(ape[0].remainingPercent), 77);
  const input = inputFor('可爱猿', 41, '迪莫', ['光球']);
  outgoing(input, nature('平和'), [115], [160]);
  input.incomingSkillId = skill('先发制人').id;
  const incoming = previewMatchup(input, catalog, dice, traits).incoming;
  assert.equal(predicted(incoming, nature('平和'), '可爱猿先发→迪莫').damage, 66);
});

test('42 naive wing replays six outgoing hits and both neutral claw receivers', () => {
  const lua = inputFor('小翼龙', 42, '罗隐', ['先发制人', '火焰切割', '地刺']);
  lua.targetDiceEffects = { physicalAttackMultiplier: 1.5, magicalAttackMultiplier: 1.5 };
  lua.incomingSkillId = skill('龙之利爪').id;
  const rows = outgoing(lua, nature('天真'), [82, 134, 269], [55, 50, 180]);
  assert.equal(rows[0].hpMax, 324);
  assert.equal(rows[0].remainingHp, 242);
  assert.equal(formatGamePercent(rows[0].remainingPercent), 75);
  assert.equal(previewMatchup(lua, catalog, dice, traits).incoming.typeMultiplier, 1);
  assert.equal(predicted(previewMatchup(lua, catalog, dice, traits).incoming, nature('天真'), '龙爪→罗隐').damage, 236);
  const lucky = { ...lua, skillIds: [skill('地刺').id], skillOverrides: { [skill('地刺').id]: { powerMultiplier: 2 } } };
  outgoing(lucky, nature('天真'), [539], [360]);
  assert.notEqual(269 * 2, 539, 'lucky critical doubles power before damage rounding');
  const dimo = inputFor('小翼龙', 42, '迪莫', ['光球', '棘突']);
  dimo.targetDiceEffects = lua.targetDiceEffects;
  dimo.incomingSkillId = skill('龙之利爪').id;
  outgoing(dimo, nature('天真'), [169, 47], [160, 25]);
  const result = previewMatchup(dimo, catalog, dice, traits);
  assert.equal(result.incoming.typeMultiplier, 1, 'neutral dragon damage does not validate dulling');
  assert.equal(predicted(result.incoming, nature('天真'), '龙爪→迪莫').damage, 247);
});

test('white chess keeps the recorded defense bands and 43-level mixed buffs', () => {
  // B/C are separate observations. "Not decreased" is replayed under its
  // matching neutral branch; this does not relabel a captured nature.
  outgoing(inputFor('棋棋（白子）', 41, '罗隐', ['地刺', '火焰切割']), natureBand('physicalDefense', 'down'), [300, 166]);
  const physical = inputFor('棋棋（白子）', 41, '罗隐', ['彼岸之手', '地刺', '火焰切割']);
  outgoing(physical, natureBand('physicalDefense', 'neutral'), [457, 274, 152]);
  outgoing({ ...physical, skillIds: [skill('火焰切割').id], skillOverrides: { [skill('火焰切割').id]: { powerMultiplier: 2 } } },
    natureBand('physicalDefense', 'neutral'), [305]);
  outgoing(inputFor('棋棋（白子）', 41, '迪莫', ['光球', '热砂', '棘突']), natureBand('magicalDefense', 'neutral'), [185, 83, 417]);
  const attackUp = catalog.natures.find(row => row.upStat === 'physicalAttack' && row.downStat === 'magicalDefense');
  const level42 = inputFor('棋棋（白子）', 42, '迪莫', ['光球']);
  level42.targetDiceEffects = { physicalAttackMultiplier: 2 };
  level42.incomingSkillId = skill('寸拳').id;
  outgoing(level42, attackUp, [199]);
  assert.equal(predicted(previewMatchup(level42, catalog, dice, traits).incoming, attackUp, '42白棋寸拳').damage, 89);
  const level43 = inputFor('棋棋（白子）', 43, '迪莫', ['棘突', '光球', '热砂']);
  // +30% and -50% combine to -2 ability stages. The negative-stage rule
  // gives 1/1.2 attack; defense retains the explicit +30% multiplier.
  level43.targetDiceEffects = { physicalAttackMultiplier: 1 / 1.2, physicalDefenseMultiplier: 1.3, magicalDefenseMultiplier: 1.3 };
  level43.incomingSkillIds = ['跺地', '寸拳'].map(name => skill(name).id);
  outgoing(level43, nature('胆小'), [316, 140, 63]);
  const incoming = previewMatchup(level43, catalog, dice, traits).incomingList;
  assert.deepEqual(incoming.map(entry => predicted(entry, nature('胆小'), entry.skillName).damage), [85, 31]);
});

test('old wing A176 conflict stays visible instead of silently changing the recorded panel', () => {
  // stage2-both-defense-audit.json: wing42MDdown_A176, observed142.
  // A181 explains142, but the original input was176 and remains a conflict.
  const selected = catalog.natures.find(row => row.upStat === 'physicalDefense' && row.downStat === 'magicalDefense');
  const input = inputFor('小翼龙', 42, '迪莫', ['光球']);
  input.profile.panel.magicalAttack = 176;
  input.targetDiceEffects = { magicalDefenseMultiplier: 1.3 };
  const entry = previewMatchup(input, catalog, dice, traits).outgoing[0];
  const row = predicted(entry, selected, '旧翼龙A176');
  assert.equal(row.damage, 138);
  assert.notEqual(row.damage, 142);
  assert.equal(input.profile.panel.magicalAttack, 176);
});
