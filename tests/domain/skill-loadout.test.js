import { describe, expect, test } from "vitest";
import {
  chooseDefaultSkillIds,
  getLegalSkillIds,
  getSkillChoices,
  reconcileSkillLoadout,
} from "../../src/domain/skill-loadout.js";

describe("skill loadouts", () => {
  test("keeps legal entries and replaces illegal entries in stable order", () => {
    expect(
      reconcileSkillLoadout(
        {
          four: [
            "keep-b",
            "old-a",
            { context: { energy: 3 }, hitCount: 2, skillId: "keep-a" },
            null,
          ],
          single: "old-a",
        },
        ["keep-a", "keep-b", "new-c", "new-d"],
      ),
    ).toEqual({
      four: [
        "keep-b",
        "new-c",
        { context: { energy: 3 }, hitCount: 2, skillId: "keep-a" },
        "new-d",
      ],
      single: "keep-b",
    });
  });

  test("leaves empty slots when fewer than four legal skills exist", () => {
    expect(
      reconcileSkillLoadout(
        { four: ["old", null, null, null], single: "old" },
        ["only"],
      ),
    ).toEqual({
      four: ["only", null, null, null],
      single: "only",
    });
  });

  test("reads legal ids in learnset order and chooses damaging defaults first", () => {
    const snapshot = {
      learnsets: [
        {
          skillIds: ["status", "strong", "weak", "defense", "dynamic"],
          spiritId: "spirit-a",
        },
      ],
      skills: [
        {
          basePower: null,
          category: "status",
          id: "status",
          name: "状态",
        },
        {
          basePower: 80,
          category: "physical",
          id: "strong",
          name: "风力冲击",
        },
        {
          basePower: 40,
          category: "magical",
          id: "weak",
          name: "弱攻",
        },
        {
          basePower: null,
          category: "defense",
          id: "defense",
          name: "防御",
        },
        {
          basePower: null,
          category: "magical",
          id: "dynamic",
          name: "动态",
        },
      ],
    };

    expect(getLegalSkillIds(snapshot, "spirit-a")).toEqual([
      "status",
      "strong",
      "weak",
      "defense",
      "dynamic",
    ]);
    expect(chooseDefaultSkillIds(snapshot, "spirit-a")).toEqual([
      "strong",
      "weak",
      "status",
      "defense",
    ]);
  });

  test("deduplicates repeated learnset entries before rendering skill choices", () => {
    const snapshot = {
      learnsets: [
        {
          skillIds: ["skill-a", "skill-a", "skill-b"],
          spiritId: "spirit-a",
        },
      ],
      skills: [
        { id: "skill-a", name: "技能甲" },
        { id: "skill-b", name: "技能乙" },
        { id: "skill-c", name: "技能丙" },
        { id: "skill-c", name: "技能丙" },
      ],
    };

    const first = getSkillChoices(snapshot, "spirit-a");
    expect(first.map((skill) => skill.id)).toEqual([
      "skill-a",
      "skill-b",
      "skill-c",
    ]);
    expect(getSkillChoices(snapshot, "spirit-a")).toBe(first);
  });
});
