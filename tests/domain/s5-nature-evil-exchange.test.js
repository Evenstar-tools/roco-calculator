import { expect, test } from 'vitest';
import { compareEvilExchange, evilExchangeHealing, evilExchangeHealingRange } from '../../public/tools/s5-nature/evil-exchange.mjs';
import { calculateWildBodyHpCandidates, calculateWildHp } from '../../public/tools/s5-nature/wild-hp.mjs';

const natures = [
  { id: 'hp-down', upStat: 'physicalDefense', downStat: 'hp' },
  { id: 'neutral', upStat: 'magicalAttack', downStat: 'physicalAttack' },
  { id: 'hp-up', upStat: 'hp', downStat: 'speed' },
];
const whale41 = [{ level: 41, down: 231, neutral: 254, up: 277 }];
const compare = (healing, hpByLevel = whale41, suppliedNatures = natures) =>
  compareEvilExchange({ healing, hpByLevel, natures: suppliedNatures });

test.each([[231, 208], [254, 229], [277, 250], [224, 202], [246, 222], [268, 242]])(
  'body HP %i heals exactly %i without ordinary or shiny shield scaling', (hp, healing) => {
    expect(evilExchangeHealing(hp)).toBe(healing);
  },
);

test.each([[208, 'hp-down', 231], [229, 'neutral', 254], [250, 'hp-up', 277]])(
  'whale41 healing %i matches only %s', (healing, natureId, hpMax) => {
    const result = compare(healing);
    expect(result).toMatchObject({ used: true, invalid: false, status: 'matched', candidates: [`41:${natureId}`] });
    expect(result.matching).toEqual(natures.filter(nature => nature.id === natureId));
    expect(result.predictions).toHaveLength(3);
    expect(result.predictions.find(prediction => prediction.natureId === natureId)).toMatchObject({
      targetLevel: 41, natureId, upStat: result.matching[0].upStat,
      downStat: result.matching[0].downStat, hpMax, healing,
    });
  },
);

test('hammer42 uses body HP224/246/268 rather than shield HP448/492/536 or672/738/804', () => {
  const hpByLevel = [{ level: 42, down: 224, neutral: 246, up: 268 }];
  expect(compare(222, hpByLevel).candidates).toEqual(['42:neutral']);
  expect(compare(222, hpByLevel).predictions.map(prediction => [prediction.hpMax, prediction.healing]))
    .toEqual([[224, 202], [246, 222], [268, 242]]);
  for (const scaledHealing of [443, 665]) expect(compare(scaledHealing, hpByLevel).status).toBe('conflict');
});

test('ceil collisions retain every matching body HP and nature', () => {
  const result = compare(9, [{ level: 42, down: 9, neutral: 10, up: 11 }]);
  expect(result.candidates).toEqual(['42:hp-down', '42:neutral']);
  expect(result.matching).toEqual(natures.slice(0, 2));
  expect(result.predictions.map(prediction => prediction.healing)).toEqual([9, 9, 10]);
});

test('all-level predictions retain the level/nature pair and never transfer a match to another level', () => {
  const hpByLevel = [...whale41,
    { level: 42, down: 234, neutral: 258, up: 282 },
    { level: 43, down: 237, neutral: 261, up: 285 }];
  expect(compare(229, hpByLevel).candidates).toEqual(['41:neutral']);
  expect(compare(233, hpByLevel).candidates).toEqual(['42:neutral']);
  expect(compare(235, hpByLevel).candidates).toEqual(['43:neutral']);
  expect(compare(229, hpByLevel.slice(1)).status).toBe('conflict');
  expect(compare(229, hpByLevel).predictions).toHaveLength(9);
});

test('exact integer comparison rejects adjacent healing instead of applying damage tolerance', () => {
  expect(compare(228).status).toBe('conflict');
  expect(compare(230).status).toBe('conflict');
  expect(compare(' 229 ').candidates).toEqual(['41:neutral']);
});

test.each([undefined, null, '', '  '])('empty healing %j contributes no observation or invalid flag', healing => {
  expect(compare(healing)).toEqual({ used: false, invalid: false, status: 'unused',
    candidates: [], matching: [], predictions: [] });
});

test.each([undefined, null, '', '  '])('unused healing %j ignores retained invalid percentage conditions', healing => {
  for (const targetPercent of [10.123, 101, 100]) {
    expect(compareEvilExchange({ healing, hpByLevel: whale41, natures, targetPercent })).toEqual({
      used: false, invalid: false, status: 'unused', candidates: [], matching: [], predictions: [],
    });
  }
});

test.each([0, -1, 1.5, '0', '-1', '229.0', '1.5', 'abc', '229hp', '0xe5', '2.29e2', true, {}, [], NaN,
  Infinity, Number.MAX_SAFE_INTEGER + 1, '9007199254740992'])('invalid healing %j cannot constrain nature', healing => {
  expect(compare(healing)).toEqual({ used: true, invalid: true, status: 'invalid',
    candidates: [], matching: [], predictions: [] });
});

