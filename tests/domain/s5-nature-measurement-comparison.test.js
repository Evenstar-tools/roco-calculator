import { expect, test } from 'vitest';
import { compareObservedHp, intersectNatureCases } from '../../public/tools/s5-nature/measurement-comparison.mjs';
import { formatGamePercent } from '../../public/tools/s5-nature/hp-inverse.mjs';
import { observationDifference, observationMatch, readIncomingObservation, readOutgoingObservations } from '../../public/tools/s5-nature/matchup-ui.mjs';

const prediction = (hpMax, natureId = `hp-${hpMax}`, targetLevel = 43) => ({
  hpMax, natureId, targetLevel, upStat: 'hp', downStat: 'speed', damage: 9999,
});
const preview = predictions => ({ skillName: '测试技能', predictions });
const compare = (damage, remainingPercent, predictions = [], format = 'game0') => compareObservedHp({
  outgoing: [preview(predictions)], observed: { 0: { damage, remainingPercent } }, format,
});

test('311 damage and 27% independently establish HP 421–426, without a damage-model match', () => {
  const result = compare(311, 27, [prediction(420), prediction(421), prediction(426), prediction(427)]);
  expect(result.status).toBe('matched');
  expect(result.ranges).toEqual([{ min: 421, max: 426 }]);
  expect(result.matchedPredictions.map(p => p.hpMax)).toEqual([421, 426]);
  expect(result.rows).toEqual([{ index: 0, skillName: '测试技能', damage: 311, remainingPercent: 27, min: 421, max: 426 }]);
});

test('an observed HP range is retained when every model HP is outside it', () => {
  const result = compare(311, 27, [prediction(498), prediction(544), prediction(452)]);
  expect(result.status).toBe('conflict');
  expect(result.ranges).toEqual([{ min: 421, max: 426 }]);
  expect(result.matchedPredictions).toEqual([]);
});

test('103 damage / 77% gives 430–447 and repeated full-health hits do not form a damage chain', () => {
  const row = preview([prediction(446)]), observation = { damage: 103, remainingPercent: 77 };
  const result = compareObservedHp({ outgoing: [row, row], observed: { 0: observation, 1: observation } });
  expect(result.status).toBe('matched');
  expect(result.ranges).toEqual([{ min: 430, max: 447 }]);
  expect(result.rows).toHaveLength(2);
  expect(result.matchedPredictions).toHaveLength(1);
});

test('different independent hits intersect and retain unique level/nature records', () => {
  const predictions = [prediction(440, 'up', 41), prediction(446, 'up', 42), prediction(447, 'up', 43)];
  const result = compareObservedHp({ outgoing: [preview(predictions), preview(predictions)], observed: {
    0: { damage: 103, remainingPercent: 77 }, 1: { damage: 300, remainingPercent: 33 },
  } });
  expect(result.ranges).toEqual([{ min: 442, max: 447 }]);
  expect(result.matchedPredictions.map(p => p.targetLevel)).toEqual([42, 43]);
});

test('contradictory full-health observations remain a conflict instead of choosing one row', () => {
  const result = compareObservedHp({ outgoing: [preview([prediction(446)]), preview([prediction(424)])], observed: {
    0: { damage: 103, remainingPercent: 77 }, 1: { damage: 311, remainingPercent: 27 },
  } });
  expect(result.status).toBe('conflict');
  expect(result.rows.map(r => [r.min, r.max])).toEqual([[430, 447], [421, 426]]);
  expect(result.ranges).toEqual([]);
  expect(result.matchedPredictions).toEqual([]);
});

test.each([
  ['game0', 77, 430, 447], ['round0', 77, 439, 457],
  ['floor0', 77, 448, 468], ['round1', 76.9, 445, 446],
])('%s honors its own exact display boundaries', (format, percent, min, max) => {
  const result = compare(103, percent, [prediction(min - 1), prediction(min), prediction(max), prediction(max + 1)], format);
  expect(result.ranges).toEqual([{ min, max }]);
  expect(result.matchedPredictions.map(p => p.hpMax)).toEqual([min, max]);
});

test.each(['game0', 'round0', 'floor0', 'round1'])('boundaries reproduce displayed integer HP in %s', format => {
  const show = percent => format === 'game0' ? formatGamePercent(percent)
    : format === 'floor0' ? Math.floor(percent + 1e-9)
      : format === 'round1' ? Math.round((percent + 1e-9) * 10) / 10 : Math.round(percent + 1e-9);
  for (const damage of [1, 7, 28, 103, 311]) for (const percent of [1, 27, 50, 77, 98]) {
    const expected = [];
    for (let hp = damage + 1; hp < 100000; hp++) if (show((hp - damage) * 100 / hp) === percent) expected.push(hp);
    const result = compare(damage, percent, [], format);
    expect(result.ranges).toEqual(expected.length ? [{ min: expected[0], max: expected.at(-1) }] : []);
  }
});

