import { describe, expect, test } from "vitest";
import {
  getSkillChoices,
  getVisibleSkillInputs,
} from "../src/view-models/skills.js";

describe("mini program skill choices", () => {
  const snapshot = {
    skills: [
      { id: "skill-a", name: "技能 A" },
      { id: "skill-b", name: "技能 B" },
      { id: "skill-c", name: "技能 C" },
      { id: "skill-d", name: "技能 D" },
      { id: "skill-illegal", name: "不可学习" },
    ],
    learnsets: [
      {
        spiritId: "spirit-a",
        skillIds: [
          "skill-a",
          "missing-skill",
          "skill-b",
          "skill-c",
          "skill-d",
          "skill-a",
        ],
      },
    ],
  };

  test("returns only existing skills in the spirit learnset", () => {
    expect(
      getSkillChoices(snapshot, "spirit-a").map((skill) => skill.id),
    ).toEqual(["skill-a", "skill-b", "skill-c", "skill-d"]);
  });

  test("returns no global fallback skills when the spirit has no learnset", () => {
    expect(getSkillChoices(snapshot, "spirit-missing")).toEqual([]);
  });
});

describe("dynamic skill inputs", () => {
  const skill = {
    inputs: [
      {
        defaultValue: "power",
        key: "mode",
        label: "选择效果",
        options: [
          { label: "威力", value: "power" },
          { label: "连击", value: "hits" },
        ],
        type: "choice",
      },
      {
        key: "count",
        label: "累计次数",
        type: "number",
        when: { defaultValue: "power", equals: "hits", key: "mode" },
      },
    ],
  };

  test("keeps choice inputs and hides conditional inputs until selected", () => {
    expect(
      getVisibleSkillInputs(skill, {}).map((input) => input.key),
    ).toEqual(["mode"]);
    expect(
      getVisibleSkillInputs(skill, { mode: "hits" }).map(
        (input) => input.key,
      ),
    ).toEqual(["mode", "count"]);
  });
});
