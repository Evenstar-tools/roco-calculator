const ATTACK_EFFECT_KEY = "attackerTraitEffect";
const ATTACK_STACK_KEY = "attackerTraitStacks";
const DEFENSE_EFFECT_KEY = "defenderTraitEffect";
const DEFENSE_STACK_KEY = "defenderTraitStacks";

const PENETRATION_INHERITANCE = Object.freeze({
  description:
    "继承棋绮后的渗透层数，每层双攻双防+5%。",
  displayName: "渗透（进化继承）",
  id: "inherited_trait_penetration",
  inheritedFrom: "棋绮后",
  name: "渗透",
});

export function getInheritedDamageTraits(spirit) {
  const isChessQueenBranch =
    spirit?.baseName === "棋契陛下" &&
    String(spirit?.variantName ?? spirit?.fullName ?? "").includes(
      "棋绮后分支",
    );
  return isChessQueenBranch ? [{ ...PENETRATION_INHERITANCE }] : [];
}

const trigger = (
  kind,
  effect,
  conditionLabel,
  effectLabel,
  extra = {},
) => ({
  condition: {
    defaultValue: false,
    key: extra.conditionKey ?? "traitActivated",
    label: conditionLabel,
    scope: extra.conditionScope ?? "direction",
  },
  effect,
  effectLabel,
  kind,
  ...extra,
});

const stack = (
  kind,
  effect,
  stackLabel,
  effectLabel,
  extra = {},
) => ({
  effect,
  effectLabel,
  kind,
  stack: {
    defaultValue: 0,
    key: extra.stackKey ?? ATTACK_STACK_KEY,
    label: stackLabel,
    max: extra.max ?? 20,
    min: 0,
    scope: "direction",
  },
  ...extra,
});

const automatic = (kind, effect, effectLabel, extra = {}) => ({
  effect,
  effectLabel,
  kind,
  ...extra,
});

