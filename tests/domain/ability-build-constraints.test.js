import { describe, expect, test } from "vitest";
import {
  analyzeSpeedBreakpoints,
  recommendDurabilityBuilds,
  isDurabilityBuildApplicable,
} from "../../src/features/team-ability/domain/ability-analysis.js";
import { calculateAllPanelStats } from "../../src/domain/stat.js";
import { getNatureMultipliers } from "../../src/domain/natures.js";

const current = () => ({
  natureId: "timid",
  raceStats: { hp: 100, physicalAttack: 100, magicalAttack: 100, physicalDefense: 100, magicalDefense: 100, speed: 100 },
  displayIvs: { hp: 60, physicalAttack: 0, magicalAttack: 0, physicalDefense: 60, magicalDefense: 60, speed: 0 },
});
const defensive = { combined: "silent", physical: "steady", magical: "vigilant" };
const panelFor = (input, candidate) => calculateAllPanelStats({
  raceStats: input.raceStats,
  displayIvs: candidate.values,
  natureMultipliers: getNatureMultipliers(candidate.natureId),
});

describe("final build constraints", () => {
  test.each([{ mode: "keep" }, { mode: "at-least", targetSpeed: 190 }])(
    "checks the final defensive nature before accepting %j", (speedConstraint) => {
      const input = current();
      const before = structuredClone(input);
      const result = recommendDurabilityBuilds({ current: input, compareDefensiveNatures: true, speedConstraint });
      if (speedConstraint.mode === "keep") {
        expect(result.status).toBe("no-solution");
        expect(Object.values(result.results)).toEqual([null, null, null]);
        expect(input).toEqual(before);
        return;
      }
      expect(result.status).toBe("ok");
      for (const [objective, candidate] of Object.entries(result.results)) {
        expect(candidate.natureId).toBe(defensive[objective]);
        expect(candidate.panel).toEqual(panelFor(input, candidate));
        expect(candidate.effectiveSpeed).toBe(candidate.panel.speed);
        expect(candidate.effectiveSpeed).toBeGreaterThanOrEqual(speedConstraint.mode === "keep" ? 194 : 190);
        expect(candidate.values.speed).toBe(60);
        expect(Object.values(candidate.values).filter(Boolean)).toHaveLength(3);
      }
      expect(input).toEqual(before);
    },
  );

  test("does not invent a valid build when all defensive slots are locked", () => {
    const result = recommendDurabilityBuilds({
      current: current(), compareDefensiveNatures: true, speedConstraint: { mode: "keep" },
      lockedDimensions: ["hp", "physicalDefense", "magicalDefense"],
    });
    expect(result.status).toBe("no-solution");
    expect(Object.values(result.results)).toEqual([null, null, null]);
  });

  test("computes a new percentage bonus for each candidate", () => {
    const input = { ...current(), natureId: "neutral" };
    const speedConstraint = { mode: "at-least", targetSpeed: 240, speedBonusForSpeed: speed => Math.floor(speed * 0.2) };
    const result = recommendDurabilityBuilds({ current: input, speedConstraint });
    expect(result.status).toBe("ok");
    for (const candidate of Object.values(result.results)) {
      expect(candidate.effectiveSpeed).toBe(243);
      expect(candidate.effectiveSpeed).toBe(candidate.panel.speed + Math.floor(candidate.panel.speed * 0.2));
    }
    expect(recommendDurabilityBuilds({ current: input, speedConstraint: { ...speedConstraint, targetSpeed: 250 } }).status).toBe("no-solution");
  });

  test("an unreachable defensive target is not rescued by the old speed nature", () => {
    const result = recommendDurabilityBuilds({
      current: current(), compareDefensiveNatures: true, speedConstraint: { mode: "at-least", targetSpeed: 220 },
    });
    expect(result.status).toBe("no-solution");
    expect(result.conflicts[0]).toMatchObject({ code: "SPEED_TARGET_UNREACHABLE", maximumSpeed: 203 });
  });

  test("apply-time validation recomputes panels and checks locks and legal investment", () => {
    const input = current();
    const options = { current: input, compareDefensiveNatures: true, speedConstraint: { mode: "at-least", targetSpeed: 190 } };
    const candidate = recommendDurabilityBuilds(options).results.physical;
    expect(isDurabilityBuildApplicable({ ...options, candidate })).toBe(true);
    expect(isDurabilityBuildApplicable({
      ...options, candidate: { ...candidate, values: { ...candidate.values, speed: 0 }, panel: { speed: 9999 }, effectiveSpeed: 9999 },
    })).toBe(false);
    expect(isDurabilityBuildApplicable({
      ...options, candidate: { ...candidate, values: { ...candidate.values, physicalAttack: 60 } },
    })).toBe(false);
    expect(isDurabilityBuildApplicable({ ...options, candidate, lockedDimensions: ["speed"] })).toBe(false);
    expect(isDurabilityBuildApplicable({ ...options, candidate: { ...candidate, values: { ...candidate.values, speed: 54 } } })).toBe(false);
    expect(isDurabilityBuildApplicable({ ...options, candidate: null })).toBe(false);
  });

  test("fixed-nature callers retain the existing policy", () => {
    const input = { ...current(), natureId: "neutral" };
    const result = recommendDurabilityBuilds({ current: input, speedConstraint: { mode: "keep" } });
    expect(result.candidatesEvaluated).toBe(42);
    for (const candidate of Object.values(result.results)) expect(candidate.natureId).toBe("neutral");
  });
});

test("speed breakpoint hints recompute percentage bonuses after enabling speed investment", () => {
  const input = {
    ...current(), natureId: "neutral",
    displayIvs: { hp: 60, physicalAttack: 0, magicalAttack: 0, physicalDefense: 0, magicalDefense: 0, speed: 0 },
  };
  const result = analyzeSpeedBreakpoints({
    configuration: input, target: 242, speedBonus: 34,
    speedBonusForSpeed: speed => Math.floor(speed * 0.2),
  });
  expect(result).toMatchObject({ currentSpeed: 204, investedSpeed: 243, status: "REQUIRES_SPEED_INVESTMENT" });
});
