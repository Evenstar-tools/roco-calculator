import { describe, expect, test } from "vitest";
import { withCalculatorExtras } from "../../src/data/snapshot-extras.js";

describe("withCalculatorExtras", () => {
  test("adds all 18 typed Wish Power variants without mutating the snapshot count", () => {
    const snapshot = {
      meta: { counts: { skills: 553 } },
      skills: [{ id: "fixture", name: "测试技能" }],
    };
    const enriched = withCalculatorExtras(snapshot);
    const wishPower = enriched.skills.filter(
      (skill) => skill.name === "愿力冲击",
    );

    expect(wishPower).toHaveLength(18);
    expect(new Set(wishPower.map((skill) => skill.id))).toHaveProperty(
      "size",
      18,
    );
    expect(new Set(wishPower.map((skill) => skill.type))).toHaveProperty(
      "size",
      18,
    );
    expect(enriched.meta.counts.skills).toBe(553);
    expect(snapshot.skills).toHaveLength(1);
  });

  test("does not duplicate variants already present in a later snapshot", () => {
    const snapshot = withCalculatorExtras({ meta: {}, skills: [] });

    expect(withCalculatorExtras(snapshot).skills).toHaveLength(
      snapshot.skills.length,
    );
  });
});