test('99% with game/floor display provides a lower bound, never an invented search cap', () => {
  expect(compare(103, 99, [prediction(5151)], 'game0').ranges).toEqual([{ min: 5151, max: null }]);
  expect(compare(103, 99, [prediction(10300)], 'floor0').ranges).toEqual([{ min: 10300, max: null }]);
});

test('large maximum HP does not trigger a per-HP scan or truncate at 10000', () => {
  const result = compare(311000000, 27, [prediction(425000000)]);
  expect(result.ranges).toEqual([{ min: 420270271, max: 426027397 }]);
  expect(result.status).toBe('matched');
});

test('missing, invalid, defeated and no-loss observations are excluded from HP evidence', () => {
  const invalid = [undefined, {}, { damage: 103 }, { remainingPercent: 77 },
    { damage: 0, remainingPercent: 77 }, { damage: -1, remainingPercent: 77 },
    { damage: 103, remainingPercent: 0 }, { damage: 103, remainingPercent: 100 },
    { damage: 103, remainingPercent: 76.9 }, { damage: 103, remainingPercent: 77, invalid: true }];
  for (const observation of invalid) expect(compareObservedHp({ outgoing: [preview([prediction(446)])], observed: { 0: observation } }))
    .toEqual({ rows: [], status: 'empty', ranges: [], matchedPredictions: [], hasHpModel: true });
});

test('a valid display value with no integer HP solution is a real conflict', () => {
  const result = compare(1, 0.1, [prediction(2)], 'round1');
  expect(result.status).toBe('conflict');
  expect(result.rows).toHaveLength(1);
  expect(result.ranges).toEqual([]);
});

test('HP model matches even when all selected moves are unsupported', () => {
  const record = prediction(446, 'hp-up', 41);
  const result = compareObservedHp({
    outgoing: [{ status: 'unsupported', skillName: '变化技能', predictions: [] }],
    observed: { 0: { damage: 103, remainingPercent: 77 } }, hpPredictions: [record],
  });
  expect(result.hasHpModel).toBe(true);
  expect(result.status).toBe('matched');
  expect(result.ranges).toEqual([{ min: 430, max: 447 }]);
  expect(result.matchedPredictions).toEqual([record]);
});

test('missing HP model retains the observed interval without claiming a model mismatch', () => {
  const result = compareObservedHp({
    outgoing: [{ status: 'unsupported', skillName: '未配置技能', predictions: [] }],
    observed: { 0: { damage: 311, remainingPercent: 27 } },
  });
  expect(result.hasHpModel).toBe(false);
  expect(result.ranges).toEqual([{ min: 421, max: 426 }]);
  expect(result.matchedPredictions).toEqual([]);
});

test('an explicit empty HP model suppresses the legacy outgoing-prediction fallback', () => {
  const options = { outgoing: [preview([prediction(446)])], observed: { 0: { damage: 103, remainingPercent: 77 } } };
  expect(compareObservedHp(options).hasHpModel).toBe(true);
  const result = compareObservedHp({ ...options, hpPredictions: [] });
  expect(result.hasHpModel).toBe(false);
  expect(result.ranges).toEqual([{ min: 430, max: 447 }]);
  expect(result.matchedPredictions).toEqual([]);
});

test('invalid HP values do not establish model availability', () => {
  const result = compareObservedHp({ hpPredictions: [null, {}, prediction(0), prediction(-1), prediction(NaN), prediction(446.5)] });
  expect(result).toEqual({ rows: [], status: 'empty', ranges: [], matchedPredictions: [], hasHpModel: false });
});

test.each([
  [50, [50], [48, 49, 51, 52]],
  [51, [50, 51, 52], [49, 53]],
  [52, [51, 52, 53], [50, 54]],
])('predicted damage %i uses its own threshold for outgoing and incoming observations', (damage, accepted, rejected) => {
  const item = { damage, remainingPercent: 76.1 };
  for (const input of [...accepted, ...rejected]) {
    const expected = accepted.includes(input);
    const outgoing = readOutgoingObservations({ observed: { 0: { damage: input } } }).observed[0];
    const incoming = readIncomingObservation({ incomingDamages: [input] }, 0, {});
    for (const observation of [outgoing, incoming]) {
      expect(observationMatch(item, observation)).toBe(expected);
      expect(observationDifference({ predictions: [item] }, observation) === '').toBe(expected);
    }
  }
});

test('one-point damage tolerance still requires an exact percentage on the same prediction', () => {
  const predictions = [{ damage: 51, remainingPercent: 76.1 }, { damage: 70, remainingPercent: 77.1 }];
  const row = { predictions };
  expect(predictions.filter(item => observationMatch(item, { damage: 50, remainingPercent: 77 }))).toEqual([predictions[0]]);
  expect(predictions.filter(item => observationMatch(item, { damage: 50, remainingPercent: 78 }))).toEqual([]);
  expect(observationDifference(row, { damage: 50, remainingPercent: 77 })).toBe('');
  expect(observationDifference(row, { damage: 50, remainingPercent: 78 })).toBe('伤害吻合，计算余血 77%');
});