const RULES = Object.freeze({
  裁决: stack(
    "attack_defense_percent",
    20,
    "触发层数",
    "每层攻防",
    { roles: ["attacker", "defender"] },
  ),
  滋养: stack(
    "attack_defense_percent",
    20,
    "触发层数",
    "每层攻防",
    { roles: ["attacker", "defender"] },
  ),
  点燃: stack(
    "attack_defense_percent",
    20,
    "触发层数",
    "每层攻防",
    { roles: ["attacker", "defender"] },
  ),
  净化: stack(
    "attack_defense_percent",
    20,
    "触发层数",
    "每层攻防",
    { roles: ["attacker", "defender"] },
  ),
  挺起胸脯: automatic("power_percent", 50, "威力加成", {
    applies: ({ skill }) => Number(skill.cost) === 1,
  }),
  "“国王”的威严": automatic("power_percent", 50, "威力加成", {
    applies: ({ skill }) => Number(skill.cost) === 1,
  }),
  勇敢: automatic("power_percent", 40, "威力加成", {
    applies: ({ skill }) => Number(skill.cost) > 3,
  }),
  顺风: automatic("power_percent", 50, "威力加成", {
    applies: ({ attacker, defender }) =>
      Number(attacker.panelStats?.speed) >
      Number(defender.panelStats?.speed),
  }),
  破空: trigger(
    "power_percent",
    75,
    "先于敌方攻击",
    "触发加成",
    {
      conditionKey: "actedBeforeEnemy",
      conditionScope: "skill",
    },
  ),
  目空: automatic("power_percent", 25, "威力加成", {
    applies: ({ skill }) => skill.type !== "光",
  }),
  夺目: automatic("power_percent", 25, "威力加成", {
    applies: ({ skill }) => skill.type !== "光",
  }),
  涂鸦: automatic("power_percent", 50, "威力加成", {
    applies: ({ attacker, skill }) =>
      !Array.isArray(attacker.types) || !attacker.types.includes(skill.type),
  }),
  不移: trigger(
    "power_percent",
    30,
    "技能无额外效果",
    "触发加成",
    { conditionScope: "skill" },
  ),
  专注力: trigger(
    "attack_percent",
    100,
    "入场首回合",
    "物攻加成",
    { categories: ["physical"] },
  ),
  全神贯注: stack(
    "decay_attack_percent",
    20,
    "已行动次数",
    "每次衰减",
    {
      baseEffect: 100,
      categories: ["physical"],
      max: 5,
    },
  ),
  助燃: stack(
    "attack_percent",
    20,
    "火系技能使用次数",
    "每层双攻",
  ),
  爆燃: stack(
    "attack_percent",
    30,
    "火系技能使用次数",
    "每层双攻",
  ),
  观星: stack(
    "power_percent",
    20,
    "敌方星陨层数",
    "每层威力",
    { types: ["地"] },
  ),
  坠星: stack(
    "power_percent",
    20,
    "敌方星陨层数",
    "每层威力",
  ),
  蓄电池: stack(
    "attack_percent",
    30,
    "入场次数",
    "每层双攻",
    { max: 10 },
  ),
  超级电池: stack(
    "attack_percent",
    40,
    "入场次数",
    "每层双攻",
    { max: 10 },
  ),
  冰钻: stack(
    "power_percent",
    10,
    "敌方技能总能耗",
    "每点威力",
    {
      stackKey: "enemyTotalSkillCost",
      useDefenderTotalCost: true,
    },
  ),
  月光审判: trigger(
    "power_percent",
    100,
    "敌方为首领血脉",
    "触发加成",
  ),
  绒粉星光: trigger(
    "power_percent",
    100,
    "敌方为非本系血脉",
    "触发加成",
  ),
  天通地明: trigger(
    "power_percent",
    100,
    "敌方为污染血脉",
    "触发加成",
  ),
  变形活画: stack(
    "power_percent",
    10,
    "敌方增益层数",
    "每层威力",
    { stackKey: "enemyBuffStacks" },
  ),
  悲悯: stack(
    "attack_percent",
    30,
    "己方力竭数",
    "每层双攻",
    { max: 5 },
  ),
  悼亡: stack(
    "attack_percent",
    30,
    "双方力竭数",
    "每层双攻",
    { max: 10 },
  ),
  壮胆: trigger(
    "attack_percent",
    50,
    "队伍存在虫系精灵",
    "双攻加成",
  ),
  虫群鼓舞: stack(
    "attack_defense_percent",
    10,
    "其他虫系精灵数",
    "每层攻防速",
    { max: 5, roles: ["attacker", "defender"] },
  ),
  虫群突袭: stack(
    "attack_defense_percent",
    15,
    "其他虫系精灵数",
    "每层攻防速",
    { max: 5, roles: ["attacker", "defender"] },
  ),
  得寸进尺: trigger(
    "attack_percent",
    100,
    "雨天或水系环境",
    "双攻加成",
  ),
  最好的伙伴: stack(
    "attack_defense_percent",
    20,
    "触发层数",
    "每层攻防",
    { roles: ["attacker", "defender"] },
  ),
  指挥家: stack(
    "attack_percent",
    30,
    "应对成功次数",
    "每层双攻",
    { max: 10 },
  ),
  身经百练: stack(
    "power_percent",
    20,
    "应对成功次数",
    "每层威力",
    { max: 10, types: ["水", "武"] },
  ),
  恶魔的晚宴: stack(
    "attack_percent",
    50,
    "击败精灵数",
    "每层双攻",
    { max: 5 },
  ),
  鼓气: stack(
    "attack_defense_percent",
    20,
    "能耗3技能使用次数",
    "每层攻防",
    { roles: ["attacker", "defender"] },
  ),
  三鼓作气: stack(
    "attack_defense_percent",
    20,
    "累计触发次数",
    "每层攻防",
    { max: 10, roles: ["attacker", "defender"] },
  ),
  先知: stack(
    "attack_percent",
    50,
    "触发层数",
    "每层双攻",
  ),
  渗透: stack(
    "attack_defense_percent",
    5,
    "已使用武/地技能次数",
    "每层双攻双防",
    { max: 20, roles: ["attacker", "defender"] },
  ),
  草木苏醒时: stack(
    "attack_percent",
    20,
    "本次攻击前回复能量",
    "每点双攻",
    { max: 5 },
  ),
  合拍: stack(
    "attack_percent",
    10,
    "累计相同项数",
    "每项物攻",
    { categories: ["physical"], max: 30 },
  ),
  和弦共振: stack(
    "attack_percent",
    50,
    "场上印记种类",
    "每种魔攻",
    { categories: ["magical"], max: 20 },
  ),
  共鸣: trigger(
    "fixed_power",
    20,
    "技能属于虫鸣",
    "触发威力",
    {
      conditionKey: "bugChirpSkill",
      conditionScope: "skill",
    },
  ),
  齐鸣: trigger(
    "fixed_power",
    20,
    "技能属于虫鸣",
    "触发威力",
    {
      conditionKey: "bugChirpSkill",
      conditionScope: "skill",
    },
  ),
  向心力: automatic("fixed_power", 30, "威力加成", {
    applies: ({ context }) =>
      Number(context.skillPosition) === 1 ||
      Number(context.skillPosition) === 2,
  }),
  张弛有度: trigger(
    "attack_percent",
    40,
    "当前为周末",
    "双攻加成",
  ),
  水翼飞升: automatic("power_percent", 30, "威力加成", {
    applies: ({ skill }) => Number(skill.cost) === 0,
  }),
  冻土: stack(
    "power_percent",
    10,
    "携带冰系技能数",
    "每层威力",
    { max: 4, types: ["地"] },
  ),
  拨浪鼓: stack(
    "fixed_power",
    10,
    "己方状态技能次数",
    "每层威力",
    { max: 20, types: ["毒", "萌"] },
  ),
  蒸汽膨胀: stack(
    "fixed_power",
    10,
    "己方火系技能次数",
    "每层威力",
    { max: 20 },
  ),
  定向精炼: stack(
    "power_percent",
    10,
    "己方防御技能次数",
    "每层威力",
    { max: 20, types: ["机械", "地"] },
  ),
  斗技: stack(
    "fixed_power",
    30,
    "应对成功次数",
    "每层威力",
    { max: 10 },
  ),
  血型吸引: stack(
    "fixed_power",
    10,
    "敌方技能系别数",
    "每层威力",
    { max: 18 },
  ),
  搜刮: stack(
    "attack_percent",
    20,
    "敌方聚能或换宠次数",
    "每层魔攻",
    { categories: ["magical"], max: 20 },
  ),
  扫荡: stack(
    "attack_percent",
    20,
    "敌方聚能或换宠次数",
    "每层魔攻",
    { categories: ["magical"], max: 20 },
  ),
  冰雪魂魄: stack(
    "power_percent",
    10,
    "敌方冻结总层数",
    "每层威力",
    { max: 100, types: ["冰"] },
  ),
  淬炼火: stack(
    "attack_defense_percent",
    10,
    "己方火系技能次数",
    "每层攻防",
    { max: 10, roles: ["attacker", "defender"] },
  ),
  猫精灵的礼物: stack(
    "attack_percent",
    40,
    "完整选择次数",
    "每层物攻",
    { categories: ["physical"], max: 10 },
  ),
  贪得无厌: stack(
    "attack_percent",
    10,
    "每5%过量回复",
    "每层物攻",
    { categories: ["physical"], max: 20 },
  ),
  光度换算: stack(
    "fixed_power",
    20,
    "已使用火系技能次数",
    "每层威力",
    { max: 20, types: ["光"] },
  ),
  图书守卫者: trigger(
    "attack_percent",
    100,
    "入场时魔力为1",
    "双攻加成",
  ),
  圣火骑士: trigger(
    "power_percent",
    100,
    "应对成功",
    "触发加成",
    {
      conditionKey: "counterTriggered",
      conditionScope: "skill",
    },
  ),
  电流刺激: trigger(
    "fixed_power",
    40,
    "触发迸发",
    "触发威力",
    {
      conditionKey: "burstTriggered",
      conditionScope: "skill",
    },
  ),
  展翅: trigger(
    "final_damage_percent",
    25,
    "后于敌方行动",
    "承伤增加",
    {
      conditionKey: "actedAfterEnemy",
      conditionScope: "skill",
      role: "defender",
    },
  ),
  狂欢开始: trigger(
    "final_damage_percent",
    25,
    "受到克制伤害",
    "承伤增加",
    {
      conditionKey: "receivedSuperEffectiveDamage",
      conditionScope: "skill",
      role: "defender",
    },
  ),
});

