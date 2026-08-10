import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
  getInheritedDamageTraits,
  getTraitAutomaticStack,
  getTraitEffectRule,
  getTraitEffectInputs,
  resolveBeastFlowerBloodlineTrait,
  resolveContractShapeTrait,
  resolveTraitEffectRule,
  TRAIT_EFFECT_RULE_NAMES,
} from "../../src/domain/trait-effects.js";

const snapshotPath = join(process.cwd(), "public", "data", "current.json");
const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8"));

describe("trait effect coverage", () => {
  function contextFor(trait, role, values) {
    return Object.fromEntries(
      getTraitEffectInputs(trait, role).map((control) => [
        control.id,
        values[control.contextKey] ?? control.defaultValue,
      ]),
    );
  }

  test("守护之心按双方场上不同增益种类输入物防加成", () => {
    const trait = snapshot.traits.find(
      (candidate) => candidate.name === "守护之心",
    );

    expect(getTraitEffectInputs(trait, "attacker")).toMatchObject([
      {
        defaultValue: 0,
        key: "attackerTraitStacks",
        label: "不同增益种类",
        type: "number",
      },
      {
        defaultValue: 20,
        key: "attackerTraitEffect",
        label: "每种物防",
        type: "number",
      },
    ]);
    expect(getTraitEffectInputs(trait, "defender")).toMatchObject([
      {
        key: "defenderTraitStacks",
        label: "不同增益种类",
      },
      {
        key: "defenderTraitEffect",
        label: "每种物防",
      },
    ]);
  });

  test("冻土自动读取携带的冰系技能，不再要求手填层数", () => {
    const trait = snapshot.traits.find((candidate) => candidate.name === "冻土");

    expect(getTraitEffectInputs(trait, "attacker").map(({ label }) => label))
      .toEqual(["每层威力"]);
    expect(
      getTraitAutomaticStack(trait, "attacker", [
        { type: "冰" },
        { type: "地" },
        { type: "冰" },
      ]),
    ).toMatchObject({ label: "携带冰系技能数", value: 2 });
  });

  test("圣火骑士只显示应对勾选，不开放固定倍率编辑", () => {
    const trait = snapshot.traits.find(
      (candidate) => candidate.name === "圣火骑士",
    );

    expect(getTraitEffectInputs(trait, "attacker")).toMatchObject([
      {
        label: "应对成功",
        scope: "slot",
        type: "boolean",
      },
    ]);
    expect(getTraitEffectInputs(trait, "attacker")).toHaveLength(1);
  });

  test("衡量为攻防双方提供当前战斗触发勾选", () => {
    const trait = snapshot.traits.find((candidate) => candidate.name === "衡量");

    for (const role of ["attacker", "defender"]) {
      expect(getTraitEffectInputs(trait, role)).toMatchObject([
        {
          contextKey: "balanceTriggered",
          label: "触发衡量",
          scope: "battle",
          type: "boolean",
        },
      ]);
    }
  });

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

  test("契约的形状为攻防双方提供咕噜球与条件棱镜选项", () => {
    const trait = snapshot.traits.find((candidate) => candidate.name === "契约的形状");

    for (const role of ["attacker", "defender"]) {
      const inputs = getTraitEffectInputs(trait, role);
      expect(inputs).toEqual(expect.arrayContaining([
        expect.objectContaining({
          contextKey: "contractBallType",
          options: expect.arrayContaining([
            expect.objectContaining({ value: "normal", label: "普通球｜攻防速 +10%" }),
            expect.objectContaining({ value: "prism", label: "棱镜球｜指定随机球效果 · 数值减半" }),
          ]),
          scope: "direction",
          type: "choice",
        }),
        expect.objectContaining({
          contextKey: "contractPrismEffect",
          scope: "direction",
          type: "choice",
          visibleWhen: expect.objectContaining({
            contextKey: "contractBallType",
            equals: "prism",
          }),
        }),
      ]));
      expect(inputs[0].options.filter(({ value }) => value !== "")).toHaveLength(13);
    }
  });

  test("星尘虫、落星虫与陨星虫共用契约的形状", () => {
    expect(snapshot.spirits
      .filter((spirit) => ["星尘虫", "落星虫", "陨星虫"].includes(spirit.fullName))
      .map((spirit) => [spirit.fullName, spirit.traitName]))
      .toEqual([
        ["星尘虫", "契约的形状"],
        ["落星虫", "契约的形状"],
        ["陨星虫", "契约的形状"],
      ]);
  });

  test("按角色语义键解析契约的形状", () => {
    const trait = snapshot.traits.find((candidate) => candidate.name === "契约的形状");
    const inputs = getTraitEffectInputs(trait, "defender");
    const ball = inputs.find((input) => input.contextKey === "contractBallType");
    const prism = inputs.find((input) => input.contextKey === "contractPrismEffect");

    expect(resolveContractShapeTrait({
      traits: [trait],
      role: "defender",
      context: {
        [ball.id]: "prism",
        [prism.id]: "darkstar",
      },
      skill: { category: "magical", type: "普通" },
    })).toMatchObject({
      active: true,
      ballType: "prism",
      effectiveBallType: "darkstar",
      attackLevelBonusByCategory: { physical: 2, magical: 0 },
      targetDefenseLevelBonusByCategory: { physical: 0, magical: -2 },
    });
  });

  test("契约的形状不进入既有特性倍率计算", () => {
    const trait = snapshot.traits.find((candidate) => candidate.name === "契约的形状");
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

  test("换碟按技能名称增加固定基础威力，不影响其他技能", () => {
    const trait = snapshot.traits.find((candidate) => candidate.name === "换碟");
    const cases = [
      ["音波弹", 15],
      ["音爆", 20],
      ["金属噪音", 20],
      ["午夜噪音", 5],
      ["闪光", 0],
    ];

    for (const [name, expected] of cases) {
      expect(
        resolveTraitEffectRule(trait, "attacker", {
          attacker: {},
          context: {},
          defender: {},
          skill: { category: "magical", name, type: "普通" },
        })?.fixedPowerAdd,
      ).toBe(expected);
    }
  });

  test.each([
    ["猫精灵的礼物", "完整选择次数", "每层物攻"],
    ["蒸汽膨胀", "己方火系技能次数", "每层威力"],
    ["图书守卫者", "入场时魔力为1", "双攻加成"],
    ["顺风", "先于敌方攻击", "触发加成"],
    ["破空", "先于敌方攻击", "触发加成"],
    ["贪得无厌", "每5%过量回复", "每层物攻"],
    ["草木苏醒时", "本次攻击前回复能量", "每点双攻"],
    ["合拍", "累计相同项数", "每项物攻物防"],
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
      {
        defaultValue: 50,
        key: "attackerTraitSpeedEffect",
        label: "每层速度",
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
        {
          defaultValue: 20,
          key: "attackerTraitSpeedEffect",
          label: "每层速度",
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

  test("构装契约者为攻防双方显示敌方魔力为1的固定双防触发勾选", () => {
    const trait = snapshot.traits.find(
      (candidate) => candidate.name === "构装契约者",
    );

    for (const role of ["attacker", "defender"]) {
      expect(getTraitEffectInputs(trait, role)).toMatchObject([
        {
          defaultValue: false,
          key: "traitActivated",
          label: "敌方魔力为1",
          type: "boolean",
        },
      ]);
      expect(getTraitEffectInputs(trait, role)).toHaveLength(1);
    }

    expect(resolveTraitEffectRule(trait, "defender", {
      attacker: {},
      context: { traitActivated: true },
      defender: {},
      skill: { category: "physical", type: "普通" },
    })).toMatchObject({
      defenseLevelBonus: 10,
      defenderDefenseLevelBonus: 10,
    });
  });

  test("囤积按当前能量为攻防双方增加双防", () => {
    const trait = snapshot.traits.find((candidate) => candidate.name === "囤积");
    for (const role of ["attacker", "defender"]) {
      const context = contextFor(trait, role, {
        [`${role}TraitStacks`]: 3,
      });
      expect(getTraitEffectInputs(trait, role).map(({ label }) => label)).toEqual([
        "当前能量",
        "每点双防",
      ]);
      expect(resolveTraitEffectRule(trait, role, {
        attacker: {},
        context,
        defender: {},
        skill: { category: "physical", type: "普通" },
      })).toMatchObject(
        role === "attacker"
          ? { attackerDefenseLevelBonus: 3 }
          : { defenseLevelBonus: 3, defenderDefenseLevelBonus: 3 },
      );
    }
  });

  test("游弋仅在勾选蓄力状态后为攻防双方增加100%双防", () => {
    const trait = snapshot.traits.find((candidate) => candidate.name === "游弋");
    for (const role of ["attacker", "defender"]) {
      const controls = getTraitEffectInputs(trait, role);
      expect(controls).toMatchObject([
        { label: "正在蓄力", type: "boolean" },
      ]);
      expect(controls).toHaveLength(1);
      const context = contextFor(trait, role, { traitActivated: true });
      expect(resolveTraitEffectRule(trait, role, {
        attacker: {},
        context,
        defender: {},
        skill: { category: "magical", type: "水" },
      })).toMatchObject(
        role === "attacker"
          ? { attackerDefenseLevelBonus: 10 }
          : { defenseLevelBonus: 10, defenderDefenseLevelBonus: 10 },
      );
    }
  });

  test("合拍同时结算物攻和物防，且不误加到魔法伤害", () => {
    const trait = snapshot.traits.find((candidate) => candidate.name === "合拍");
    const context = contextFor(trait, "attacker", { attackerTraitStacks: 2 });
    expect(resolveTraitEffectRule(trait, "attacker", {
      attacker: {},
      context,
      defender: {},
      skill: { category: "physical", type: "普通" },
    })).toMatchObject({ attackLevelBonus: 2, attackerDefenseLevelBonus: 2 });
    expect(resolveTraitEffectRule(trait, "attacker", {
      attacker: {},
      context,
      defender: {},
      skill: { category: "magical", type: "普通" },
    })).toMatchObject({ attackLevelBonus: 0, attackerDefenseLevelBonus: 0 });
    const defenderContext = contextFor(trait, "defender", {
      defenderTraitStacks: 2,
    });
    expect(resolveTraitEffectRule(trait, "defender", {
      attacker: {},
      context: defenderContext,
      defender: {},
      skill: { category: "physical", type: "普通" },
    })).toMatchObject({ defenseLevelBonus: 2, defenderDefenseLevelBonus: 2 });
  });

  test("扫荡同时结算魔攻和魔防，且不误加到物理伤害", () => {
    const trait = snapshot.traits.find((candidate) => candidate.name === "扫荡");
    const context = contextFor(trait, "attacker", { attackerTraitStacks: 2 });
    expect(resolveTraitEffectRule(trait, "attacker", {
      attacker: {},
      context,
      defender: {},
      skill: { category: "magical", type: "普通" },
    })).toMatchObject({ attackLevelBonus: 4, attackerDefenseLevelBonus: 2 });
    expect(resolveTraitEffectRule(trait, "attacker", {
      attacker: {},
      context,
      defender: {},
      skill: { category: "physical", type: "普通" },
    })).toMatchObject({ attackLevelBonus: 0, attackerDefenseLevelBonus: 0 });
    const defenderContext = contextFor(trait, "defender", {
      defenderTraitStacks: 2,
    });
    expect(resolveTraitEffectRule(trait, "defender", {
      attacker: {},
      context: defenderContext,
      defender: {},
      skill: { category: "magical", type: "普通" },
    })).toMatchObject({ defenseLevelBonus: 2, defenderDefenseLevelBonus: 2 });
  });

  test("冰雪魂魄必须勾选暴风雪天气才按冻结层数增加冰系威力", () => {
    const trait = snapshot.traits.find((candidate) => candidate.name === "冰雪魂魄");
    expect(getTraitEffectInputs(trait, "attacker").map(({ label }) => label)).toEqual([
      "暴风雪天气",
      "敌方冻结总层数",
      "每层威力",
    ]);
    const inactive = contextFor(trait, "attacker", {
      blizzardWeather: false,
      attackerTraitStacks: 3,
    });
    const active = contextFor(trait, "attacker", {
      blizzardWeather: true,
      attackerTraitStacks: 3,
    });
    const input = {
      attacker: {},
      defender: {},
      skill: { category: "magical", type: "冰" },
    };
    expect(resolveTraitEffectRule(trait, "attacker", {
      ...input,
      context: inactive,
    })).toMatchObject({ powerPercentAdd: 0 });
    expect(resolveTraitEffectRule(trait, "attacker", {
      ...input,
      context: active,
    })).toMatchObject({ powerPercentAdd: 0.3 });
  });

  test("攻防速类特性把速度加成带入双方的即时计算", () => {
    for (const name of [
      "最好的伙伴",
      "裁决",
      "滋养",
      "点燃",
      "净化",
      "虫群鼓舞",
      "虫群突袭",
    ]) {
      const trait = snapshot.traits.find((candidate) => candidate.name === name);
      const attackerContext = contextFor(trait, "attacker", {
        attackerTraitStacks: 2,
      });
      const attackerResult = resolveTraitEffectRule(trait, "attacker", {
        attacker: {},
        context: attackerContext,
        defender: {},
        skill: { category: "physical", type: "普通" },
      });
      expect(attackerResult.attackerSpeedLevelBonus).toBeGreaterThan(0);

      const defenderContext = contextFor(trait, "defender", {
        defenderTraitStacks: 2,
      });
      const defenderResult = resolveTraitEffectRule(trait, "defender", {
        attacker: {},
        context: defenderContext,
        defender: {},
        skill: { category: "physical", type: "普通" },
      });
      expect(defenderResult.defenderSpeedLevelBonus).toBeGreaterThan(0);
    }
  });

  test("先知、变形活画和淬炼火按层数提供描述中的固定速度", () => {
    for (const [name, expectedSpeed] of [
      ["先知", 100],
      ["变形活画", 10],
      ["淬炼火", 20],
    ]) {
      const trait = snapshot.traits.find((candidate) => candidate.name === name);
      const context = contextFor(trait, "attacker", {
        attackerTraitStacks: 2,
        enemyBuffStacks: 2,
      });
      expect(resolveTraitEffectRule(trait, "attacker", {
        attacker: {},
        context,
        defender: {},
        skill: { category: "physical", type: "普通" },
      })).toMatchObject({ attackerSpeedFlatBonus: expectedSpeed });
    }
  });

  test("惊吓仅在确认攻击方零能量时免疫本次伤害", () => {
    const trait = snapshot.traits.find((candidate) => candidate.name === "惊吓");
    expect(getTraitEffectInputs(trait, "attacker")).toEqual([]);
    expect(getTraitEffectInputs(trait, "defender").map(({ label }) => label)).toEqual([
      "攻击方能量为0",
    ]);
    const baseInput = {
      attacker: {},
      defender: {},
      skill: { category: "physical", cost: 3, type: "普通" },
    };
    expect(resolveTraitEffectRule(trait, "defender", {
      ...baseInput,
      context: contextFor(trait, "defender", { attackerEnergyZero: false }),
    })).toMatchObject({ damageReductionMultiplier: 1 });
    expect(resolveTraitEffectRule(trait, "defender", {
      ...baseInput,
      context: contextFor(trait, "defender", { attackerEnergyZero: true }),
    })).toMatchObject({ damageReductionMultiplier: 0 });
  });

  test("逐魂鸟自动免疫能耗不高于1的攻击技能", () => {
    const trait = snapshot.traits.find((candidate) => candidate.name === "逐魂鸟");
    expect(getTraitEffectInputs(trait, "attacker")).toEqual([]);
    expect(getTraitEffectInputs(trait, "defender")).toEqual([]);
    const resolve = (cost) => resolveTraitEffectRule(trait, "defender", {
      attacker: {},
      context: contextFor(trait, "defender"),
      defender: {},
      skill: { category: "physical", cost, type: "普通" },
    });
    expect(resolve(1)).toMatchObject({ damageReductionMultiplier: 0 });
    expect(resolve(2)).toMatchObject({ damageReductionMultiplier: 1 });
  });

  test.each([
    ["预警", "敌方技能足以击败自己"],
    ["哨兵", "敌方技能足以击败自己"],
    ["流沙统治者", "沙暴天气"],
  ])("%s在条件确认后为特性持有方增加50速度", (name, conditionLabel) => {
    const trait = snapshot.traits.find((candidate) => candidate.name === name);
    for (const role of ["attacker", "defender"]) {
      expect(getTraitEffectInputs(trait, role).map(({ label }) => label)).toEqual([
        conditionLabel,
        "速度加成",
      ]);
      const inactive = resolveTraitEffectRule(trait, role, {
        attacker: {},
        context: contextFor(trait, role, { traitActivated: false }),
        defender: {},
        skill: { category: "physical", cost: 2, type: "普通" },
      });
      const active = resolveTraitEffectRule(trait, role, {
        attacker: {},
        context: contextFor(trait, role, { traitActivated: true }),
        defender: {},
        skill: { category: "physical", cost: 2, type: "普通" },
      });
      expect(inactive).toMatchObject({
        attackerSpeedFlatBonus: 0,
        defenderSpeedFlatBonus: 0,
      });
      expect(active).toMatchObject(
        role === "attacker"
          ? { attackerSpeedFlatBonus: 50 }
          : { defenderSpeedFlatBonus: 50 },
      );
    }
  });

  test("张弛有度只显示周末勾选并同时支持攻防双方", () => {
    const trait = snapshot.traits.find((candidate) => candidate.name === "张弛有度");

    for (const role of ["attacker", "defender"]) {
      expect(getTraitEffectInputs(trait, role)).toMatchObject([
        {
          defaultValue: false,
          key: "traitActivated",
          label: "周末",
          type: "boolean",
        },
      ]);
      expect(getTraitEffectInputs(trait, role)).toHaveLength(1);
    }
  });

  test("侵蚀显示中毒层数和战斗触发勾选", () => {
    const trait = snapshot.traits.find((candidate) => candidate.name === "侵蚀");
    expect(getTraitEffectInputs(trait, "attacker")).toMatchObject([
      {
        contextKey: "enemyPoisonStacks",
        defaultValue: 0,
        label: "敌方中毒层数",
        max: 99,
        min: 0,
        scope: "battle",
        type: "number",
      },
      {
        contextKey: "traitHitCountActivated",
        defaultValue: false,
        label: "触发侵蚀",
        scope: "battle",
        type: "boolean",
      },
    ]);
    expect(getTraitEffectInputs(trait, "defender")).toEqual([]);
  });

  test.each([
    ["乘风连击", "windSkillUseCount", "翼系技能使用次数", "触发乘风连击"],
    ["咔咔冲刺", "actedFirstCount", "此前先手次数", "触发咔咔冲刺"],
  ])("%s 显示次数和战斗触发勾选", (name, contextKey, label, triggerLabel) => {
    const trait = snapshot.traits.find((candidate) => candidate.name === name);
    expect(getTraitEffectInputs(trait, "attacker")).toMatchObject([
      {
        contextKey,
        defaultValue: 0,
        label,
        max: 99,
        min: 0,
        scope: "battle",
        type: "number",
      },
      {
        contextKey: "traitHitCountActivated",
        defaultValue: false,
        label: triggerLabel,
        scope: "battle",
        type: "boolean",
      },
    ]);
    expect(getTraitEffectInputs(trait, "defender")).toEqual([]);
  });

  test("嫁祸显示当前生命和战斗触发勾选", () => {
    const trait = snapshot.traits.find((candidate) => candidate.name === "嫁祸");
    expect(getTraitEffectInputs(trait, "attacker")).toMatchObject([
      {
        contextKey: "attackerHpPercent",
        defaultValue: 100,
        label: "自身生命百分比",
        scope: "battle",
        type: "number",
      },
      {
        contextKey: "traitHitCountActivated",
        defaultValue: false,
        label: "触发嫁祸",
        scope: "battle",
        type: "boolean",
      },
    ]);
    expect(getTraitEffectInputs(trait, "defender")).toEqual([]);
  });

  test("魔眷鸟自由飘不因本次开发新增特性输入", () => {
    const trait = snapshot.traits.find((candidate) => candidate.name === "自由飘");
    expect(getTraitEffectInputs(trait, "attacker")).toEqual([]);
    expect(getTraitEffectInputs(trait, "defender")).toEqual([]);
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

  test("展翅只在防御方显示固定承伤开关", () => {
    const trait = {
      id: "trait-wing-extension",
      name: "展翅",
      description:
        "在场时，自己携带的普通系技能变为翼系技能，若后于对手行动，自己受到的伤害+25%。",
    };

    expect(getTraitEffectInputs(trait, "attacker")).toEqual([]);
    expect(getTraitEffectInputs(trait, "defender")).toMatchObject([
      {
        defaultValue: false,
        key: "actedAfterEnemy",
        label: "后于对手行动",
        scope: "slot",
        type: "boolean",
      },
    ]);
    expect(getTraitEffectInputs(trait, "defender")).toHaveLength(1);
  });
});
