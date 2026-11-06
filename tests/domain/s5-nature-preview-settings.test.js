import { test, expect } from 'vitest';
import { observationMatch, resolvePickedObservation, validatePreviewSettings } from '../../public/tools/s5-nature/matchup-ui.mjs';

const sessionWith = override => ({ profiles: [{ preview: { skillOverrides: { skill: override } } }],
  preview: { incomingOverridesList: [override] } });

test('preview settings preserve fractional displayed power and legacy final power separately', () => {
  for (const override of [{ displayedPower: 60.5 }, { displayedPower: 0 }, { effectivePower: 137.5 }]) {
    expect(() => validatePreviewSettings(sessionWith(override))).not.toThrow();
  }
});

test('preview settings reject ambiguous mixed power fields in either direction', () => {
  const mixed = { displayedPower: 60.5, effectivePower: 137.5 };
  expect(() => validatePreviewSettings({ profiles: [{ preview: { skillOverrides: { skill: mixed } } }] })).toThrow();
  expect(() => validatePreviewSettings({ profiles: [], preview: { incomingOverridesList: [mixed] } })).toThrow();
});

test('preview settings reject invalid displayed power without changing hit count rules', () => {
  for (const override of [{ displayedPower: -1 }, { displayedPower: Infinity }, { displayedPower: '60.5' },
    { displayedPower: 100001 }, { displayedPower: 60.5, hitCount: 1.5 }]) {
    expect(() => validatePreviewSettings(sessionWith(override))).toThrow();
  }
});

const physicalSkill = { category: 'physical' };
const prediction = (natureId, upStat, remainingPercent, extra = {}) => ({
  natureId, upStat, downStat: 'speed', targetLevel: 41,
  hpMax: 1000, damage: 1000 - remainingPercent * 10,
  remainingHp: remainingPercent * 10, remainingPercent, ...extra,
});
const rowWith = predictions => ({ status: 'estimated', predictions });
const matchingIds = (row, observation) => row.predictions
  .filter(item => observationMatch(item, observation, 'game0')).map(item => item.natureId);

test('saved KO picks remain visual and do not filter nature by their column', () => {
  const row = rowWith([
    prediction('hp-up', 'hp', 0, { damage: 1500 }),
    prediction('defense-up', 'physicalDefense', 20),
  ]);
  for (const key of ['hp', 'hp:base', 'hp:base:up']) {
    expect(() => validatePreviewSettings({ profiles: [{ preview: { picked: { 0: key } } }] })).not.toThrow();
    const observation = resolvePickedObservation(row, key, physicalSkill);
    expect(observation).toBeNull();
    expect(matchingIds(row, observation)).toEqual(['hp-up', 'defense-up']);
  }
});

test('outgoing picks retain every nature with the same displayed remaining percentage', () => {
  const row = rowWith([
    prediction('hp-up', 'hp', 52.1),
    prediction('defense-up', 'physicalDefense', 52.8),
    prediction('attack-up', 'physicalAttack', 53),
    prediction('magic-defense-up', 'magicalDefense', 53.1),
  ]);
  const observation = resolvePickedObservation(row, 'hp:base', physicalSkill);
  expect(observation).toMatchObject({ unit: 'percent', values: [53], pickedKey: 'hp:base' });
  expect(matchingIds(row, observation)).toEqual(['hp-up', 'defense-up', 'attack-up']);
});

test('multi-level picks match discrete percentages without filling the displayed range', () => {
  const row = rowWith([
    prediction('hp-41', 'hp', 29),
    prediction('hp-43', 'hp', 31, { targetLevel: 43 }),
    prediction('same-29', 'magicalDefense', 29, { targetLevel: 42 }),
    prediction('between-30', 'physicalDefense', 30, { targetLevel: 42 }),
    prediction('same-31', 'physicalDefense', 31),
  ]);
  const observation = resolvePickedObservation(row, 'hp:base', physicalSkill);
  expect(observation.values).toEqual([29, 31]);
  expect(matchingIds(row, observation)).toEqual(['hp-41', 'hp-43', 'same-29', 'same-31']);
});

test('the third pick segment selects the clicked HP line without imposing its nature on matches', () => {
  const row = rowWith([
    prediction('hp-up', 'hp', 60),
    prediction('hp-down', 'magicalDefense', 40, { downStat: 'hp' }),
    prediction('hp-neutral', 'physicalAttack', 50, { downStat: 'magicalAttack' }),
    prediction('same-40', 'physicalDefense', 40, { downStat: 'magicalAttack' }),
  ]);
  expect(resolvePickedObservation(row, 'hp:base:up', physicalSkill).values).toEqual([60]);
  expect(resolvePickedObservation(row, 'magicalDefense:base:neutral', physicalSkill).values).toEqual([50]);
  const observation = resolvePickedObservation(row, 'magicalDefense:base:down', physicalSkill);
  expect(observation.values).toEqual([40]);
  expect(matchingIds(row, observation)).toEqual(['hp-down', 'same-40']);
  expect(resolvePickedObservation(row, 'magicalDefense:base', physicalSkill).values).toEqual([40, 50]);
});

test('incoming picks preserve different natures that deal the same damage', () => {
  const row = rowWith([
    prediction('attack-up', 'physicalAttack', 90),
    prediction('magic-attack-up', 'magicalAttack', 90),
    prediction('defense-up', 'physicalDefense', 89.9),
  ]);
  const observation = resolvePickedObservation(row, 'physicalAttack:base', physicalSkill, true);
  expect(observation).toMatchObject({ unit: 'damage', values: [100] });
  expect(matchingIds(row, observation)).toEqual(['attack-up', 'magic-attack-up']);
});

test('preview settings validate optional HP-line pick segments and retain old pick formats', () => {
  for (const pick of ['hp', 'hp:base', 'hp:base:up', 'magicalDefense:down:neutral', 'magicalDefense:base:down']) {
    expect(() => validatePreviewSettings({ profiles: [{ preview: { picked: { 0: pick } } }] })).not.toThrow();
  }
  for (const pick of ['hp:up', 'hp:base:other', 'hp:base:up:extra', 'hp::up', 'unknown:base:up']) {
    expect(() => validatePreviewSettings({ profiles: [{ preview: { picked: { 0: pick } } }] })).toThrow();
  }
});