const LEGACY_EDITABLE_RULES = Object.freeze({
  偏振: automatic("damage_reduction_percent", 40, "减伤比例", {
    role: "defender",
  }),
  完全偏振: automatic("damage_reduction_percent", 50, "减伤比例", {
    role: "defender",
  }),
  绝对秩序: automatic("damage_reduction_percent", 50, "减伤比例", {
    role: "defender",
  }),
});

const DIRECT_DAMAGE_PATTERN =
  /(技能威力|威力|物攻|魔攻|双攻|伤害[-+]|受到.*伤害|攻防)/;
const INDIRECT_DAMAGE_PATTERN =
  /(对攻击自己的精灵造成|敌方获得(?:物攻|魔攻|双攻|攻防)|使(?:其|敌方)获得.*(?:物攻|魔攻|双攻|攻防).*[－-]|更换入场的精灵获得|受到致命伤害|保留1血|回复等量生命|随机奉献)/;

function numberFromDescription(description, fallback = 0) {
  const match = String(description).match(/[+＋-](\d+)(%)?/);
  if (match) {
    return {
      effect: Number(match[1]),
      percent: match[2] === "%",
    };
  }
  if (String(description).includes("翻倍")) {
    return { effect: 100, percent: true };
  }
  return { effect: fallback, percent: true };
}

