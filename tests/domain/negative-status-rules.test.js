import { describe, expect, test } from "vitest";
import snapshot from "../../data/snapshots/current.json";
import { getSkillEffectInputs } from "../../src/domain/skill-effects.js";
import { getSkillStatusEffectInputs } from "../../src/domain/skill-status-effects.js";
import {
  NEGATIVE_STATUS_RULE_AUDIT,
  getNegativeStatusInputs,
  resolveNegativeStatusApplications,
  resolveNegativeStatusRepeatNextTurn,
} from "../../src/domain/negative-status-rules.js";

const skill = (name) => snapshot.skills.find((candidate) => candidate.name === name);
const trait = (name) => snapshot.traits.find((candidate) => candidate.name === name);

describe("negative status source rules", () => {
  test("repeat skill identity covers extended slots and does not borrow legacy slot one in single mode", () => {
    const selected = { id: "selected" };
    expect(resolveNegativeStatusRepeatNextTurn({ mode: "four", skillIndex: 6, skill: selected,
      context: { negativeStatusRepeatSkillsBySlot: { 7: "selected" } } })).toBe(true);
    expect(resolveNegativeStatusRepeatNextTurn({ mode: "four", skillIndex: 6, skill: selected,
      context: { negativeStatusRepeatSkillsBySlot: { 7: "different" } }, useCount: 2 })).toBe(false);
    expect(resolveNegativeStatusRepeatNextTurn({ mode: "four", skill: selected,
      context: { negativeStatusRepeatSkillsBySlot: {} }, useCount: 2 })).toBe(false);
    expect(resolveNegativeStatusRepeatNextTurn({ mode: "single", skill: selected, useCount: 2 })).toBe(false);
    expect(resolveNegativeStatusRepeatNextTurn({ mode: "four", skill: selected, useCount: 2 })).toBe(true);
  });

  test.each([
    ["寒潮", "negativeStatusCounterState", true, { freeze: 5 }],
    ["天火", "negativeStatusCounterDefense", true, { burn: 30 }],
    ["毒囊", "negativeStatusCounterState", true, { poison: 6 }],
    ["星火", "previousTurnBothUsedLightSkill", true, { burn: 20 }],
    ["焚烧烙印", "dispelledMarkStacks", 2, { burn: 10 }],
    ["毒雾", "convertedBuffStacks", 2, { poison: 2 }],
    ["炙热波动", "counterTriggered", true, { burn: 8 }],
    ["滚雪球", "counterTriggered", true, { freeze: 4 }],
    ["野火", "applyDefenseReduction", true, { burn: 0 }],
  ])("%s reads saved control ids as well as legacy context", (name, key, value, expected) => {
    const entry = skill(name);
    const control = [...getSkillEffectInputs(entry), ...getSkillStatusEffectInputs(entry),
      ...getNegativeStatusInputs(entry)].find((input) => input.contextKey === key);
    expect(control).toBeDefined();
    for (const context of [{ [control.id]: value }, { [key]: value }]) {
      expect(resolveNegativeStatusApplications({ skill: entry, context }).stacks).toMatchObject(expected);
    }
  });

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

  test.each([
    ["易燃物质", "burn", 2],
    ["连续毒针", "poison", 1],
    ["打喷嚏", "freeze", 1],
  ])("%s applies each-hit stacks from effective hit count, without multiplying traits", (name, status, perHit) => {
    for (const effectiveHitCount of [1, 2, 5]) {
      const application = resolveNegativeStatusApplications({
        effectiveHitCount, skill: skill(name),
        traits: name === "打喷嚏" ? [trait("加个雪球")] : [],
      });
      expect(application.stacks[status]).toBe(effectiveHitCount * perHit + (name === "打喷嚏" ? 2 : 0));
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

  test.each([
    ["电子音乐", { skill: { type: "电" }, context: { weatherThunder: true } }, { skill: { type: "水" }, context: { weatherThunder: true } }],
    ["生物碱", { skill: { type: "草" } }, { skill: { type: "水" } }],
    ["高浓生物碱", { skill: { type: "草" } }, { skill: { type: "水" } }],
    ["灵魂灼伤", { skill: { type: "冰" } }, { skill: { type: "水" } }],
    ["毒腺", { skill: { cost: 1 } }, { skill: { cost: 2 } }],
    ["加个雪球", { skill: { name: "暴风雪" } }, { skill: { name: "测试技能" } }],
    ["贪心算法", { skillIndex: 0 }, { skillIndex: 1 }],
    ["爆裂玉米", { skill: { type: "草" } }, { skill: { type: "水" } }],
    ["溶解扩散", { skill: { type: "水" }, selectedSkills: [{ type: "毒" }] }, { skill: { type: "水" }, selectedSkills: [] }],
    ["溶解腐蚀", { skill: { type: "水" }, selectedSkills: [{ type: "毒" }] }, { skill: { type: "火" }, selectedSkills: [{ type: "毒" }] }],
    ["扩散侵蚀", { skill: { type: "水" }, context: { targetPoisonMarkStacks: 3 } }, { skill: { type: "水" }, context: { targetPoisonMarkStacks: 0 } }],
  ])("%s first-preview eligibility does not bypass its trait condition", (name, matching, missing) => {
    const resolve = (input) => resolveNegativeStatusApplications({
      ...input,
      skill: { name: "测试技能", category: "magical", type: "普通", cost: 3, ...input.skill },
      traits: [trait(name)],
    }).sources.filter((source) => source.kind === "trait");
    expect(resolve(matching)).toEqual([expect.objectContaining({ name })]);
    expect(resolve(missing)).toEqual([]);
  });

  test("虫群未输入奉献次数时不凭空增加中毒", () => {
    expect(resolveNegativeStatusApplications({ skill: skill("虫群") }).stacks.poison).toBe(0);
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
