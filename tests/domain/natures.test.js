import { describe, expect, test } from "vitest";
import {
  NATURES,
  getNature,
  getNatureMultipliers,
  getQuickNatureId,
  normalizeNatureId,
  resolveCompactNaturePreset,
} from "../../src/domain/natures.js";

describe("natures", () => {
  test("contains thirty BWIKI primary natures plus neutral", () => {
    expect(NATURES).toHaveLength(31);
    expect(NATURES.filter((nature) => nature.id !== "neutral")).toHaveLength(
      30,
    );
  });

  test("uses the verified stat pairs and multipliers", () => {
    expect(getNature("adamant")).toMatchObject({
      downStat: "magicalAttack",
      name: "固执",
      upStat: "physicalAttack",
    });
    expect(getNatureMultipliers("adamant")).toEqual({
      magicalAttack: 0.9,
      physicalAttack: 1.2,
    });
    expect(getNature("enthusiastic")).toMatchObject({
      downStat: "hp",
      name: "热情",
      upStat: "speed",
    });
  });

  test("migrates legacy labels to canonical ids", () => {
    expect(normalizeNatureId("普通（无修正）")).toBe("neutral");
    expect(normalizeNatureId("neutral")).toBe("neutral");
    expect(normalizeNatureId("固执（+物攻，-魔攻）")).toBe("adamant");
    expect(normalizeNatureId("保守（+魔攻，-物攻）")).toBe("smart");
    expect(normalizeNatureId("淘气（+物防，-魔攻）")).toBe("naive");
    expect(normalizeNatureId("慎重（+魔防，-魔攻）")).toBe("shy");
  });

  test("unknown values degrade to neutral instead of changing stats", () => {
    expect(normalizeNatureId("unknown-nature")).toBe("neutral");
    expect(getNatureMultipliers("unknown-nature")).toEqual({});
  });

  test("maps each quick boost to one deterministic detailed nature", () => {
    expect(getQuickNatureId("physicalAttack")).toBe("adamant");
    expect(getQuickNatureId("magicalAttack")).toBe("smart");
    expect(getQuickNatureId("speed")).toBe("timid");
    expect(getQuickNatureId("physicalDefense")).toBe("naive");
    expect(getQuickNatureId("magicalDefense")).toBe("shy");
    expect(getQuickNatureId("hp")).toBe("grounded");
    expect(getQuickNatureId(null)).toBe("neutral");
  });

  test.each([
    ["hp", 60, 0, "peaceful"],
    ["hp", 0, 60, "silent"],
    ["hp", 60, 60, "grounded"],
    ["physicalAttack", 60, 0, "adamant"],
    ["physicalAttack", 0, 60, "brave"],
    ["physicalAttack", 60, 60, "brave"],
    ["magicalAttack", 60, 0, "calm"],
    ["magicalAttack", 0, 60, "smart"],
    ["magicalAttack", 60, 60, "calm"],
    ["speed", 60, 0, "cheerful"],
    ["speed", 0, 60, "timid"],
    ["speed", 60, 60, "rash"],
    ["physicalDefense", 60, 0, "naive"],
    ["physicalDefense", 0, 60, "steady"],
    ["physicalDefense", 60, 60, "relaxed"],
    ["magicalDefense", 60, 0, "shy"],
    ["magicalDefense", 0, 60, "vigilant"],
    ["magicalDefense", 60, 60, "cautious"],
  ])(
    "resolves %s with physical attack IV %i and magical attack IV %i to %s",
    (upStat, physicalAttack, magicalAttack, expected) => {
      expect(
        resolveCompactNaturePreset(upStat, {
          magicalAttack,
          physicalAttack,
        }),
      ).toBe(expected);
    },
  );

  test("only treats an attack IV of exactly sixty as selected", () => {
    expect(
      resolveCompactNaturePreset("hp", {
        magicalAttack: 60,
        physicalAttack: 59,
      }),
    ).toBe("silent");
    expect(
      resolveCompactNaturePreset("hp", {
        magicalAttack: 61,
        physicalAttack: 60,
      }),
    ).toBe("peaceful");
    expect(resolveCompactNaturePreset(null, {})).toBe("neutral");
  });
});
