import { describe, expect, test } from "vitest";
import {
  analyzeSpeedBreakpoints,
  recommendDurabilityBuilds,
} from "../../src/features/team-ability/domain/ability-analysis.js";

const RACE_STATS = Object.freeze({
  physicalAttack: 100,
  magicalAttack: 100,
  speed: 100,
  hp: 100,
  physicalDefense: 100,
  magicalDefense: 100,
});

function configuration(displayIvs = {}) {
  return {
    raceStats: RACE_STATS,
    natureId: "neutral",
    displayIvs: {
      physicalAttack: 0,
      magicalAttack: 0,
      speed: 0,
      hp: 0,
      physicalDefense: 0,
      magicalDefense: 0,
      ...displayIvs,
    },
  };
}

describe("analyzeSpeedBreakpoints", () => {
  test("reports when enabling the binary speed investment reaches the target", () => {
    expect(
      analyzeSpeedBreakpoints({
        configuration: configuration({ hp: 60, physicalDefense: 60 }),
        target: { speed: 180 },
        snapshotId: "fixture-v1",
      }),
    ).toEqual({
      rulesetId: "binary-60-max3-v1",
      snapshotId: "fixture-v1",
      status: "REQUIRES_SPEED_INVESTMENT",
      currentSpeed: 170,
      investedSpeed: 203,
      targetSpeed: 180,
      needsSpeedInvestment: true,
      validation: expect.objectContaining({ valid: true, activeCount: 2 }),
    });
  });

  test("uses the existing nature multipliers for both speed states", () => {
    expect(
      analyzeSpeedBreakpoints({
        configuration: {
          ...configuration({ hp: 60 }),
          nature: "timid",
          natureId: undefined,
          level: 60,
          effortValues: { speed: 50 },
        },
        target: 200,
      }),
    ).toMatchObject({
      status: "REQUIRES_SPEED_INVESTMENT",
      currentSpeed: 194,
      investedSpeed: 234,
      targetSpeed: 200,
    });
  });

  test("pauses speed analysis for a historical non-binary configuration", () => {
    const result = analyzeSpeedBreakpoints({
      configuration: configuration({ hp: 54 }),
      target: 180,
      snapshotId: "fixture-v1",
    });

    expect(result).toMatchObject({
      rulesetId: "binary-60-max3-v1",
      snapshotId: "fixture-v1",
      status: "INVALID_INVESTMENT",
      currentSpeed: null,
      investedSpeed: null,
      targetSpeed: 180,
      needsSpeedInvestment: false,
      conflicts: [
        {
          code: "INVALID_INVESTMENT",
          violations: [
            {
              code: "UNSUPPORTED_INVESTMENT_VALUE",
              stat: "hp",
              value: 54,
            },
          ],
        },
      ],
    });
    expect(result.validation.valid).toBe(false);
  });

  test.each([
    ["CURRENTLY_REACHED", { hp: 60 }, 170],
    ["NO_INVESTMENT_SLOT", { hp: 60, physicalDefense: 60, magicalDefense: 60 }, 180],
    ["UNREACHABLE_WITH_SPEED_INVESTMENT", { hp: 60 }, 204],
  ])("reports %s without inventing a partial speed investment", (status, displayIvs, target) => {
    const result = analyzeSpeedBreakpoints({
      configuration: configuration(displayIvs),
      target,
    });

    expect(result.status).toBe(status);
    expect(result.currentSpeed).toBe(170);
    expect(result.investedSpeed).toBe(203);
    expect(result.needsSpeedInvestment).toBe(false);
  });

  test("returns an invalid-race conflict for a placeholder speed target", () => {
    const result = analyzeSpeedBreakpoints({
      configuration: { ...configuration(), raceStats: null },
      target: 180,
    });

    expect(result).toMatchObject({
      status: "INVALID_CONFIGURATION",
      currentSpeed: null,
      investedSpeed: null,
      targetSpeed: 180,
      needsSpeedInvestment: false,
      conflicts: [{ code: "INVALID_RACE_STATS" }],
    });
  });
});

