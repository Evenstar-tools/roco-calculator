import { describe, expect, test } from "vitest";
import {
  analyzeDefensiveTypes,
  analyzeSkillTypeCoverage,
  getTypeMultiplier,
} from "../../src/domain/type-chart.js";

describe("getTypeMultiplier", () => {
  test("caps double weakness at three", () => {
    expect(getTypeMultiplier("草", ["水", "地"])).toBe(3);
  });

  test("keeps double resistance at one quarter", () => {
    expect(getTypeMultiplier("草", ["火", "翼"])).toBe(0.25);
  });

  test("uses a snapshot matrix when one is supplied", () => {
    const snapshotChart = {
      types: ["火", "草", "水"],
      matrix: [
        [1, 2, 0.5],
        [0.5, 1, 2],
        [2, 0.5, 1],
      ],
    };

    expect(getTypeMultiplier("水", ["火"], snapshotChart)).toBe(2);
  });
});

describe("type analysis", () => {
  test("groups dual-type weaknesses and resistances with capped multipliers", () => {
    const analysis = analyzeDefensiveTypes(["水", "地"]);

    expect(analysis.weaknesses).toContainEqual({ type: "草", multiplier: 3 });
    expect(analysis.resistances).toContainEqual({ type: "火", multiplier: 0.25 });
  });

  test("uses the strongest valid attacking skill and ignores status skills", () => {
    const analysis = analyzeSkillTypeCoverage([
      { category: "physical", type: "草" },
      { category: "magical", type: "电" },
      { category: "status", type: "火" },
    ]);

    expect(analysis.coverage).toContainEqual({ type: "水", multiplier: 2 });
    expect(analysis.blindSpots).toContainEqual({ type: "龙", multiplier: 0.5 });
    expect(analysis.coverage).not.toContainEqual({ type: "草", multiplier: 2 });
  });

  test("marks a resisted target as a blind spot when no carried skill can counter it", () => {
    const analysis = analyzeSkillTypeCoverage([
      { category: "physical", type: "普通" },
      { category: "magical", type: "火" },
    ]);

    expect(analysis.blindSpots).toContainEqual({ type: "地", multiplier: 0.5 });
    expect(analysis.coverage).not.toContainEqual({ type: "地", multiplier: 2 });
  });

  test("does not mark a target as a blind spot when any carried skill is neutral", () => {
    const analysis = analyzeSkillTypeCoverage([
      { category: "physical", type: "普通" },
      { category: "magical", type: "光" },
    ]);

    expect(analysis.blindSpots).not.toContainEqual({
      type: "地",
      multiplier: 0.5,
    });
  });

  test("returns no blind spots when no attacking skill is equipped", () => {
    expect(analyzeSkillTypeCoverage([{ category: "status", type: "火" }])).toEqual({
      attackingTypes: [],
      blindSpots: [],
      coverage: [],
    });
  });
});
