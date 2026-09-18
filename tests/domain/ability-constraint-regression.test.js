import { describe, expect, test } from "vitest";
import * as analysis from "../../src/features/team-ability/domain/ability-analysis.js";
import { calculateAllPanelStats } from "../../src/domain/stat.js";
import { getNatureMultipliers, NATURES } from "../../src/domain/natures.js";

const current = {
  raceStats: { hp: 100, physicalAttack: 100, physicalDefense: 100, magicalAttack: 100, magicalDefense: 100, speed: 100 },
  natureId: "timid",
  displayIvs: { hp: 60, physicalAttack: 0, physicalDefense: 60, magicalAttack: 0, magicalDefense: 60, speed: 0 },
};
const solve = (speedConstraint, overrides = {}) => analysis.recommendDurabilityBuilds({
  current, compareDefensiveNatures: true, lockedDimensions: [], speedConstraint, ...overrides,
});
const panelFor = (candidate) => calculateAllPanelStats({
  raceStats: current.raceStats, displayIvs: candidate.values, natureMultipliers: getNatureMultipliers(candidate.natureId),
});

describe("final nature and speed constraint regression", () => {
  test("keep never presents a slower defensive-nature build as valid", () => {
    const result = solve({ mode: "keep" });
    expect(result.status).toBe("no-solution");
    expect(Object.values(result.results)).toEqual([null, null, null]);
  });

  test("190 target is checked after nature selection and investment is re-solved", () => {
    const before = JSON.stringify(current);
    const result = solve({ mode: "at-least", targetSpeed: 190 });
    expect(result.status).toBe("ok");
    expect(result.results.combined.natureId).toBe("silent");
    expect(result.results.physical.natureId).toBe("steady");
    expect(result.results.magical.natureId).toBe("vigilant");
    for (const candidate of Object.values(result.results)) {
      expect(candidate.panel).toEqual(panelFor(candidate));
      expect(candidate.panel.speed).toBe(203);
      expect(candidate.values.speed).toBe(60);
      expect(Object.values(candidate.values).filter(Boolean)).toHaveLength(3);
      expect(candidate.speedRedundancy).toBe(13);
    }
    expect(JSON.stringify(current)).toBe(before);
  });

  test("fixed speed investment locks are not bypassed by a nature comparison", () => {
    const result = solve({ mode: "at-least", targetSpeed: 190 }, { lockedDimensions: { speed: 0 } });
    expect(result.status).toBe("no-solution");
    expect(Object.values(result.results)).toEqual([null, null, null]);
  });

  test("selected speed bonus is included in final constraint checks", () => {
    const result = solve({ mode: "at-least", targetSpeed: 190, flatBonus: 25 });
    for (const candidate of Object.values(result.results)) {
      expect(candidate.effectiveSpeed).toBe(candidate.panel.speed + 25);
      expect(candidate.effectiveSpeed).toBeGreaterThanOrEqual(190);
    }
  });

  test("unlocked comparison retains the three existing defensive natures", () => {
    const result = solve({ mode: "unlocked" });
    expect(result.status).toBe("ok");
    expect(result.results.combined.natureId).toBe("silent");
    expect(result.results.physical.natureId).toBe("steady");
    expect(result.results.magical.natureId).toBe("vigilant");
  });

  test.each(NATURES.map(({ id }) => id))("final candidates satisfy keep/target for %s", (natureId) => {
    const input = { ...current, natureId };
    const originalSpeed = calculateAllPanelStats({ raceStats: input.raceStats, displayIvs: input.displayIvs, natureMultipliers: getNatureMultipliers(natureId) }).speed;
    for (const speedConstraint of [{ mode: "keep" }, { mode: "at-least", targetSpeed: 190 }, { mode: "unlocked" }]) {
      const result = solve(speedConstraint, { current: input });
      for (const candidate of Object.values(result.results).filter(Boolean)) {
        expect(candidate.panel).toEqual(panelFor(candidate));
        expect(Object.values(candidate.values).filter(Boolean).length).toBeLessThanOrEqual(3);
        if (speedConstraint.mode === "keep") {
          expect(candidate.values.speed).toBe(input.displayIvs.speed);
          expect(candidate.effectiveSpeed).toBeGreaterThanOrEqual(originalSpeed);
        } else if (speedConstraint.mode === "at-least") {
          expect(candidate.effectiveSpeed).toBeGreaterThanOrEqual(190);
        }
      }
    }
  });

  test("apply guard recomputes actual speed rather than trusting a displayed number", () => {
    const candidate = solve({ mode: "unlocked" }).results.combined;
    const options = { current, candidate: { ...candidate, effectiveSpeed: 9999 }, lockedDimensions: [], speedConstraint: { mode: "at-least", targetSpeed: 190 } };
    expect(analysis.isDurabilityBuildApplicable(options)).toBe(false);
    const valid = solve(options.speedConstraint).results.combined;
    expect(analysis.isDurabilityBuildApplicable({ ...options, candidate: valid })).toBe(true);
    expect(analysis.isDurabilityBuildApplicable({ ...options, candidate: { ...valid, values: { ...valid.values, physicalAttack: 60 } } })).toBe(false);
  });
});
