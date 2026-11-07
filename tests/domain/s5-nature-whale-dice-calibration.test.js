import { test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { previewMatchup } from '../../public/tools/s5-nature/matchup-preview.mjs';
import { formatGamePercent } from '../../public/tools/s5-nature/hp-inverse.mjs';

const read = name => JSON.parse(readFileSync(`public/tools/s5-nature/data/${name}.json`, 'utf8'));
const catalog = read('catalog'), dice = read('dice'), traits = read('traits');
const species = name => catalog.spirits.find(row => row.name === name);
const skill = name => catalog.skills.find(row => row.name === name);
const panels = {
  迪莫: { hp: 425, physicalAttack: 138, magicalAttack: 181, physicalDefense: 175, magicalDefense: 175, speed: 223 },
  罗隐: { hp: 403, physicalAttack: 312, magicalAttack: 136, physicalDefense: 183, magicalDefense: 137, speed: 176 },
};
const inputFor = (name, names, stacks = 0) => ({
  targetId: species('深蓝鲸').id, level: 43,
  profile: { spiritId: species(name).id, level: 60, awakening: 5, panel: { ...panels[name] } },
  ownDiceIds: ['game-dice-effect-1'], targetDiceIds: ['game-dice-effect-8'],
  ownTrait: { stacks }, skillIds: names.map(name => skill(name).id),
});
const preview = input => previewMatchup(input, catalog, dice, traits);
// No captured nature label: neutral defenses/HP are the calibrated model band.
// All six permutations of attack/speed natures share these outgoing readings.
const neutral = entry => entry.predictions.find(row => row.upStat === 'physicalAttack' && row.downStat === 'speed');

test('43 whale replays six user readings with the confirmed post-thorn Dimo stack', () => {
  const before = preview(inputFor('迪莫', ['光球', '棘突']));
  expect(before.outgoing.map(entry => neutral(entry).damage)).toEqual([136, 308]);
  expect(neutral(before.outgoing[0]).hpMax).toBe(522);
  expect(formatGamePercent(neutral(before.outgoing[0]).remainingPercent)).toBe(74);
  expect(before.outgoing.every(entry => neutral(entry).defenderDefense === 210)).toBe(true);

  // User confirmed: hot sand was cast AFTER thorn triggered Best Partner.
  const afterInput = inputFor('迪莫', ['热砂'], 1);
  const after = preview(afterInput).outgoing[0];
  expect(neutral(after).attackerStat).toBe(235); // floor(181 * (1 + .1 + .2))
  expect(after.displayedPower).toBe(104);
  expect(neutral(after).damage).toBe(80);
  expect(neutral(preview(inputFor('迪莫', ['热砂'])).outgoing[0]).damage).toBe(68);
  afterInput.skillOverrides = { [skill('热砂').id]: { displayedPower: 104 } };
  expect(neutral(preview(afterInput).outgoing[0]).damage).toBe(80);

  const physical = preview(inputFor('罗隐', ['地刺', '火焰切割', '彼岸之手']));
  expect(physical.outgoing.map(entry => neutral(entry).damage)).toEqual([294, 117, 491]);
  expect(physical.outgoing.every(entry => neutral(entry).defenderDefense === 189)).toBe(true);
  expect(physical.outgoing[1].typeInteraction.diceBaseMultiplier).toBe(.4);
  expect(physical.outgoing[1].typeInteraction.correctionMultiplier).toBe(1.8);
});

test('new level42 whale light-ball 138 keeps the confirmed A181 input separate from old A176', () => {
  const input = inputFor('迪莫', ['光球']);
  input.level = 42;
  input.targetDiceIds = [];
  const reading = neutral(preview(input).outgoing[0]);
  expect(reading.attackerStat).toBeCloseTo(199.1, 10);
  expect(reading.defenderDefense).toBe(208);
  expect(reading.damage).toBe(138);

  // Independent historical input, not a correction to the new observation.
  // Replacing its A176 by A181 would hide an unresolved evidence mismatch.
  input.profile.panel.magicalAttack = 176;
  expect(neutral(preview(input).outgoing[0]).damage).toBe(134);
});

test('Best Partner stacks add to the same attack/defense dice attributes once', () => {
  const input = inputFor('迪莫', ['热砂'], 1);
  input.ownDiceIds = [];
  input.ownDiceEffects = { magicalAttackMultiplier: 1.1, magicalDefenseMultiplier: 1.1 };
  input.incomingSkillId = skill('气泡').id;
  const result = preview(input);
  expect(neutral(result.outgoing[0]).attackerStat).toBe(235);
  expect(result.incoming.predictions[0].defenderDefense).toBe(227);
  expect(result.incoming.displayedPower).toBeCloseTo(125 / 1.3, 10);
  input.profile.panel.magicalAttack = 199;
  input.profile.panel.magicalDefense = 192;
  input.profile.panelIncludesDice = true;
  const included = preview(input);
  expect(neutral(included.outgoing[0]).attackerStat).toBe(235);
  expect(included.incoming.predictions[0].defenderDefense).toBe(226);
  // Already-rounded combat values are used as supplied, never rounded back
  // into a fabricated original panel or boosted by the dice a second time.
  expect(included.ownPanel.magicalAttack).toBe(199);
});

test.each([[120, 1, 156], [80, 2, 120]])('additive stats preserve the exact integer boundary for base %i', (base, stacks, expected) => {
  const input = inputFor('迪莫', ['热砂'], stacks);
  input.profile.panel.magicalAttack = base;
  expect(neutral(preview(input).outgoing[0]).attackerStat).toBe(expected);
  input.profile.panel.magicalAttack = base * 1.1;
  input.profile.panelIncludesDice = true;
  expect(neutral(preview(input).outgoing[0]).attackerStat).toBe(expected);
});