function inferredRule(trait, role) {
  const description = trait?.description ?? "";
  if (!DIRECT_DAMAGE_PATTERN.test(description)) return null;
  if (INDIRECT_DAMAGE_PATTERN.test(description)) return null;
  const hasDefenseEffect =
    /(受到|承受|减伤|伤害[-－]|承伤)/.test(description);
  const hasOffenseEffect =
    /(技能威力|威力[+＋]|物攻[+＋]|魔攻[+＋]|双攻[+＋]|造成.*伤害)/.test(
      description,
    );
  if (role === "attacker" && hasDefenseEffect && !hasOffenseEffect) {
    return null;
  }
  if (role === "defender" && !hasDefenseEffect) return null;
  const { effect, percent } = numberFromDescription(description);
  if (effect <= 0) return null;
  const isDefense =
    role === "defender" &&
    /(受到|承受|伤害[-+])/.test(description);
  const kind = isDefense
    ? description.includes("伤害-")
      ? "damage_reduction_percent"
      : "final_damage_percent"
    : /(物攻|魔攻|双攻|攻防)/.test(description)
      ? "attack_percent"
      : percent
        ? "power_percent"
        : "fixed_power";
  const hasStacks = /每.+(?:1|一)(?:次|层|只|点|种|个)/.test(description);
  const needsTrigger =
    !hasStacks &&
    /(若|当|后|时|天气|队伍|应对成功|入场首回合)/.test(description);

  if (hasStacks) {
    return stack(
      kind,
      effect,
      "累计层数",
      percent ? "每层加成" : "每层威力",
      {
        role,
        stackKey: role === "defender" ? DEFENSE_STACK_KEY : ATTACK_STACK_KEY,
      },
    );
  }
  if (needsTrigger) {
    return trigger(
      kind,
      effect,
      "条件已触发",
      percent ? "触发加成" : "触发威力",
      { role },
    );
  }
  return automatic(
    kind,
    effect,
    percent ? "特性加成" : "特性威力",
    { role },
  );
}

export function getTraitEffectRule(trait, role = "attacker") {
  const named = RULES[trait?.name] ?? LEGACY_EDITABLE_RULES[trait?.name];
  if (
    named &&
    ((named.roles ?? [named.role ?? "attacker"]).includes(role))
  ) {
    if (role === "defender" && named.stack) {
      return {
        ...named,
        stack: {
          ...named.stack,
          key:
            named.stack.key === ATTACK_STACK_KEY
              ? DEFENSE_STACK_KEY
              : named.stack.key,
        },
      };
    }
    return named;
  }
  return inferredRule(trait, role);
}

export function hasNamedTraitEffectRule(trait, role = "attacker") {
  const named = RULES[trait?.name];
  return Boolean(
    named &&
      (named.roles ?? [named.role ?? "attacker"]).includes(role),
  );
}

function effectKey(role) {
  return role === "defender" ? DEFENSE_EFFECT_KEY : ATTACK_EFFECT_KEY;
}

export function getTraitEffectInputs(trait, role = "attacker") {
  const rule = getTraitEffectRule(trait, role);
  if (!rule) return [];
  const inputs = [];
  if (rule.condition) {
    inputs.push({
      ...rule.condition,
      type: "boolean",
    });
  }
  if (rule.stack) {
    inputs.push({
      ...rule.stack,
      type: "number",
    });
  }
  inputs.push({
    defaultValue: rule.effect,
    key: effectKey(role),
    label: rule.effectLabel,
    max: rule.kind === "damage_reduction_percent" ? 100 : 500,
    min: 0,
    scope: "direction",
    suffix: rule.kind.includes("percent") ? "%" : "",
    type: "number",
  });
  return inputs;
}

function finiteNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function categoryMatches(rule, skill) {
  return (
    !Array.isArray(rule.categories) ||
    rule.categories.includes(skill.category)
  );
}