test('a supplied integer without a complete HP model stays unavailable rather than matched/conflict', () => {
  for (const hpByLevel of [undefined, null, [], [{}], [{ level: 42, down: 224, neutral: null, up: 268 }],
    [{ level: 0, down: 224, neutral: 246, up: 268 }], [...whale41, ...whale41]]) {
    expect(compareEvilExchange({ healing: 229, hpByLevel, natures })).toEqual({ used: true, invalid: false,
      status: 'unavailable', candidates: [], matching: [], predictions: [] });
  }
  expect(compare(229, whale41, []).status).toBe('unavailable');
  expect(compare(229, whale41, [{ id: 'bad', upStat: 'hp', downStat: 'hp' }]).status).toBe('unavailable');
});

test('integer ceiling remains exact at large values and multiples of ten', () => {
  expect(evilExchangeHealing(10)).toBe(9);
  expect(evilExchangeHealing(11)).toBe(10);
  expect(evilExchangeHealing(Number.MAX_SAFE_INTEGER)).toBe(8106479329266892);
});

test.each([undefined, 0, -1, 1.5, '254', NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
  'the arithmetic helper rejects invalid body HP %j', hp => {
    expect(() => evilExchangeHealing(hp)).toThrow(RangeError);
  },
);

test.each([
  [254, 20, 204], [254, 25, 191], [254, 0, 254], [254, 12.5, 223], [254, 100, 0],
  [240, 20, 192], [240, 25, 180], [240, 12.5, 210], [240, 0.29, 240], [10000, 0.29, 9971],
])('body HP%i at exact target percentage %s heals %i', (hp, targetPercent, healing) => {
  expect(evilExchangeHealing(hp, targetPercent)).toBe(healing);
});

test('changing the exact target percentage recomputes every prediction and matches', () => {
  const input = { healing: 204, hpByLevel: whale41, natures };
  expect(compareEvilExchange(input).status).toBe('conflict');
  const at20 = compareEvilExchange({ ...input, targetPercent: 20 });
  expect(at20.candidates).toEqual(['41:neutral']);
  expect(at20.predictions.map(prediction => prediction.healing)).toEqual([185, 204, 222]);
  expect(compareEvilExchange({ ...input, targetPercent: 25 }).status).toBe('conflict');
  expect(compareEvilExchange({ ...input, healing: 191, targetPercent: 25 }).candidates).toEqual(['41:neutral']);
  expect(compareEvilExchange({ ...input, healing: 254, targetPercent: 0 }).candidates).toEqual(['41:neutral']);
  expect(compareEvilExchange({ ...input, healing: 223, targetPercent: 12.5 }).candidates).toEqual(['41:neutral']);
});

test.each([0, '0', 229])('100%% target HP supplies no HP constraint for healing %j', healing => {
  expect(compareEvilExchange({ healing, hpByLevel: whale41, natures, targetPercent: 100 })).toEqual({
    used: true, invalid: false, status: 'unavailable', reason: 'no-healing',
    candidates: [], matching: [], predictions: [],
  });
});

test.each([-0.01, 100.01, 10.123, 101, 12.345, 0.001, 0.29000000000000004, '10', '', null, NaN, Infinity, true])(
  'invalid exact target percentage %j is distinguished from invalid healing', targetPercent => {
    expect(() => evilExchangeHealing(254, targetPercent)).toThrow(RangeError);
    expect(compareEvilExchange({ healing: 229, hpByLevel: whale41, natures, targetPercent })).toEqual({
      used: true, invalid: true, status: 'invalid', reason: 'invalid-target-percent',
      candidates: [], matching: [], predictions: [],
    });
  },
);

// The display switch is persistent; selecting Par enables it once, not on every render.
import { normalizePlayerFlow } from '../../public/tools/s5-nature/player-flow.mjs';
test('Par selection enables the fifth row while explicit off and other-profile pinning survive',()=>{
  const catalog={natures:[]},par='spirit_684f5cd1fec1df27';
  const first=normalizePlayerFlow({},'whale',catalog,par);
  expect(first.exchange.enabled).toBe(true);
  const off=normalizePlayerFlow({...first,exchange:{...first.exchange,enabled:false,healing:'257'}},'whale',catalog,par);
  expect(off.exchange).toEqual({enabled:false,healing:'257',percent:10,percentMode:'display',ownSpiritId:par});
  expect(normalizePlayerFlow(first,'whale',catalog,'dimo').exchange.enabled).toBe(true);
  expect(normalizePlayerFlow({...off,exchange:{...off.exchange,ownSpiritId:'dimo'}},'whale',catalog,par).exchange.enabled).toBe(true);
});

test('custom-level exchange uses the same body HP and exact healing observation', () => {
  const result=compare(260,[{level:50,down:261,neutral:288,up:315}]);
  expect(result.status).toBe('matched');
  expect(result.candidates).toEqual(['50:neutral']);
});

const bodyRow = (race, level) => ({ level, ...Object.fromEntries(natures.map((nature, i) =>
  [['down', 'neutral', 'up'][i], calculateWildBodyHpCandidates(race, level, nature)])) });

// Battle/capture frames, not the creators' estimated tables. See the source
// timestamps and the distinct observation/model boundaries in the audit doc.
test.each([
  ['BV1WiW96DEKP', 63, 42, 149, 'neutral'], // 7s green149; 46s 慎重.
  ['BV1JnWn6XEmi/first', 87, 41, 170, 'neutral'], // 34s; 63s 聪明.
  ['BV1JnWn6XEmi/second', 87, 42, 172, 'neutral'], // 74.2s; 91s 莽撞.
  ['BV1osWE63EcY', 137, 43, 257, 'hp-up'], // 21s; 76s 粗心.
])('%s green healing and captured HP nature agree', (_source, race, level, healing, natureId) => {
  const result = compareEvilExchange({ healing, hpByLevel: [bodyRow(race, level)], natures, percentMode: 'display' });
  expect(result.status).toBe('matched');
  expect(result.candidates).toEqual([`${level}:${natureId}`]);
});

test('bird149 fails the old shield/2 assumption; the two-sided reading supports body164, remaining15', () => {
  const oldHp = calculateWildHp(63, 42, natures[1]) / 2;
  expect(oldHp).toBe(158);
  expect(evilExchangeHealing(oldHp)).toBe(143);
  expect(evilExchangeHealingRange(oldHp)).toEqual({ min: 143, max: 143 });
  expect(calculateWildBodyHpCandidates(63, 42, natures[1])).toContain(164);
  expect(evilExchangeHealingRange(164)).toEqual({ min: 148, max: 149 });
  expect(164 - 15).toBe(149);
  expect(Math.ceil(100 * 15 / 164)).toBe(10);
  expect(Math.floor(442 * 15 / 164)).toBe(40);
  expect(442 - 40).toBe(402);
});

test('display percentage is inverted at every integer HP, including the special99/100 boundary', () => {
  for (const hp of [9, 100, 158, 164, 254, 285, 1001]) {
    const byDisplay = new Map();
    for (let current = 0; current <= hp; current++) {
      // The package UI consumer rounds up except above99%, where it floors.
      const ratio = 100 * current / hp;
      const display = ratio > 99 ? Math.floor(ratio) : Math.ceil(ratio);
      const values = byDisplay.get(display) || [];
      values.push(hp - current); byDisplay.set(display, values);
    }
    for (let percent = 0; percent <= 100; percent++) {
      const values = byDisplay.get(percent);
      expect(evilExchangeHealingRange(hp, percent)).toEqual(values ? {
        min: Math.min(...values), max: Math.max(...values),
      } : null);
    }
  }
});

test('unknown talents and rounded percentage retain overlapping natures without duplicate cases', () => {
  const input = { healing: 22, hpByLevel: [bodyRow(63, 42)], natures, targetPercent: 85, percentMode: 'display' };
  const result = compareEvilExchange(input);
  expect(result.candidates).toEqual(['42:hp-down']);
  const overlap = compareEvilExchange({ ...input, healing: 24 });
  expect(overlap.candidates).toEqual(['42:hp-down', '42:neutral']);
  expect(new Set(overlap.candidates).size).toBe(overlap.candidates.length);
});

test('display mode rejects decimals; legacy custom percentages keep their exact meaning', () => {
  expect(compareEvilExchange({ healing: 149, hpByLevel: [bodyRow(63, 42)], natures,
    targetPercent: 10.5, percentMode: 'display' })).toMatchObject({ invalid: true, reason: 'invalid-target-percent' });
  const saved = normalizePlayerFlow({ exchange: { percent: 12.5, healing: '223' } }, 'whale', { natures }, 'par');
  expect(saved.exchange).toMatchObject({ percentMode: 'exact', percent: 12.5, healing: '223' });
  const integer = normalizePlayerFlow({ exchange: { percent: 85, healing: '24' } }, 'bird', { natures }, 'par');
  expect(integer.exchange).toMatchObject({ percentMode: 'exact', percent: 85, healing: '24' });
  expect(compareEvilExchange({ healing: Number(integer.exchange.healing), hpByLevel: [bodyRow(63, 42)], natures,
    targetPercent: integer.exchange.percent, percentMode: integer.exchange.percentMode }).candidates).toEqual(['42:neutral']);
  expect(normalizePlayerFlow({ exchange: { percent: 85, percentMode: 'display' } }, 'bird', { natures }, 'par').exchange.percentMode).toBe('display');
  expect(normalizePlayerFlow({ exchange: { percent: 10 } }, 'whale', { natures }, 'par').exchange.percentMode).toBe('display');
  expect(normalizePlayerFlow({ exchange: { percent: 10, percentMode: 'exact' } }, 'whale', { natures }, 'par').exchange.percentMode).toBe('exact');
});
