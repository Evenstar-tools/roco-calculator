import { describe, expect, test } from "vitest";
import { getTypeMultiplier } from "../../src/domain/type-chart.js";

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