test.each([
  ['game0', 76.41, 77, 1], ['round0', 76.41, 76, 1],
  ['floor0', 76.91, 76, 1], ['round1', 76.46, 76.5, 0.1],
])('damage tolerance leaves %s percentage precision unchanged', (format, remainingPercent, displayed, step) => {
  const item = { damage: 51, remainingPercent };
  expect(observationMatch(item, { damage: 52, remainingPercent: displayed }, format)).toBe(true);
  for (const percent of [displayed - step, displayed + step]) {
    expect(observationMatch(item, { damage: 52, remainingPercent: percent }, format)).toBe(false);
  }
});

test('per-hit observations are converted before applying one point of total-damage tolerance', () => {
  const item = { damage: 51 }, row = { hitCount: 4, predictions: [item] };
  const near = readIncomingObservation({ incomingDamages: [13], incomingDamageUnits: ['perHit'] }, 0, row);
  const far = readIncomingObservation({ incomingDamages: [12], incomingDamageUnits: ['perHit'] }, 0, row);
  expect(near).toMatchObject({ damage: 52, inputDamage: 13, unit: 'perHit' });
  expect(far).toMatchObject({ damage: 48, inputDamage: 12, unit: 'perHit' });
  expect(observationMatch(item, near)).toBe(true);
  expect(observationDifference(row, near)).toBe('');
  expect(observationMatch(item, far)).toBe(false);
  expect(observationDifference(row, far)).toBe('计算 51，实测比最近值少 3');
});

test('damage tolerance never coerces malformed or fractional input into a match', () => {
  const item = { damage: 51 };
  for (const damage of ['51', 50.5, 51.5, NaN, Infinity, -1]) {
    expect(observationMatch(item, { damage })).toBe(false);
    const outgoing = readOutgoingObservations({ observed: { 0: { damage } } });
    const incoming = readIncomingObservation({ incomingDamages: [damage] }, 0, {});
    expect(outgoing.invalid).toBe(true);
    expect(observationMatch(item, outgoing.observed[0])).toBe(false);
    expect(observationMatch(item, incoming)).toBe(false);
    expect(observationDifference({ predictions: [item] }, incoming)).toBe('');
  }
  expect(observationMatch(item, { damage: 51, invalid: true })).toBe(false);
});


const testedNatures = [
  { id: 'hp-up', upStat: 'hp', downStat: 'speed' },
  { id: 'defense-up', upStat: 'physicalDefense', downStat: 'speed' },
];

test('unmeasured nature groups retain the full level/nature set without reporting a conflict', () => {
  expect(intersectNatureCases(testedNatures, [41, 42], [])).toEqual({
    candidates: ['41:hp-up', '41:defense-up', '42:hp-up', '42:defense-up'],
    matching: testedNatures, used: 0, conflict: false,
  });
});

test('every recorded hit must share a valid level/nature candidate', () => {
  const result = intersectNatureCases(testedNatures, [41, 42], [
    ['41:hp-up', '41:defense-up', '42:hp-up'],
    ['41:hp-up', '42:hp-up', '42:defense-up'],
    ['42:hp-up', '42:hp-up', '43:hp-up', '42:unknown'],
  ]);
  expect(result).toEqual({ candidates: ['42:hp-up'], matching: [testedNatures[0]], used: 3, conflict: false });
});

test('the same nature at different levels cannot combine into a false match', () => {
  expect(intersectNatureCases(testedNatures, [41, 42], [['41:hp-up'], ['42:hp-up']]))
    .toEqual({ candidates: [], matching: [], used: 2, conflict: true });
});

test.each([
  [[]],
  [['42:hp-up'], []],
  [[], ['42:hp-up']],
  [['42:hp-up'], ['42:defense-up']],
])('an unmatched or contradictory recorded group remains a conflict: %j', (...groups) => {
  expect(intersectNatureCases(testedNatures, [42], groups))
    .toEqual({ candidates: [], matching: [], used: groups.length, conflict: true });
});

test('direct maximum HP and inferred HP evidence must intersect without borrowing adjacent HP values', () => {
  const hpModel = [prediction(446, 'hp-up', 42), prediction(447, 'defense-up', 42)];
  const inferred = compare(103, 77, hpModel);
  const key = item => `${item.targetLevel}:${item.natureId}`;
  const directHp = hpModel.filter(item => item.hpMax === 446).map(key);
  const hpGroups = [inferred.matchedPredictions.map(key), directHp];
  expect(intersectNatureCases(testedNatures, [42], hpGroups))
    .toEqual({ candidates: ['42:hp-up'], matching: [testedNatures[0]], used: 2, conflict: false });
  expect(intersectNatureCases(testedNatures, [42], [...hpGroups, ['42:defense-up']]))
    .toEqual({ candidates: [], matching: [], used: 3, conflict: true });
});
