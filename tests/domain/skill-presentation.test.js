import { describe, expect, test } from "vitest";
import { describeSkillResolution } from "../../src/domain/skill-presentation.js";

describe("skill presentation", () => {
  test("describes reviewed speed-difference power", () => {
    expect(describeSkillResolution({
      formulaSteps: [{
        after: 90,
        before: 30,
        input: { attacker: 140, defender: 110 },
        label: "\u901f\u5ea6\u5dee",
        source: "reviewed-rule:speed-defense-difference",
      }],
    })).toBe("\u901f\u5ea6 140 \u2212 110 = 30 \u2192 \u5a01\u529b 90");
  });

  test("describes adjacent displayed power", () => {
    expect(describeSkillResolution({
      formulaSteps: [{
        after: 80,
        before: 30,
        input: {
          left: { name: "A", power: 60 },
          right: { name: "B", power: 100 },
        },
        label: "\u76f8\u90bb\u5a01\u529b",
        source: "reviewed-rule:adjacent-displayed-power",
      }],
    })).toBe("\u5de6 A 60\uff5c\u53f3 B 100 \u2192 \u5a01\u529b 80");
  });
});
