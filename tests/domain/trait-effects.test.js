import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
  getInheritedDamageTraits,
  getTraitEffectRule,
  getTraitEffectInputs,
  resolveBeastFlowerBloodlineTrait,
  resolveTraitEffectRule,
  TRAIT_EFFECT_RULE_NAMES,
} from "../../src/domain/trait-effects.js";

const snapshotPath = join(process.cwd(), "public", "data", "current.json");
const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8"));

describe("trait effect coverage", () => {
  test("稀兽花宝为攻防双方提供互斥血脉与临时触发控件", () => {
    const trait = snapshot.traits.find((candidate) => candidate.name === "稀兽花宝");

    for (const role of ["attacker", "defender"]) {
      const inputs = getTraitEffectInputs(trait, role);
      expect(inputs).toEqual(expect.arrayContaining([
        expect.objectContaining({
          contextKey: "bloodlineType",
          options: expect.arrayContaining([
            expect.objectContaining({ value: "normal", label: "普通｜技能威力 +40" }),
            expect.objectContaining({ value: "illusion", label: "幻｜对方星陨 ×2" }),
          ]),
          scope: "direction",
          type: "choice",
        }),
        expect.objectContaining({
          contextKey: "bloodlineActivated",
          scope: "battle",
          type: "boolean",
        }),
      ]));
      expect(inputs[0].options.filter(({ value }) => value !== "")).toHaveLength(18);
    }
  });

  test("稀兽花宝不进入既有特性倍率计算", () => {
    const trait = snapshot.traits.find((candidate) => candidate.name === "稀兽花宝");
    expect(resolveTraitEffectRule(trait, "attacker", {
      attacker: {},
      context: {},
      defender: {},
      skill: { category: "physical", type: "普通" },
    })).toMatchObject({
      attackLevelBonus: 0,
      attackMultiplier: 1,
      fixedPowerAdd: 0,
      powerMultiplier: 1,
    });
  });

  test("按角色语义键解析稀兽花宝血脉", () => {
    const trait = snapshot.traits.find((candidate) => candidate.name === "稀兽花宝");
    const inputs = getTraitEffectInputs(trait, "defender");
    const bloodlineType = inputs.find((input) => input.contextKey === "bloodlineType");
    const activated = inputs.find((input) => input.contextKey === "bloodlineActivated");

    expect(resolveBeastFlowerBloodlineTrait({
      traits: [trait],
      role: "defender",
      context: {
        [bloodlineType.id]: "machine",
        [activated.id]: true,
      },
      skill: { category: "physical", type: "普通" },
    })).toMatchObject({
      active: true,
      bloodlineType: "machine",
      defenseLevelBonusByCategory: { physical: 6, magical: 6 },
    });
  });

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

  test("namespaces attacker and defender controls while preserving their legacy context keys", () => {
    const trait = snapshot.traits.find((candidate) => candidate.name === "渗透");

    const attackerInputs = getTraitEffectInputs(trait, "attacker");
    const defenderInputs = getTraitEffectInputs(trait, "defender");
    expect(attackerInputs).toMatchObject([
      {
        contextKey: "attackerTraitStacks",
        id: expect.stringMatching(
          /^attackerTrait\.attackerTraitStacks\.[a-f0-9]{8}$/,
        ),
        scope: "direction",
        source: "attackerTrait",
      },
      {
        contextKey: "attackerTraitEffect",
        id: expect.stringMatching(
          /^attackerTrait\.attackerTraitEffect\.[a-f0-9]{8}$/,
        ),
      },
    ]);
    expect(defenderInputs).toMatchObject([
      {
        contextKey: "defenderTraitStacks",
        id: expect.stringMatching(
          /^defenderTrait\.defenderTraitStacks\.[a-f0-9]{8}$/,
        ),
        scope: "direction",
        source: "defenderTrait",
      },
      {
        contextKey: "defenderTraitEffect",
        id: expect.stringMatching(
          /^defenderTrait\.defenderTraitEffect\.[a-f0-9]{8}$/,
        ),
      },
    ]);
    expect(attackerInputs[0].id.split(".").at(-1)).toBe(
      defenderInputs[0].id.split(".").at(-1),
    );
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

  test("保守派只显示固定双防加成的触发勾选", () => {
    const trait = snapshot.traits.find((candidate) => candidate.name === "保守派");

    for (const role of ["attacker", "defender"]) {
      expect(getTraitEffectInputs(trait, role)).toMatchObject([
        {
          defaultValue: false,
          key: "traitActivated",
          label: "总技能能耗小于4",
          type: "boolean",
        },
      ]);
      expect(getTraitEffectInputs(trait, role)).toHaveLength(1);
    }
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