describe("recommendDurabilityBuilds", () => {
  test("enumerates all 42 legal binary builds and returns one best build per durability goal", () => {
    const result = recommendDurabilityBuilds({
      current: configuration(),
      objective: "combined",
      speedConstraint: { mode: "unlocked" },
      snapshotId: "fixture-v1",
    });

    expect(result).toMatchObject({
      status: "ok",
      rulesetId: "binary-60-max3-v1",
      snapshotId: "fixture-v1",
      primaryObjective: "combined",
      candidatesEvaluated: 42,
      conflicts: [],
      results: {
        physical: {
          objective: "physical",
          values: {
            physicalAttack: 0,
            magicalAttack: 0,
            speed: 0,
            hp: 60,
            physicalDefense: 60,
            magicalDefense: 0,
          },
          panel: {
            hp: 391,
            physicalDefense: 203,
            magicalDefense: 170,
          },
          durability: {
            display: { physical: 79373, magical: 66470, combined: 36175 },
          },
          changedDimensions: ["hp", "physicalDefense"],
          speedRedundancy: 0,
          stableKey: "000110",
        },
        magical: {
          objective: "magical",
          values: {
            physicalAttack: 0,
            magicalAttack: 0,
            speed: 0,
            hp: 60,
            physicalDefense: 0,
            magicalDefense: 60,
          },
          changedDimensions: ["hp", "magicalDefense"],
          stableKey: "000101",
        },
        combined: {
          objective: "combined",
          values: {
            physicalAttack: 0,
            magicalAttack: 0,
            speed: 0,
            hp: 60,
            physicalDefense: 60,
            magicalDefense: 60,
          },
          durability: {
            display: { physical: 79373, magical: 79373, combined: 39687 },
          },
          changedDimensions: ["hp", "physicalDefense", "magicalDefense"],
          stableKey: "000111",
        },
      },
    });
  });

  test("uses speed 60 as one of the three slots when a reachable target requires it", () => {
    const result = recommendDurabilityBuilds({
      current: configuration(),
      speedConstraint: { mode: "at-least", targetSpeed: 180 },
    });

    expect(result.status).toBe("ok");
    expect(result.candidatesEvaluated).toBe(42);
    expect(result.results.physical).toMatchObject({
      values: { speed: 60, hp: 60, physicalDefense: 60 },
      panel: { speed: 203 },
      speedRedundancy: 23,
      stableKey: "001110",
    });
    expect(result.results.combined.stableKey).toBe("001101");
    for (const candidate of Object.values(result.results)) {
      expect(Object.values(candidate.values).filter((value) => value === 60))
        .toHaveLength(3);
    }
  });

  test("keeps the current speed investment when requested", () => {
    const result = recommendDurabilityBuilds({
      current: configuration({ speed: 60 }),
      speedConstraint: { mode: "keep" },
    });

    expect(result.status).toBe("ok");
    for (const candidate of Object.values(result.results)) {
      expect(candidate.values.speed).toBe(60);
      expect(candidate.panel.speed).toBe(203);
    }
  });

  test("returns a structured conflict when even speed 60 cannot meet the target", () => {
    const result = recommendDurabilityBuilds({
      current: configuration(),
      speedConstraint: { mode: "at-least", targetSpeed: 204 },
    });

    expect(result).toMatchObject({
      status: "no-solution",
      candidatesEvaluated: 42,
      results: { physical: null, magical: null, combined: null },
      conflicts: [
        {
          code: "SPEED_TARGET_UNREACHABLE",
          targetSpeed: 204,
          maximumSpeed: 203,
        },
      ],
    });
  });

  test("returns a no-slot conflict when three locked investments exclude required speed", () => {
    const result = recommendDurabilityBuilds({
      current: configuration({
        hp: 60,
        physicalDefense: 60,
        magicalDefense: 60,
      }),
      lockedDimensions: ["hp", "physicalDefense", "magicalDefense"],
      speedConstraint: { mode: "at-least", targetSpeed: 180 },
    });

    expect(result).toMatchObject({
      status: "no-solution",
      results: { physical: null, magical: null, combined: null },
      conflicts: [
        {
          code: "NO_INVESTMENT_SLOT_FOR_SPEED",
          targetSpeed: 180,
          lockedActiveStats: ["hp", "physicalDefense", "magicalDefense"],
        },
      ],
    });
  });

  test("locks invested attacks by default and allows an explicit unlock", () => {
    const current = configuration({ physicalAttack: 60 });
    const locked = recommendDurabilityBuilds({ current });
    const unlocked = recommendDurabilityBuilds({
      current,
      lockedDimensions: [],
    });

    for (const candidate of Object.values(locked.results)) {
      expect(candidate.values.physicalAttack).toBe(60);
      expect(Object.values(candidate.values).filter((value) => value === 60).length)
        .toBeLessThanOrEqual(3);
    }
    expect(unlocked.results.combined.values.physicalAttack).toBe(0);
    expect(current.displayIvs.physicalAttack).toBe(60);
  });

  test("uses display-score ties before change count so rounding does not force a rewrite", () => {
    const current = {
      displayIvs: {
        physicalAttack: 60,
        magicalAttack: 0,
        speed: 0,
        hp: 60,
        physicalDefense: 0,
        magicalDefense: 60,
      },
      natureId: "steady",
      raceStats: {
        physicalAttack: 24,
        magicalAttack: 72,
        speed: 48,
        hp: 88,
        physicalDefense: 56,
        magicalDefense: 59,
      },
    };

    const result = recommendDurabilityBuilds({
      current,
      speedConstraint: { mode: "unlocked" },
    });

    expect(result.results.combined).toMatchObject({
      changedDimensions: [],
      stableKey: "100101",
      durability: { display: { combined: 27116 } },
    });
  });

  test("does not normalize or optimize an invalid historical configuration", () => {
    const current = configuration({ hp: 54 });
    const result = recommendDurabilityBuilds({ current });

    expect(result).toMatchObject({
      status: "invalid-configuration",
      candidatesEvaluated: 0,
      results: { physical: null, magical: null, combined: null },
      conflicts: [
        {
          code: "INVALID_INVESTMENT",
          violations: [
            {
              code: "UNSUPPORTED_INVESTMENT_VALUE",
              stat: "hp",
              value: 54,
            },
          ],
        },
      ],
    });
    expect(current.displayIvs.hp).toBe(54);
  });

  test("returns an invalid-race conflict instead of calculating placeholder stats", () => {
    const result = recommendDurabilityBuilds({
      current: { ...configuration(), raceStats: null },
    });

    expect(result).toMatchObject({
      status: "invalid-configuration",
      candidatesEvaluated: 0,
      results: { physical: null, magical: null, combined: null },
      conflicts: [{ code: "INVALID_RACE_STATS" }],
    });
  });
});