function typeMatches(rule, skill) {
  return !Array.isArray(rule.types) || rule.types.includes(skill.type);
}

export function resolveTraitEffectRule(trait, role, input) {
  const rule = getTraitEffectRule(trait, role);
  if (!rule) return null;
  if (!categoryMatches(rule, input.skill) || !typeMatches(rule, input.skill)) {
    return {
      attackLevelBonus: 0,
      attackerDefenseLevelBonus: 0,
      attackMultiplier: 1,
      defenseLevelBonus: 0,
      defenderDefenseLevelBonus: 0,
      damageReductionMultiplier: 1,
      finalDamageMultiplier: 1,
      fixedPowerAdd: 0,
      powerPercentAdd: 0,
      powerMultiplier: 1,
      step: null,
    };
  }
  if (rule.applies && !rule.applies(input)) {
    return {
      attackLevelBonus: 0,
      attackerDefenseLevelBonus: 0,
      attackMultiplier: 1,
      defenseLevelBonus: 0,
      defenderDefenseLevelBonus: 0,
      damageReductionMultiplier: 1,
      finalDamageMultiplier: 1,
      fixedPowerAdd: 0,
      powerPercentAdd: 0,
      powerMultiplier: 1,
      step: null,
    };
  }

  const triggered = rule.condition
    ? input.context[rule.condition.key] === true
    : true;
  const rawStacks = rule.stack
    ? input.context[rule.stack.key] ??
      (rule.useDefenderTotalCost ? input.defender.totalSkillCost : 0)
    : 1;
  const stacks = Math.max(0, Math.floor(finiteNumber(rawStacks, 0)));
  const active = triggered && (!rule.stack || stacks > 0);
  const effect = Math.max(
    0,
    finiteNumber(input.context[effectKey(role)], rule.effect),
  );
  const amount = active
    ? rule.kind === "decay_attack_percent"
      ? Math.max(0, finiteNumber(rule.baseEffect, 100) - stacks * effect)
      : effect * stacks
    : 0;
  const result = {
    attackLevelBonus: 0,
    attackerDefenseLevelBonus: 0,
    attackMultiplier: 1,
    defenseLevelBonus: 0,
    defenderDefenseLevelBonus: 0,
    damageReductionMultiplier: 1,
    finalDamageMultiplier: 1,
    fixedPowerAdd: 0,
    powerPercentAdd: 0,
    powerMultiplier: 1,
  };

  if (rule.kind === "attack_percent" || rule.kind === "decay_attack_percent") {
    result.attackLevelBonus = amount / 10;
    result.attackMultiplier = 1 + amount / 100;
  } else if (rule.kind === "attack_defense_percent") {
    if (role === "attacker") {
      result.attackLevelBonus = amount / 10;
      result.attackerDefenseLevelBonus = amount / 10;
      result.attackMultiplier = 1 + amount / 100;
    } else {
      result.defenseLevelBonus = amount / 10;
      result.defenderDefenseLevelBonus = amount / 10;
    }
  } else if (rule.kind === "power_percent") {
    result.powerPercentAdd = amount / 100;
    result.powerMultiplier = 1 + amount / 100;
  } else if (rule.kind === "fixed_power") {
    result.fixedPowerAdd = amount;
  } else if (rule.kind === "damage_reduction_percent") {
    result.damageReductionMultiplier = Math.max(0, 1 - amount / 100);
  } else if (rule.kind === "final_damage_percent") {
    result.finalDamageMultiplier = 1 + amount / 100;
  }

  return {
    ...result,
    step: active
      ? {
          after:
            rule.kind === "fixed_power"
              ? result.fixedPowerAdd
              : rule.kind === "attack_percent" ||
                  rule.kind === "decay_attack_percent" ||
                  rule.kind === "attack_defense_percent"
                ? rule.kind === "attack_defense_percent" &&
                  role === "defender"
                  ? 1 + amount / 100
                  : result.attackMultiplier
                : rule.kind === "power_percent"
                  ? result.powerMultiplier
                  : rule.kind === "damage_reduction_percent"
                    ? result.damageReductionMultiplier
                    : result.finalDamageMultiplier,
          before: rule.kind === "fixed_power" ? 0 : 1,
          input: rule.stack ? { effect, stacks } : { effect, triggered },
          label: trait.name ?? trait.id,
          source: "reviewed-trait:interactive-effect-v1",
        }
      : null,
  };
}

export const TRAIT_EFFECT_RULE_NAMES = Object.freeze(Object.keys(RULES));
