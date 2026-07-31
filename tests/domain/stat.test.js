import { describe, expect, test } from "vitest";
import {
  calculateAllPanelStats,
  calculatePanelStat,
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
  test("matches the original site's ordinary half-up rounding", () => {
    expect(statRound(115.5, 0)).toBe(116);
    expect(statRound(114.5, 0)).toBe(115);
    expect(statRound(115.5, 1)).toBe(116);
  });
});

describe("calculatePanelStat", () => {
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

  test("matches the reference zero-IV half tie for Water Spirit speed", () => {
    expect(
      calculatePanelStat({
        kind: "speed",
        race: 85,
        displayIv: 0,
        natureMultiplier: 1,
      }),
    ).toBe(153);
  });

  test.each([
    ["non-HP race 105", "magicalDefense", 105, 175],
    ["non-HP race 125", "physicalDefense", 125, 197],
    ["HP race 95", "hp", 95, 331],
  ])("matches the original-site zero-IV half tie for %s", (_label, kind, race, expected) => {
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
