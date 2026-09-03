import { describe, expect, test } from "vitest";
import { createSkillPresentation } from "../src/view-models/skill-presentation.js";
import { buildResultFormulaAudit } from "../src/view-models/formula-audit.js";

const refraction = {
  basePower: 50,
  category: "magical",
  description: "\u6839\u636e\u643a\u5e26\u6280\u80fd\u7cfb\u522b\u83b7\u5f97\u6548\u679c\u3002",
  id: "refraction",
  name: "\u6298\u5c04",
  type: "\u5149",
};

describe("miniapp skill presentation", () => {
  test("combines source description and refraction effects", () => {
    const presentation = createSkillPresentation({
      carriedSkills: [
        refraction,
        { id: "fire", name: "\u706b\u6280", type: "\u706b" },
        { id: "water", name: "\u6c34\u6280", type: "\u6c34" },
      ],
      currentIndex: 0,
      skill: refraction,
      sproutStacks: 1,
    });

    expect(presentation.description).toBe(refraction.description);
    expect(presentation.effectHint).toContain("\u706b\u00b7\u654c\u707c\u70e7+4");
    expect(presentation.effectHint).toContain("\u6c34\u00b7\u80fd\u8017-2");
  });

  test("merges result, choice-trait, and gale-turbine inputs", () => {
    const skill = {
      category: "magical",
      description: "\u9009\u62e9\uff1a\u660e\u6216\u6697\u3002",
      id: "gale",
      name: "\u75be\u98ce\u6da1\u8f6e",
      type: "\u666e\u901a",
    };
    const presentation = createSkillPresentation({
      carriedSkills: [
        skill,
        { category: "physical", id: "wing", name: "\u7ffc\u6280", type: "\u7ffc" },
      ],
      context: {},
      currentIndex: 0,
      result: {
        inputs: [{ defaultValue: 0, id: "runtimeInput", label: "Runtime", type: "number" }],
      },
      skill,
      traitName: "\u6709\u6c42\u5fc5\u5e94",
    });

    expect(presentation.inputs.map((input) => input.id)).toEqual(
      expect.arrayContaining([
        "runtimeInput",
        "choiceTraitTriggered",
        "galeTurbineCompanionSlot",
      ]),
    );
  });

  test("uses the synchronized display-power term for reflected skills", () => {
    const presentation = createSkillPresentation({
      result: {
        reflectedPower: 245,
        reflectedSourceSkillName: "虫群",
      },
      skill: { ...refraction, name: "听桥" },
    });

    expect(presentation.effectHint).toContain("反弹「虫群」·显示威力 245");
  });

  test("accepts the latest manual display-power formula step", () => {
    const audit = buildResultFormulaAudit({
      formulaSteps: [
        {
          after: 80,
          before: 20,
          input: 80,
          label: "手动显示威力",
          source: "manual",
        },
      ],
      skillName: "测试技能",
    });

    expect(audit.power).toMatchObject({ base: 20, conditional: 80 });
  });

  test("builds a dedicated photosynthetic-healing audit", () => {
    const audit = buildResultFormulaAudit({
      formulaSteps: [
        { after: 75, before: 75, label: "血脉魔法回复" },
        {
          after: 225,
          before: 75,
          input: { ticks: 3 },
          label: "血脉魔法后续回复",
        },
        {
          after: 60,
          input: { actualHealing: 60, requestedHealing: 75 },
          label: "戏耍特性伤害",
        },
      ],
      skillName: "戏耍·光合治愈",
      sourceKind: "bloodline",
      totalDamage: 60,
    });

    expect(audit).toEqual({
      bloodline: {
        actualHealing: 60,
        damage: 60,
        endTurnTicks: 3,
        immediateHealing: 75,
        nominalEndTurnTotal: 225,
        perTurnHealing: 75,
      },
      kind: "bloodline",
      skillName: "戏耍·光合治愈",
    });
  });
});
