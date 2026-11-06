import { test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { incomingSkillOptions, natureAxisState, observationMatch, readOutgoingObservations, splitNatureConditions, validatePreviewSettings } from '../../public/tools/s5-nature/matchup-ui.mjs';

const sessionWith = override => ({ profiles: [{ preview: { skillOverrides: { skill: override } } }],
  preview: { incomingOverridesList: [override] } });

test('preview settings preserve fractional displayed power and legacy final power separately', () => {
  for (const override of [{ displayedPower: 60.5 }, { displayedPower: 0 }, { effectivePower: 137.5 }]) {
    expect(() => validatePreviewSettings(sessionWith(override))).not.toThrow();
  }
});

test('preview settings restore all original effect IDs without dropping the chosen face', () => {
  for (let id = 1; id <= 40; id++) {
    expect(() => validatePreviewSettings({ profiles: [{ preview: { diceId: `game-dice-effect-${id}` } }],
      preview: { diceId: `game-dice-effect-${id}` } })).not.toThrow();
  }
  for (const id of ['game-dice-effect-0', 'game-dice-effect-41', 'game-dice-effect-01', 'game-dice-effect-8-extra']) {
    expect(() => validatePreviewSettings({ profiles: [{ preview: { diceId: id } }] })).toThrow();
  }
});

test('preview settings preserve the explicit included-panel flag and speed multiplier', () => {
  for (const included of [true, false]) {
    expect(() => validatePreviewSettings({ profiles: [{ preview: {
      panelIncludesDice: included, diceEffects: { speedMultiplier: 1.5 },
    } }] })).not.toThrow();
  }
  for (const included of [1, 'true', null, {}]) {
    expect(() => validatePreviewSettings({ profiles: [{ preview: { panelIncludesDice: included } }] })).toThrow();
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

const prediction = (natureId, upStat, remainingPercent, extra = {}) => ({
  natureId, upStat, downStat: 'speed', targetLevel: 41,
  hpMax: 1000, damage: 1000 - remainingPercent * 10,
  remainingHp: remainingPercent * 10, remainingPercent, ...extra,
});
const rowWith = predictions => ({ status: 'estimated', predictions });
const matchingIds = (row, observation, format = 'game0') => row.predictions
  .filter(item => observationMatch(item, observation, format)).map(item => item.natureId);

test('outgoing damage and remaining percentage must match the same prediction', () => {
  const row = rowWith([
    prediction('damage-only', 'hp', 75, { damage: 103 }),
    prediction('percent-only', 'physicalDefense', 76.1, { damage: 104 }),
    prediction('both', 'magicalDefense', 76.9, { damage: 103 }),
  ]);
  const { observed, invalid } = readOutgoingObservations({ observed: { 0: { damage: 103, remainingPercent: 77 } } });
  expect(invalid).toBe(false);
  expect(observed[0]).toEqual({ damage: 103, remainingPercent: 77 });
  expect(matchingIds(row, observed[0])).toEqual(['both']);
  expect(matchingIds(rowWith(row.predictions.slice(0, 2)), observed[0])).toEqual([]);
});

test('either observation field works independently and uses the displayed percentage', () => {
  const row = rowWith([
    prediction('same-damage', 'hp', 75, { damage: 103 }),
    prediction('both', 'physicalDefense', 76.1, { damage: 103 }),
    prediction('same-percent', 'magicalDefense', 76.9, { damage: 104 }),
  ]);
  const { observed } = readOutgoingObservations({ observed: { 0: { damage: 103 }, 1: { remainingPercent: 77 } } });
  expect(matchingIds(row, observed[0])).toEqual(['same-damage', 'both']);
  expect(matchingIds(row, observed[1])).toEqual(['both', 'same-percent']);
  expect(matchingIds(row, undefined)).toEqual(['same-damage', 'both', 'same-percent']);
});

test('damage matching retains raw overkill damage instead of capping it at maximum HP', () => {
  const overkill = prediction('hp-up', 'hp', 0, { hpMax: 1000, damage: 1500 });
  const { observed } = readOutgoingObservations({ observed: { 0: { damage: 1500 } } });
  expect(observationMatch(overkill, observed[0])).toBe(true);
  expect(observationMatch(overkill, { damage: 1000 })).toBe(false);
});

test('zero remaining percentage ignores the entire row including its entered damage', () => {
  for (const damage of [undefined, 0, 103, 1500]) {
    const result = readOutgoingObservations({ observed: {
      0: { damage, remainingPercent: 0 }, 1: { damage: 103, remainingPercent: 77 },
    } });
    expect(result.invalid).toBe(false);
    expect(Object.keys(result.observed)).toEqual(['1']);
    expect(result.observed[1]).toEqual({ damage: 103, remainingPercent: 77 });
  }
});

test('legacy picked columns remain visual and never manufacture or alter observations', () => {
  for (const pick of ['hp', 'hp:base', 'hp:base:up', 'magicalDefense:down:neutral']) {
    const own = { picked: { 0: pick }, observedUnits: { 0: 'percent' } };
    expect(readOutgoingObservations(own)).toEqual({ observed: {}, invalid: false });
    expect(readOutgoingObservations({ ...own, observed: { 0: { damage: 103 } } }))
      .toEqual(readOutgoingObservations({ observed: { 0: { damage: 103 } } }));
  }
  expect(readOutgoingObservations({ observed: { 0: {}, 1: { damage: null, remainingPercent: null } } }))
    .toEqual({ observed: {}, invalid: false });
});

test.each([
  ['game0', 76.41, 77], ['round0', 76.41, 76], ['floor0', 76.91, 76], ['round1', 76.46, 76.5],
])('remaining percentage obeys %s precision for reading and matching', (format, rawPercent, displayedPercent) => {
  const { observed, invalid } = readOutgoingObservations({ observed: { 0: { damage: 0, remainingPercent: displayedPercent } } }, format);
  expect(invalid).toBe(false);
  const item = prediction('hp-up', 'hp', rawPercent, { damage: 0 });
  expect(observationMatch(item, observed[0], format)).toBe(true);
  expect(observationMatch(item, { remainingPercent: displayedPercent + (format === 'round1' ? 0.1 : 1) }, format)).toBe(false);
});

test('invalid observations stay flagged while valid rows remain available', () => {
  const cases = [
    [{ damage: -1 }, 'game0'], [{ damage: 1.5 }, 'game0'], [{ damage: Infinity }, 'game0'], [{ damage: NaN }, 'game0'],
    [{ damage: '103' }, 'game0'], [{ remainingPercent: -1 }, 'game0'], [{ remainingPercent: 101 }, 'game0'],
    [{ remainingPercent: Infinity }, 'game0'], [{ remainingPercent: NaN }, 'game0'], [{ remainingPercent: '77' }, 'game0'],
    [{ remainingPercent: 76.5 }, 'game0'], [{ remainingPercent: 76.5 }, 'round0'],
    [{ remainingPercent: 76.5 }, 'floor0'], [{ remainingPercent: 76.55 }, 'round1'],
  ];
  for (const [invalidObservation, format] of cases) {
    const result = readOutgoingObservations({ observed: { 0: invalidObservation, 3: { damage: 103, remainingPercent: 77 } } }, format);
    expect(result).toEqual({ observed: { 0: { invalid: true }, 3: { damage: 103, remainingPercent: 77 } }, invalid: true });
  }
});

test.each(['hp', 'physicalDefense', 'magicalDefense', 'physicalAttack', 'magicalAttack'])
  ('nature axis %s distinguishes increase, decrease, unchanged, not increased and unresolved', stat => {
    const up = { upStat: stat, downStat: 'speed' };
    const down = { upStat: 'speed', downStat: stat };
    const neutral = { upStat: null, downStat: null };
    expect(natureAxisState([up], stat)).toBe('加');
    expect(natureAxisState([down], stat)).toBe('减');
    expect(natureAxisState([neutral], stat)).toBe('不变');
    expect(natureAxisState([down, neutral], stat)).toBe('不加');
    expect(natureAxisState([up, neutral], stat)).toBe('—');
    expect(natureAxisState([up, down], stat)).toBe('—');
    expect(natureAxisState([], stat)).toBe('—');
  });

test.each([['physical', 'physicalDefense'], ['magical', 'magicalDefense']])
  ('outgoing %s groups preserve HP-down and defense-down natures in matching', (category, defense) => {
    const items = [
      prediction('hp-down', 'physicalAttack', 40, { downStat: 'hp', damage: 103 }),
      prediction('defense-down', 'hp', 40, { downStat: defense, damage: 103 }),
      prediction('unchanged', 'magicalDefense', 50, { downStat: 'speed', damage: 103 }),
    ];
    const groups = splitNatureConditions(items, { category });
    expect(groups.map(group => [group.condition, group.predictions.map(item => item.natureId)]))
      .toEqual([['base', ['hp-down', 'unchanged']], ['down', ['defense-down']]]);
    const grouped = rowWith(groups.flatMap(group => group.predictions));
    expect(matchingIds(grouped, { damage: 103, remainingPercent: 40 }).sort()).toEqual(['defense-down', 'hp-down']);
    expect(grouped.predictions).toHaveLength(items.length);
  });

test('incoming raw damage retains different nature increases when they deal the same damage', () => {
  const row = rowWith([
    prediction('attack-up', 'physicalAttack', 90),
    prediction('magic-attack-up', 'magicalAttack', 90),
    prediction('defense-up', 'physicalDefense', 89.9),
  ]);
  expect(matchingIds(row, { damage: 100 })).toEqual(['attack-up', 'magic-attack-up']);
});

test('preview settings validate optional HP-line pick segments and retain old pick formats', () => {
  for (const pick of ['hp', 'hp:base', 'hp:base:up', 'magicalDefense:down:neutral', 'magicalDefense:base:down']) {
    expect(() => validatePreviewSettings({ profiles: [{ preview: { picked: { 0: pick } } }] })).not.toThrow();
  }
  for (const pick of ['hp:up', 'hp:base:other', 'hp:base:up:extra', 'hp::up', 'unknown:base:up']) {
    expect(() => validatePreviewSettings({ profiles: [{ preview: { picked: { 0: pick } } }] })).toThrow();
  }
});

test('enemy current-move options keep native skills first and retain recorded off-learnset attacks', () => {
  const catalog = JSON.parse(readFileSync('public/tools/s5-nature/data/catalog.json', 'utf8'));
  const target = catalog.spirits.find(spirit => spirit.name === '沉金兽');
  const nativeIds = catalog.learnsets.find(row => row.spiritId === target.id).skillIds;
  const ghost = catalog.skills.find(skill => skill.name === '撞鬼');
  const electric = catalog.skills.find(skill => skill.name === '通电');
  const before = [...nativeIds];
  expect(nativeIds).not.toContain(ghost.id);
  const options = incomingSkillOptions(catalog, target.id);
  const ids = options.map(skill => skill.id);
  expect(ids.slice(0, nativeIds.length)).toEqual(nativeIds);
  expect(ids).toContain(ghost.id);
  expect(ids).toContain(electric.id);
  expect(new Set(ids).size).toBe(ids.length);
  expect(options.filter(skill => !nativeIds.includes(skill.id)).every(skill => ['physical', 'magical'].includes(skill.category))).toBe(true);
  expect(nativeIds).toEqual(before);
  const saved = { profiles: [], preview: { incomingSkillIds: [ghost.id, electric.id], incomingDamages: [37, 32] } };
  expect(() => validatePreviewSettings(saved)).not.toThrow();
  expect(JSON.parse(JSON.stringify(saved)).preview.incomingSkillIds.every(id => ids.includes(id))).toBe(true);
});
