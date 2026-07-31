import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
  getInheritedDamageTraits,
  getTraitEffectRule,
  getTraitEffectInputs,
  TRAIT_EFFECT_RULE_NAMES,
} from "../../src/domain/trait-effects.js";

const snapshotPath = join(process.cwd(), "public", "data", "current.json");
const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8"));

describe("trait effect coverage", () => {
  test("keeps a maintained catalog for reviewed recurring trait shapes", () => {
    expect(TRAIT_EFFECT_RULE_NAMES.length).toBeGreaterThanOrEqual(40);
  });

  test("never exposes a zero-value inferred damage control", () => {
    const zeroValueRules = snapshot.traits.flatMap((trait) =>
      ["attacker", "defender"].flatMap((role) => {
        const rule = getTraitEffectRule(trait, role);
        return rule && Number(rule.effect) <= 0
          ? [{ name: trait.name, role }]
          : [];
      }),
    );

    expect(zeroValueRules).toEqual([]);
  });

  test("keeps every current direct-damage control in a reviewed rule", () => {
    const reviewedNames = new Set(TRAIT_EFFECT_RULE_NAMES);
    const legacyEditableNames = new Set(["偏振", "完全偏振", "绝对秩序"]);
    const unreviewed = snapshot.traits
      .filter((trait) =>
        ["attacker", "defender"].some((role) =>
          getTraitEffectRule(trait, role),
        ),
      )
      .filter(
        (trait) =>
          !reviewedNames.has(trait.name) &&
          !legacyEditableNames.has(trait.name),
      )
      .map((trait) => trait.name);

    expect(unreviewed).toEqual([]);
  });

  test.each([
    "刺肤",
    "化茧",
    "耐活王",
    "仁心",
    "坚韧铠甲",
    "换碟",
    "不死鸟",
  ])("%s does not expose a fake direct-damage control", (name) => {
    const trait = snapshot.traits.find((candidate) => candidate.name === name);
    expect(getTraitEffectInputs(trait, "attacker")).toEqual([]);
    expect(getTraitEffectInputs(trait, "defender")).toEqual([]);
  });

  test.each([
    ["猫精灵的礼物", "完整选择次数", "每层物攻"],
    ["蒸汽膨胀", "己方火系技能次数", "每层威力"],
    ["图书守卫者", "入场时魔力为1", "双攻加成"],
    ["破空", "先于敌方攻击", "触发加成"],
    ["贪得无厌", "每5%过量回复", "每层物攻"],
    ["草木苏醒时", "本次攻击前回复能量", "每点双攻"],
    ["合拍", "累计相同项数", "每项物攻"],
    ["和弦共振", "场上印记种类", "每种魔攻"],
  ])("%s exposes its condition and editable effect", (name, condition, effect) => {
    const trait = snapshot.traits.find((candidate) => candidate.name === name);
    const labels = getTraitEffectInputs(trait, "attacker").map(
      (input) => input.label,
    );

    expect(labels).toContain(condition);
    expect(labels).toContain(effect);
  });

  test.each([
    ["偏振", "减伤比例"],
    ["绝对秩序", "减伤比例"],
  ])("%s exposes only its editable reduction value", (name, effect) => {
    const trait = snapshot.traits.find((candidate) => candidate.name === name);
    const inputs = getTraitEffectInputs(trait, "defender");

    expect(inputs.map((input) => input.label)).toEqual([effect]);
    expect(inputs.every((input) => input.type === "number")).toBe(true);
  });

  test("Black Cat Detective exposes Prophet stacks instead of a trigger toggle", () => {
    const trait = snapshot.traits.find((candidate) => candidate.name === "先知");
    const inputs = getTraitEffectInputs(trait, "attacker");

    expect(inputs).toMatchObject([
      {
        defaultValue: 0,
        key: "attackerTraitStacks",
        label: "触发层数",
        type: "number",
      },
      {
        defaultValue: 50,
        key: "attackerTraitEffect",
        label: "每层双攻",
        type: "number",
      },
    ]);
  });

  test.each(["最好的伙伴", "裁决", "滋养", "点燃", "净化"])(
    "%s exposes Dimo-family trigger stacks instead of a trigger toggle",
    (name) => {
      const trait = snapshot.traits.find((candidate) => candidate.name === name);
      const inputs = getTraitEffectInputs(trait, "attacker");

      expect(inputs).toMatchObject([
        {
          defaultValue: 0,
          key: "attackerTraitStacks",
          label: "触发层数",
          type: "number",
        },
        {
          defaultValue: 20,
          key: "attackerTraitEffect",
          label: "每层攻防",
          type: "number",
        },
      ]);
    },
  );

  test("penetration exposes one shared stack model for attack and defense", () => {
    const trait = snapshot.traits.find((candidate) => candidate.name === "渗透");

    expect(getTraitEffectInputs(trait, "attacker")).toMatchObject([
      {
        key: "attackerTraitStacks",
        label: "已使用武/地技能次数",
      },
      {
        defaultValue: 5,
        key: "attackerTraitEffect",
        label: "每层双攻双防",
      },
    ]);
    expect(getTraitEffectInputs(trait, "defender")).toMatchObject([
      {
        key: "defenderTraitStacks",
        label: "已使用武/地技能次数",
      },
      {
        defaultValue: 5,
        key: "defenderTraitEffect",
        label: "每层双攻双防",
      },
    ]);
  });

  test.each([
    "棋契陛下（白棋棋绮后分支）",
    "棋契陛下（黑棋棋绮后分支）",
  ])("%s inherits the penetration stack after evolution", (fullName) => {
    expect(
      getInheritedDamageTraits({ baseName: "棋契陛下", fullName }),
    ).toMatchObject([
      {
        inheritedFrom: "棋绮后",
        name: "渗透",
      },
    ]);
  });

  test.each([
    ["助燃", 20, "火系技能使用次数", "每层双攻"],
    ["爆燃", 30, "火系技能使用次数", "每层双攻"],
    ["鼓气", 20, "能耗3技能使用次数", "每层攻防"],
  ])(
    "%s exposes its repeatable trigger count",
    (name, effect, stackLabel, effectLabel) => {
      const trait = snapshot.traits.find((candidate) => candidate.name === name);
      const inputs = getTraitEffectInputs(trait, "attacker");

      expect(inputs).toMatchObject([
        {
          defaultValue: 0,
          key: "attackerTraitStacks",
          label: stackLabel,
          type: "number",
        },
        {
          defaultValue: effect,
          key: "attackerTraitEffect",
          label: effectLabel,
          type: "number",
        },
      ]);
    },
  );
});
