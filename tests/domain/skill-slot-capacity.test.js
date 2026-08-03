import { describe, expect, test } from "vitest";
import {
  getSpiritSkillSlotCapacity,
  normalizeSkillSlots,
} from "../../src/domain/skill-slot-capacity.js";

const snapshot = {
  spirits: [
    { id: "rainbow-unicorn", traitIds: ["dazzling"] },
    { id: "platinum-unicorn", traitIds: ["empty-sky"] },
  ],
  traits: [
    {
      id: "dazzling",
      name: "夺目",
      description: "额外获得三个未携带的随机技能，且非光系技能威力+25%。",
    },
    { id: "empty-sky", name: "目空", description: "测试特性" },
  ],
};

describe("skill slot capacity", () => {
  test("gives only the dazzling spirit seven carried-skill slots", () => {
    expect(getSpiritSkillSlotCapacity(snapshot, "rainbow-unicorn")).toBe(7);
    expect(getSpiritSkillSlotCapacity(snapshot, "platinum-unicorn")).toBe(4);
    expect(getSpiritSkillSlotCapacity(snapshot, "missing")).toBe(4);
  });

  test("pads or trims skill entries to the requested capacity", () => {
    expect(normalizeSkillSlots(["a", "b"], 4)).toEqual([
      "a", "b", null, null,
    ]);
    expect(normalizeSkillSlots(["a", "b", "c", "d", "e", "f", "g", "h"], 7))
      .toEqual(["a", "b", "c", "d", "e", "f", "g"]);
  });
});
