import { expect, test } from 'vitest';
import { compareObservedHp } from '../../public/tools/s5-nature/measurement-comparison.mjs';
import { formatGamePercent } from '../../public/tools/s5-nature/hp-inverse.mjs';

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
