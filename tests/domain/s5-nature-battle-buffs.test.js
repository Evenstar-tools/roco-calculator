import { test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { previewMatchup } from '../../public/tools/s5-nature/matchup-preview.mjs';
import { calculateDamage } from '../../src/domain/damage.js';

const read = name => JSON.parse(readFileSync(`public/tools/s5-nature/data/${name}.json`, 'utf8'));
const catalog = read('catalog'), dice = read('dice'), traits = read('traits');
const spirit = name => catalog.spirits.find(row => row.name === name);
const skill = name => catalog.skills.find(row => row.name === name);
const panels = {
  罗隐: { hp: 403, physicalAttack: 312, magicalAttack: 136, physicalDefense: 183, magicalDefense: 137, speed: 176 },
  迪莫: { hp: 425, physicalAttack: 138, magicalAttack: 181, physicalDefense: 175, magicalDefense: 175, speed: 223 },
};
const inputFor = (own, moves, level = 43) => ({
  targetId: spirit('缇塔').id, level,
  profile: { spiritId: spirit(own).id, level: 60, awakening: 5, panel: { ...panels[own] } },
  ownTrait: { stacks: 0, active: false }, skillIds: moves.map(name => skill(name).id),
});
const preview = input => previewMatchup(input, catalog, dice, traits);
const neutral = entry => entry.predictions.find(row => row.upStat === 'hp' && row.downStat === 'speed');

test('43 Tita defense +25% enters battle power once without changing the defense formula', () => {
  // +25% defense is the selected 1.25 ability multiplier. Empirical replay
  // requires preserving its reciprocal in power, without early panel flooring.
  const defense = { physicalDefenseMultiplier: 1.25, magicalDefenseMultiplier: 1.25 };
  const luoInput = inputFor('罗隐', ['蝙蝠']);
  luoInput.targetDiceEffects = defense;
  const luo = preview(luoInput), bat = luo.outgoing[0];
  expect(luo.ownPanel).toEqual(panels.罗隐);
  expect(bat.displayedPower).toBe(104);
  expect(bat.effectivePower).toBe(104);
  expect(neutral(bat).attackerStat).toBe(312);
  expect(neutral(bat).defenderDefense).toBe(205);
  expect(neutral(bat).damage).toBe(142);

  const dimoInput = inputFor('迪莫', ['光球', '潮涌', '气泡']);
  dimoInput.targetDiceEffects = defense;
  const dimo = preview(dimoInput);
  expect(dimo.ownPanel).toEqual(panels.迪莫);
  expect(dimo.outgoing.map(entry => entry.displayedPower)).toEqual([128, 128, 160]);
  expect(dimo.outgoing.map(entry => entry.effectivePower)).toEqual([128, 230.4, 288]);
  expect(dimo.outgoing.map(entry => neutral(entry).attackerStat)).toEqual([181, 138, 181]);
  expect(dimo.outgoing.map(entry => neutral(entry).defenderDefense)).toEqual([164, 205, 164]);
  expect(dimo.outgoing.map(entry => neutral(entry).damage)).toEqual([127, 139, 286]);
});

const battleCases = [
  { direction: 'outgoing', category: 'physical', move: '潮涌', attack: 138, defense: 205, display: 160, effective: 288, level: 60 },
  { direction: 'outgoing', category: 'magical', move: '光球', attack: 181, defense: 164, display: 160, effective: 160, level: 60 },
  { direction: 'incoming', category: 'physical', move: '拖拉机', attack: 271, defense: 175, display: 106.25, effective: 106.25, level: 43 },
  { direction: 'incoming', category: 'magical', move: '光球', attack: 134, defense: 175, display: 80, effective: 80, level: 43 },
];
const mainDamage = (attack, defense, power, level) => calculateDamage({
  attackerStat: attack, defenderDefense: defense, displayedPower: power, level,
}).total;

test.each(battleCases.flatMap(row => [[1.1, 1.25], [1 / 1.1, 1.25], [1.1, 1 / 1.25], [1 / 1.1, 1 / 1.25]]
  .map(([attackMultiplier, defenseMultiplier]) => ({ ...row, attackMultiplier, defenseMultiplier }))))(
  '$direction $category battle ratios $attackMultiplier / $defenseMultiplier leave both formula panels unchanged',
  ({ direction, category, move, attack, defense, display, effective, level, attackMultiplier, defenseMultiplier }) => {
    const input = inputFor('迪莫', [move]);
    input.incomingSkillId = skill(move).id;
    // Saved fractions already encode their battle multiplier (for example
    // 1/1.2); they must not be reinterpreted as an unprocessed -16.67% stage.
    const attackEffect = { [`${category}AttackMultiplier`]: attackMultiplier };
    const defenseEffect = { [`${category}DefenseMultiplier`]: defenseMultiplier };
    input.ownDiceEffects = direction === 'outgoing' ? attackEffect : defenseEffect;
    input.targetDiceEffects = direction === 'outgoing' ? defenseEffect : attackEffect;
    const result = preview(input);
    const automatic = direction === 'outgoing' ? result.outgoing[0] : result.incoming;
    const ratio = attackMultiplier / defenseMultiplier;
    const expectedDisplay = display * ratio;
    expect(automatic.status).toBe('estimated');
    expect(result.ownPanel).toEqual(panels.迪莫);
    expect(automatic.displayedPower).toBeCloseTo(expectedDisplay, 9);
    expect(automatic.effectivePower).toBeCloseTo(effective * ratio, 9);
    expect(neutral(automatic).attackerStat).toBe(attack);
    expect(neutral(automatic).defenderDefense).toBe(defense);
    expect(neutral(automatic).damage).toBe(mainDamage(attack, defense, effective * ratio, level));

    // The entered skill-bar value already contains the battle ratio.
    if (direction === 'outgoing') input.skillOverrides = { [skill(move).id]: { displayedPower: expectedDisplay } };
    else input.incomingOverrides = { displayedPower: expectedDisplay };
    const manualResult = preview(input);
    const manual = direction === 'outgoing' ? manualResult.outgoing[0] : manualResult.incoming;
    expect(manual.powerMode).toBe('displayed');
    expect(manual.battleBuffs.applied).toBe(false);
    expect(manual.predictions).toEqual(automatic.predictions);
  });

test('physical and magical dice affect only the matching incoming or outgoing power', () => {
  const input = inputFor('迪莫', ['潮涌', '光球']);
  input.incomingSkillIds = ['拖拉机', '光球'].map(name => skill(name).id);
  const base = preview(input);
  input.targetDiceEffects = { physicalDefenseMultiplier: 1.25 };
  input.ownDiceEffects = { magicalDefenseMultiplier: 1.25 };
  const result = preview(input);
  expect(result.outgoing[0].displayedPower).toBe(128);
  expect(result.outgoing[1].predictions).toEqual(base.outgoing[1].predictions);
  expect(result.incomingList[0].predictions).toEqual(base.incomingList[0].predictions);
  expect(result.incomingList[1].displayedPower).toBe(64);
  expect(neutral(result.outgoing[0]).defenderDefense).toBe(205);
  expect(neutral(result.incomingList[1]).defenderDefense).toBe(175);
  expect(result.ownPanel).toEqual(panels.迪莫);
});

test('unmeasured non-Dimo trait composition keeps its prior multiplier contract', () => {
  const input = inputFor('罗隐', ['先发制人']);
  input.profile.spiritId = spirit('火豆丁').id;
  input.incomingSkillId = skill('拖拉机').id;
  const base = preview(input);
  input.ownTrait = { stacks: 2 };
  input.ownDiceEffects = { physicalAttackMultiplier: 1.1, physicalDefenseMultiplier: 1.25 };
  const result = preview(input);
  // 淬炼火 two stacks remain the pre-existing +20% trait multiplier.
  // Do not generalize Best Partner's measured additive rule to this trait.
  const outgoing = result.outgoing[0], incoming = result.incoming;
  expect(neutral(outgoing).attackerStat).toBe(312);
  expect(neutral(incoming).defenderDefense).toBe(183);
  expect(outgoing.displayedPower).toBeCloseTo(base.outgoing[0].displayedPower * 1.1 * 1.2, 9);
  expect(incoming.displayedPower).toBeCloseTo(base.incoming.displayedPower / (1.25 * 1.2), 9);
  expect(neutral(outgoing).damage).toBe(mainDamage(312, neutral(base.outgoing[0]).defenderDefense,
    base.outgoing[0].effectivePower * 1.1 * 1.2, 60));
  expect(neutral(incoming).damage).toBe(mainDamage(neutral(base.incoming).attackerStat, 183,
    base.incoming.effectivePower / (1.25 * 1.2), 43));
  expect(result.ownPanel).toEqual(panels.罗隐);
});

test('42 Tita user sample stays 176 / 389 / 173 / 115 when its resistance dice does not apply', () => {
  const input = inputFor('迪莫', ['潮涌', '气泡', '光球'], 42);
  input.targetDiceIds = ['game-dice-effect-15'];
  input.incomingSkillId = skill('拖拉机').id;
  const result = preview(input);
  const careless = entry => entry.predictions.find(row => row.natureName === '粗心');
  expect(result.outgoing.map(entry => careless(entry).damage)).toEqual([176, 389, 173]);
  expect(careless(result.incoming).damage).toBe(115);
  expect(careless(result.outgoing[0]).hpMax).toBe(374);
  expect(careless(result.outgoing[0]).remainingPercent).toBeCloseTo(52.9411764706, 8);
  expect(result.outgoing.every(entry => entry.typeInteraction.appliedDiceEffects.length === 0)).toBe(true);
  input.targetDiceIds = [];
  const noDice = preview(input);
  expect(noDice.outgoing.map(entry => entry.predictions)).toEqual(result.outgoing.map(entry => entry.predictions));
  expect(noDice.incoming.predictions).toEqual(result.incoming.predictions);
});
