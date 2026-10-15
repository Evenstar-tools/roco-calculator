import { describe, expect, test } from "vitest";
import { abilityAdjustedStat, defenseStatForDamage } from "../../src/domain/skill-result/numeric.js";
import {
  calculateAllPanelStats,
  calculatePanelStat,
  hasCompleteRaceStats,
  normalizeDisplayIv,
  statRound,
} from "../../src/domain/stat.js";

describe("normalizeDisplayIv", () => {
  test("maps displayed individual 60 to normalized qualification 10", () => {
    expect(normalizeDisplayIv(60)).toBe(10);
  });

  test("keeps the original-site zero-to-one-hundred visible scale", () => {
    expect(normalizeDisplayIv(-1)).toBe(0);
    expect(normalizeDisplayIv(100)).toBeCloseTo(100 / 6);
    expect(normalizeDisplayIv(101)).toBeCloseTo(100 / 6);
  });
});

describe("statRound", () => {
  test("preserves base-panel nearest rounding at single precision", () => {
    expect(statRound(115.5)).toBe(116);
    expect(statRound(114.5)).toBe(115);
    expect(statRound(115.49)).toBe(115);
  });
});

describe("calculatePanelStat", () => {
  test("zero-IV Didi defense retains the measured 132", () => {
    expect(calculatePanelStat({
      kind: "physicalDefense",
      race: 65,
      displayIv: 0,
      natureMultiplier: 1,
    })).toBe(132);
  });
  test("calculates Sonic Dog physical attack as 271", () => {
    expect(
      calculatePanelStat({
        kind: "physicalAttack",
        race: 128,
        displayIv: 60,
        natureMultiplier: 1.2,
      }),
    ).toBe(271);
  });

  test("calculates Water Spirit HP as 434", () => {
    expect(
      calculatePanelStat({
        kind: "hp",
        race: 125,
        displayIv: 60,
        natureMultiplier: 1,
      }),
    ).toBe(434);
  });

  test("rounds the zero-IV Water Spirit speed half tie up", () => {
    expect(
      calculatePanelStat({
        kind: "speed",
        race: 85,
        displayIv: 0,
        natureMultiplier: 1,
      }),
    ).toBe(154);
  });

  test.each([
    ["non-HP race 105", "magicalDefense", 105, 175],
    ["non-HP race 125", "physicalDefense", 125, 198],
    ["HP race 95", "hp", 95, 332],
  ])("applies one precision-aware base-panel rule for %s", (_label, kind, race, expected) => {
    expect(
      calculatePanelStat({
        kind,
        race,
        displayIv: 0,
        natureMultiplier: 1,
      }),
    ).toBe(expected);
  });
});

test("calculates all six panel stats from the same normalized input shape", () => {
  expect(
    calculateAllPanelStats({
      raceStats: {
        physicalAttack: 128,
        magicalAttack: 82,
        speed: 116,
        hp: 125,
        physicalDefense: 100,
        magicalDefense: 90,
      },
      displayIvs: {
        physicalAttack: 60,
        magicalAttack: 60,
        speed: 60,
        hp: 60,
        physicalDefense: 60,
        magicalDefense: 60,
      },
      natureMultipliers: {
        physicalAttack: 1.2,
      },
    }),
  ).toMatchObject({
    physicalAttack: 271,
    hp: 434,
  });
});

test("rejects a preview placeholder instead of calculating from missing stats", () => {
  expect(hasCompleteRaceStats(null)).toBe(false);
  expect(hasCompleteRaceStats({
    physicalAttack: 1,
    magicalAttack: 1,
    speed: 1,
    hp: 1,
    physicalDefense: 1,
    magicalDefense: "",
  })).toBe(false);
  expect(() => calculateAllPanelStats({ raceStats: null }))
    .toThrow("种族值待确认");
});


test.each(["physicalAttack", "magicalAttack", "physicalDefense", "magicalDefense"])("%s 的基础面板保持游戏精度与性格计算顺序", (kind) => {
  expect(calculatePanelStat({ kind, race: 105, displayIv: 0 })).toBe(175);
  expect(calculatePanelStat({ kind, race: 128, displayIv: 60, natureMultiplier: 1.2 })).toBe(271);
  expect(calculatePanelStat({ kind, race: 128, displayIv: 60, natureMultiplier: 0.9 })).toBe(216);
  // 种族110、个体60的缩放值恰为154，不得因浮点乘法被截成153。
  expect(calculatePanelStat({ kind, race: 110, displayIv: 60 })).toBe(214);
});


test("整数强化不因浮点误差少一位，减防小数继续参与伤害除法", () => {
  expect(abilityAdjustedStat(90, 4)).toBe(126);
  expect(defenseStatForDamage(55, 5)).toBe(82);
  expect(defenseStatForDamage(163, -4)).toBeCloseTo(163 / 1.4, 12);
});


test.each([
  ["彩蝶鲨", { hp:90,physicalAttack:98,magicalAttack:98,physicalDefense:105,magicalDefense:105,speed:125 }, { hp:374,physicalAttack:156,magicalAttack:201,physicalDefense:175,magicalDefense:175,speed:267 }],
  ["霹雳迪迪", { hp:104,physicalAttack:119,magicalAttack:139,physicalDefense:65,magicalDefense:133,speed:130 }, { hp:398,physicalAttack:177,magicalAttack:246,physicalDefense:132,magicalDefense:206,speed:273 }],
])("2026-10-15游戏真实六项能力：%s", (_name, raceStats, expected) => {
  expect(calculateAllPanelStats({
    raceStats,
    displayIvs: {hp:60,physicalAttack:0,magicalAttack:60,physicalDefense:0,magicalDefense:0,speed:60},
    natureMultipliers:{physicalAttack:0.9,speed:1.2},
  })).toEqual(expected);
});


test.each([
  ["hp",65,0,281],
  ["hp",105,0,349],
  ["speed",75,60,176],
  ["speed",75,0,143],
])("双防校准不扩改未确认的HP和速度边界：%s/%s/%s", (kind,race,displayIv,expected) => {
  expect(calculatePanelStat({kind,race,displayIv})).toBe(expected);
});
