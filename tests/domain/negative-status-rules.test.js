import { describe, expect, test } from "vitest";
import snapshot from "../../data/snapshots/current.json";
import {
  NEGATIVE_STATUS_RULE_AUDIT,
  getNegativeStatusInputs,
  resolveNegativeStatusApplications,
} from "../../src/domain/negative-status-rules.js";

const skill = (name) => snapshot.skills.find((candidate) => candidate.name === name);
const trait = (name) => snapshot.traits.find((candidate) => candidate.name === name);

describe("negative status source rules", () => {
  test.each([
    ["暴风雪", {}, { freeze: 1 }],
    ["易燃物质", {}, { burn: 4 }],
    ["连续毒针", {}, { poison: 2 }],
    ["孢子", {}, { parasitism: 3 }],
    ["炙热波动", { counterTriggered: true }, { burn: 8 }],
    ["滚雪球", { counterTriggered: true }, { freeze: 4 }],
    ["通电", {}, { electrified: 1 }],
  ])("maps %s without fuzzy description matching", (name, context, expected) => {
    expect(resolveNegativeStatusApplications({ context, skill: skill(name) }).stacks)
      .toMatchObject(expected);
  });

  test("does not mistake status readers and energy effects for status sources", () => {
    for (const name of ["冰冻光线", "碎冰冰", "冷凝", "鸩毒"]) {
      expect(resolveNegativeStatusApplications({ skill: skill(name) }).stacks)
        .toEqual({ burn: 0, electrified: 0, freeze: 0, parasitism: 0, poison: 0 });
    }
  });

  test("虫群只按捆缚奉献次数追加每次1层中毒", () => {
    expect(
      resolveNegativeStatusApplications({
        context: { donationPoisonCount: 2 },
        skill: skill("虫群"),
      }),
    ).toMatchObject({
      sources: [
        {
          kind: "skill",
          name: "虫群",
          stacks: { poison: 2 },
        },
      ],
      stacks: { poison: 2 },
    });
  });

  test("毒雾把输入的全部增益层数等量转成中毒", () => {
    expect(
      resolveNegativeStatusApplications({
        context: { convertedBuffStacks: 7 },
        skill: skill("毒雾"),
      }),
    ).toMatchObject({
      sources: [{ kind: "skill", name: "毒雾", stacks: { poison: 7 } }],
      stacks: { poison: 7 },
    });
  });

  test("电子音乐只在雷鸣天气使用电系技能时增加引电", () => {
    expect(resolveNegativeStatusApplications({
      context: { weatherThunder: true },
      skill: skill("通电"),
      traits: [trait("电子音乐")],
    }).stacks).toMatchObject({ electrified: 2 });
    expect(resolveNegativeStatusApplications({
      context: { weatherThunder: false },
      skill: skill("通电"),
      traits: [trait("电子音乐")],
    }).stacks).toMatchObject({ electrified: 1 });
  });

  test("星火按上回合双方是否使用光系技能施加灼烧", () => {
    expect(resolveNegativeStatusApplications({ skill: skill("星火") }).stacks)
      .toMatchObject({ burn: 8 });
    expect(resolveNegativeStatusApplications({
      context: { previousTurnBothUsedLightSkill: true },
      skill: skill("星火"),
    }).stacks).toMatchObject({ burn: 20 });
  });

  test("exposes explicit controls for conditional status branches", () => {
    expect(getNegativeStatusInputs(skill("天火"))).toEqual([
      expect.objectContaining({
        contextKey: "negativeStatusCounterDefense",
        label: "应对防御",
        type: "boolean",
      }),
    ]);
    expect(getNegativeStatusInputs(skill("焚烧烙印"))).toEqual([
      expect.objectContaining({
        contextKey: "dispelledMarkStacks",
        label: "驱散印记层数",
        max: 99,
        type: "number",
      }),
    ]);
    expect(getNegativeStatusInputs(skill("星火"))).toEqual([
      expect.objectContaining({
        contextKey: "previousTurnBothUsedLightSkill",
        label: "上回合双方使用光系技能",
        type: "boolean",
      }),
    ]);
  });

  test.each([
    ["天火", "negativeStatusCounterDefense", { burn: 10 }, { burn: 30 }],
    ["冰点", "negativeStatusCounterDefense", { freeze: 5 }, { freeze: 10 }],
  ])("recomputes %s applications when its counter branch changes", (
    name,
    contextKey,
    normal,
    countered,
  ) => {
    expect(resolveNegativeStatusApplications({
      context: { [contextKey]: false },
      skill: skill(name),
    }).stacks).toMatchObject(normal);
    expect(resolveNegativeStatusApplications({
      context: { [contextKey]: true },
      skill: skill(name),
    }).stacks).toMatchObject(countered);
  });

  test("adds explicit trait applications after the skill source", () => {
    expect(
      resolveNegativeStatusApplications({
        context: {},
        skill: skill("暴风雪"),
        traits: [trait("加个雪球")],
      }).stacks,
    ).toMatchObject({ freeze: 3 });
  });

  test("高浓生物碱只在使用草系技能时追加3层中毒", () => {
    expect(
      resolveNegativeStatusApplications({
        skill: skill("种子弹"),
        traits: [trait("高浓生物碱")],
      }),
    ).toMatchObject({
      sources: [
        {
          kind: "trait",
          name: "高浓生物碱",
          stacks: { poison: 3 },
        },
      ],
      stacks: { poison: 3 },
    });
    expect(
      resolveNegativeStatusApplications({
        skill: skill("毒针"),
        traits: [trait("高浓生物碱")],
      }).stacks,
    ).toMatchObject({ poison: 1 });
  });

  test("uses carried poison skills for dissolution traits", () => {
    expect(
      resolveNegativeStatusApplications({
        skill: skill("水刃"),
        selectedSkills: [skill("毒针"), skill("剧毒"), skill("水刃")],
        traits: [trait("溶解扩散")],
      }).stacks,
    ).toMatchObject({ poison: 2 });
    expect(
      resolveNegativeStatusApplications({
        skill: skill("水刃"),
        selectedSkills: [skill("毒针"), skill("剧毒"), skill("水刃")],
        traits: [trait("溶解腐蚀")],
      }).stacks,
    ).toMatchObject({ poison: 4 });
  });

  test("uses the target poison mark for diffusion erosion", () => {
    expect(
      resolveNegativeStatusApplications({
        context: { targetPoisonMarkStacks: 3 },
        skill: skill("水刃"),
        traits: [trait("扩散侵蚀")],
      }).stacks,
    ).toMatchObject({ poison: 6 });
    expect(
      resolveNegativeStatusApplications({
        context: { targetPoisonMarkStacks: 3 },
        skill: skill("毒针"),
        traits: [trait("扩散侵蚀")],
      }).stacks,
    ).toMatchObject({ poison: 1 });
  });

  test("月相仅保留描述占位，不推断中毒施加层数", () => {
    expect(NEGATIVE_STATUS_RULE_AUDIT.traits.月相).toBe("description-only");
    expect(
      resolveNegativeStatusApplications({
        skill: skill("水刃"),
        traits: [trait("月相")],
      }).stacks,
    ).toEqual({ burn: 0, electrified: 0, freeze: 0, parasitism: 0, poison: 0 });
  });

  test("doubles existing freeze only when extreme cold counters a status move", () => {
    const inputs = getNegativeStatusInputs(skill("极寒领域"));
    expect(inputs).toEqual([
      expect.objectContaining({
        contextKey: "negativeStatusCounterState",
        label: "应对状态",
      }),
    ]);
    expect(
      resolveNegativeStatusApplications({
        baselineStatuses: { freeze: 4 },
        context: { negativeStatusCounterState: true },
        skill: skill("极寒领域"),
      }).stacks,
    ).toMatchObject({ freeze: 4 });
  });

  test("audits every snapshot entry that mentions a supported negative status", () => {
    const keywords = ["寄生", "灼烧", "冻结", "中毒", "引电"];
    const mentionedSkills = snapshot.skills.filter((entry) =>
      entry.calculationStatus !== "pending-skill-data" &&
      keywords.some((keyword) => entry.description?.includes(keyword)),
    );
    const mentionedTraits = snapshot.traits.filter((entry) =>
      keywords.some((keyword) => entry.description?.includes(keyword)),
    );
    expect(mentionedSkills.every((entry) => NEGATIVE_STATUS_RULE_AUDIT.skills[entry.name]))
      .toBe(true);
    expect(mentionedTraits.every((entry) => NEGATIVE_STATUS_RULE_AUDIT.traits[entry.name]))
      .toBe(true);
  });
});
