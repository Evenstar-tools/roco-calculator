const ATTACK_EFFECT_KEY = "attackerTraitEffect";
const ATTACK_STACK_KEY = "attackerTraitStacks";
const DEFENSE_EFFECT_KEY = "defenderTraitEffect";
const DEFENSE_STACK_KEY = "defenderTraitStacks";
const ATTACK_SECONDARY_EFFECT_KEY = "attackerTraitSecondaryEffect";
const DEFENSE_SECONDARY_EFFECT_KEY = "defenderTraitSecondaryEffect";
const ATTACK_SPEED_EFFECT_KEY = "attackerTraitSpeedEffect";
const DEFENSE_SPEED_EFFECT_KEY = "defenderTraitSpeedEffect";

export const DISC_SWAP_SKILL_POWER_BONUSES = Object.freeze([
  Object.freeze({ fixedPowerAdd: 15, skillName: "音波弹" }),
  Object.freeze({ fixedPowerAdd: 20, skillName: "音爆" }),
  Object.freeze({ fixedPowerAdd: 20, skillName: "金属噪音" }),
  Object.freeze({ fixedPowerAdd: 5, perHit: true, skillName: "午夜噪音" }),
]);

const DISC_SWAP_POWER_BY_SKILL = Object.freeze(
  Object.fromEntries(
    DISC_SWAP_SKILL_POWER_BONUSES.map(({ fixedPowerAdd, skillName }) => [
      skillName,
      fixedPowerAdd,
    ]),
  ),
);

export function getTraitSkillPowerBonuses(trait) {
  return trait?.name === "换碟"
    ? DISC_SWAP_SKILL_POWER_BONUSES.map((bonus) => ({ ...bonus }))
    : [];
}

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

const triggeredStack = (
  kind,
  effect,
  conditionLabel,
  stackLabel,
  effectLabel,
  extra = {},
) => ({
  ...stack(kind, effect, stackLabel, effectLabel, extra),
  condition: {
    defaultValue: false,
    key: extra.conditionKey ?? "traitActivated",
    label: conditionLabel,
    scope: extra.conditionScope ?? "direction",
  },
});

const RULES = Object.freeze({
  换碟: automatic("fixed_power", 15, "固定基础威力", {
    applies: ({ skill }) =>
      Object.hasOwn(DISC_SWAP_POWER_BY_SKILL, skill?.name),
    editableEffect: false,
    fixedPowerBySkillName: DISC_SWAP_POWER_BY_SKILL,
  }),
  守护之心: stack(
    "physical_defense_percent",
    20,
    "不同增益种类",
    "每种物防",
    { max: 50, roles: ["attacker", "defender"] },
  ),
  保守派: trigger(
    "defense_percent",
    80,
    "总技能能耗小于4",
    "双防加成",
    { editableEffect: false, roles: ["attacker", "defender"] },
  ),
  囤积: stack(
    "defense_percent",
    10,
    "当前能量",
    "每点双防",
    { max: 99, roles: ["attacker", "defender"] },
  ),
  游弋: trigger(
    "defense_percent",
    100,
    "正在蓄力",
    "双防加成",
    { editableEffect: false, roles: ["attacker", "defender"] },
  ),
  惊吓: trigger(
    "damage_reduction_percent",
    100,
    "攻击方能量为0",
    "免疫伤害",
    {
      conditionKey: "attackerEnergyZero",
      conditionScope: "skill",
      editableEffect: false,
      role: "defender",
    },
  ),
  逐魂鸟: automatic("damage_reduction_percent", 100, "免疫伤害", {
    applies: ({ skill }) => Number(skill.cost) <= 1,
    editableEffect: false,
    role: "defender",
  }),
  构装契约者: trigger(
    "defense_percent",
    100,
    "敌方魔力为1",
    "双防加成",
    { editableEffect: false, roles: ["attacker", "defender"] },
  ),
  裁决: stack(
    "attack_defense_percent",
    20,
    "触发层数",
    "每层攻防",
    {
      roles: ["attacker", "defender"],
      speedEffect: 20,
      speedEffectLabel: "每层速度",
      speedMode: "percent",
    },
  ),
  滋养: stack(
    "attack_defense_percent",
    20,
    "触发层数",
    "每层攻防",
    {
      roles: ["attacker", "defender"],
      speedEffect: 20,
      speedEffectLabel: "每层速度",
      speedMode: "percent",
    },
  ),
  点燃: stack(
    "attack_defense_percent",
    20,
    "触发层数",
    "每层攻防",
    {
      roles: ["attacker", "defender"],
      speedEffect: 20,
      speedEffectLabel: "每层速度",
      speedMode: "percent",
    },
  ),
  净化: stack(
    "attack_defense_percent",
    20,
    "触发层数",
    "每层攻防",
    {
      roles: ["attacker", "defender"],
      speedEffect: 20,
      speedEffectLabel: "每层速度",
      speedMode: "percent",
    },
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
  顺风: trigger(
    "power_percent",
    50,
    "先于敌方攻击",
    "触发加成",
    {
      conditionKey: "actedBeforeEnemy",
      conditionScope: "skill",
    },
  ),
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
    {
      speedEffect: 5,
      speedEffectLabel: "每层速度",
      speedMode: "flat",
      stackKey: "enemyBuffStacks",
    },
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
    {
      max: 5,
      roles: ["attacker", "defender"],
      speedEffect: 10,
      speedEffectLabel: "每层速度",
      speedMode: "percent",
    },
  ),
  虫群突袭: stack(
    "attack_defense_percent",
    15,
    "其他虫系精灵数",
    "每层攻防速",
    {
      max: 5,
      roles: ["attacker", "defender"],
      speedEffect: 15,
      speedEffectLabel: "每层速度",
      speedMode: "percent",
    },
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
    {
      roles: ["attacker", "defender"],
      speedEffect: 20,
      speedEffectLabel: "每层速度",
      speedMode: "percent",
    },
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
    {
      speedEffect: 50,
      speedEffectLabel: "每层速度",
      speedMode: "flat",
    },
  ),
  预警: trigger(
    "speed_flat",
    50,
    "敌方技能足以击败自己",
    "速度加成",
    {
      roles: ["attacker", "defender"],
    },
  ),
  哨兵: trigger(
    "speed_flat",
    50,
    "敌方技能足以击败自己",
    "速度加成",
    {
      roles: ["attacker", "defender"],
    },
  ),
  流沙统治者: trigger(
    "speed_flat",
    50,
    "沙暴天气",
    "速度加成",
    {
      roles: ["attacker", "defender"],
    },
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
    "attack_defense_percent",
    10,
    "累计相同项数",
    "每项物攻物防",
    {
      categories: ["physical"],
      max: 30,
      roles: ["attacker", "defender"],
    },
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
    "weekend_attack_weekday_defense_percent",
    40,
    "周末",
    "攻防加成",
    { editableEffect: false, roles: ["attacker", "defender"] },
  ),
  水翼飞升: automatic("power_percent", 30, "威力加成", {
    applies: ({ skill }) => Number(skill.cost) === 0,
  }),
  冻土: stack(
    "power_percent",
    10,
    "携带冰系技能数",
    "每层威力",
    {
      automaticStack: {
        label: "携带冰系技能数",
        skillTypes: ["冰"],
      },
      max: 4,
      types: ["地"],
    },
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
    "split_attack_defense_percent",
    20,
    "敌方聚能或换宠次数",
    "每层魔攻",
    {
      categories: ["magical"],
      defenseEffect: 10,
      defenseEffectLabel: "每层魔防",
      max: 20,
      roles: ["attacker", "defender"],
    },
  ),
  冰雪魂魄: trigger(
    "power_percent",
    100,
    "暴风雪天气",
    "冰系威力",
    {
      conditionKey: "blizzardWeather",
      editableEffect: false,
      types: ["冰"],
    },
  ),
  淬炼火: stack(
    "attack_defense_percent",
    10,
    "己方火系技能次数",
    "每层攻防",
    {
      max: 10,
      roles: ["attacker", "defender"],
      speedEffect: 10,
      speedEffectLabel: "每层速度",
      speedMode: "flat",
    },
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
    30,
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
      editableEffect: false,
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
    "后于对手行动",
    "承伤增加",
    {
      conditionKey: "actedAfterEnemy",
      conditionScope: "skill",
      editableEffect: false,
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

export function getTraitAutomaticStack(trait, role = "attacker", skills = []) {
  const automaticStack = getTraitEffectRule(trait, role)?.automaticStack;
  if (!automaticStack) return null;
  const matchingTypes = new Set(automaticStack.skillTypes ?? []);
  return {
    label: automaticStack.label,
    skillTypes: [...matchingTypes],
    value: skills.filter((skill) => matchingTypes.has(skill?.type)).length,
  };
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

function secondaryEffectKey(role) {
  return role === "defender"
    ? DEFENSE_SECONDARY_EFFECT_KEY
    : ATTACK_SECONDARY_EFFECT_KEY;
}

function speedEffectKey(role) {
  return role === "defender"
    ? DEFENSE_SPEED_EFFECT_KEY
    : ATTACK_SPEED_EFFECT_KEY;
}

export function getTraitEffectInputs(trait, role = "attacker") {
  const hitCountInputs = getTraitHitCountInputs(trait, role);
  if (hitCountInputs.length > 0) return hitCountInputs;
  if (trait?.name === "衡量") {
    return normalizeTriggerControls([
      {
        contextKey: "balanceTriggered",
        defaultValue: false,
        label: "触发衡量",
        scope: "battle",
        type: "boolean",
      },
    ], {
      source: role === "defender" ? "defenderTrait" : "attackerTrait",
    });
  }
  if (trait?.name === BEAST_FLOWER_TRAIT_NAME) {
    return normalizeTriggerControls([
      {
        contextKey: "bloodlineType",
        defaultValue: "",
        label: "血脉",
        options: [
          { value: "", label: "选择血脉" },
          ...BEAST_FLOWER_BLOODLINES.map(({ value, label, summary }) => ({
            value,
            label: `${label}｜${summary}`,
          })),
        ],
        scope: "direction",
        type: "choice",
      },
      {
        contextKey: "bloodlineActivated",
        defaultValue: false,
        label: "入场已触发",
        scope: "battle",
        type: "boolean",
      },
    ], {
      source: role === "defender" ? "defenderTrait" : "attackerTrait",
    });
  }
  if (trait?.name === CONTRACT_SHAPE_TRAIT_NAME) {
    return normalizeTriggerControls([
      {
        contextKey: "contractBallType",
        defaultValue: "",
        label: "咕噜球",
        options: [
          { value: "", label: "选择咕噜球" },
          ...CONTRACT_BALLS.map(({ value, label, summary }) => ({
            value,
            label: `${label}｜${summary}`,
          })),
        ],
        scope: "direction",
        type: "choice",
      },
      {
        contextKey: "contractPrismEffect",
        defaultValue: "",
        label: "棱镜效果",
        options: [
          { value: "", label: "选择随机到的球" },
          ...CONTRACT_BALLS
            .filter(({ value }) => value !== "prism")
            .map(({ value, label, summary }) => ({
              value,
              label: `${label}｜${summary}`,
            })),
        ],
        scope: "direction",
        type: "choice",
        visibleWhen: {
          contextKey: "contractBallType",
          equals: "prism",
        },
      },
    ], {
      source: role === "defender" ? "defenderTrait" : "attackerTrait",
    });
  }
  const rule = getTraitEffectRule(trait, role);
  if (!rule) return [];
  const inputs = [];
  if (rule.condition) {
    inputs.push({
      ...rule.condition,
      type: "boolean",
    });
  }
  if (rule.stack && !rule.automaticStack) {
    inputs.push({
      ...rule.stack,
      type: "number",
    });
  }
  if (rule.editableEffect !== false) {
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
  }
  if (rule.defenseEffect !== undefined) {
    inputs.push({
      defaultValue: rule.defenseEffect,
      key: secondaryEffectKey(role),
      label: rule.defenseEffectLabel,
      max: 500,
      min: 0,
      scope: "direction",
      suffix: "%",
      type: "number",
    });
  }
  if (rule.speedEffect !== undefined) {
    inputs.push({
      defaultValue: rule.speedEffect,
      key: speedEffectKey(role),
      label: rule.speedEffectLabel,
      max: 500,
      min: 0,
      scope: "direction",
      suffix: rule.speedMode === "percent" ? "%" : "",
      type: "number",
    });
  }
  return normalizeTriggerControls(inputs, {
    source: role === "defender" ? "defenderTrait" : "attackerTrait",
  });
}

export function resolveBeastFlowerBloodlineTrait({
  traits = [],
  role = "attacker",
  context = {},
  skill = null,
} = {}) {
  const trait = traits.find(({ name }) => name === BEAST_FLOWER_TRAIT_NAME);
  if (!trait) return resolveBeastFlowerBloodline({ skill });

  const controls = getTraitEffectInputs(trait, role);
  const projected = projectTriggerContext(context, controls);
  return {
    ...resolveBeastFlowerBloodline({
    activated: projected.bloodlineActivated,
    bloodlineType: projected.bloodlineType,
    ownerRole: role,
    skill,
    }),
    traitId: trait.id,
  };
}

export function resolveContractShapeTrait({
  traits = [],
  role = "attacker",
  context = {},
  skill = null,
} = {}) {
  const trait = traits.find(({ name }) => name === CONTRACT_SHAPE_TRAIT_NAME);
  if (!trait) return resolveContractShape({ skill });

  const controls = getTraitEffectInputs(trait, role);
  const projected = projectTriggerContext(context, controls);
  return {
    ...resolveContractShape({
      ballType: projected.contractBallType,
      prismEffect: projected.contractPrismEffect,
      ownerRole: role,
      skill,
    }),
    traitId: trait.id,
  };
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
  if (
    trait?.name === BEAST_FLOWER_TRAIT_NAME ||
    trait?.name === CONTRACT_SHAPE_TRAIT_NAME
  ) {
    return {
      attackLevelBonus: 0,
      attackerSpeedFlatBonus: 0,
      attackerSpeedLevelBonus: 0,
      attackerDefenseLevelBonus: 0,
      attackMultiplier: 1,
      defenseLevelBonus: 0,
      defenderDefenseLevelBonus: 0,
      defenderSpeedFlatBonus: 0,
      defenderSpeedLevelBonus: 0,
      damageReductionMultiplier: 1,
      finalDamageMultiplier: 1,
      fixedPowerAdd: 0,
      powerPercentAdd: 0,
      powerMultiplier: 1,
      step: null,
    };
  }
  const rule = getTraitEffectRule(trait, role);
  if (!rule) return null;
  input = {
    ...input,
    context: projectTriggerContext(
      input.context,
      getTraitEffectInputs(trait, role),
    ),
  };
  if (!categoryMatches(rule, input.skill) || !typeMatches(rule, input.skill)) {
    return {
      attackLevelBonus: 0,
      attackerSpeedFlatBonus: 0,
      attackerSpeedLevelBonus: 0,
      attackerDefenseLevelBonus: 0,
      attackMultiplier: 1,
      defenseLevelBonus: 0,
      defenderDefenseLevelBonus: 0,
      defenderSpeedFlatBonus: 0,
      defenderSpeedLevelBonus: 0,
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
      attackerSpeedFlatBonus: 0,
      attackerSpeedLevelBonus: 0,
      attackerDefenseLevelBonus: 0,
      attackMultiplier: 1,
      defenseLevelBonus: 0,
      defenderDefenseLevelBonus: 0,
      defenderSpeedFlatBonus: 0,
      defenderSpeedLevelBonus: 0,
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
    ? rule.automaticStack
      ? (input.attacker.skillTypes ?? []).filter((type) =>
          rule.automaticStack.skillTypes.includes(type),
        ).length
      : input.context[rule.stack.key] ??
        (rule.useDefenderTotalCost ? input.defender.totalSkillCost : 0)
    : 1;
  const stacks = Math.max(0, Math.floor(finiteNumber(rawStacks, 0)));
  const isWeekendAttackWeekdayDefense =
    rule.kind === "weekend_attack_weekday_defense_percent";
  const active =
    (isWeekendAttackWeekdayDefense || triggered) &&
    (!rule.stack || stacks > 0);
  const skillSpecificEffect = rule.fixedPowerBySkillName?.[input.skill?.name];
  const effect = Math.max(
    0,
    finiteNumber(
      skillSpecificEffect,
      finiteNumber(input.context[effectKey(role)], rule.effect),
    ),
  );
  const amount = active
    ? rule.kind === "decay_attack_percent"
      ? Math.max(0, finiteNumber(rule.baseEffect, 100) - stacks * effect)
      : effect * stacks
    : 0;
  const defenseEffect = Math.max(
    0,
    finiteNumber(
      input.context[secondaryEffectKey(role)],
      rule.defenseEffect ?? rule.effect,
    ),
  );
  const defenseAmount = active ? defenseEffect * stacks : 0;
  const speedEffect = Math.max(
    0,
    finiteNumber(input.context[speedEffectKey(role)], rule.speedEffect ?? 0),
  );
  const speedAmount = active ? speedEffect * stacks : 0;
  const result = {
    attackLevelBonus: 0,
    attackerSpeedFlatBonus: 0,
    attackerSpeedLevelBonus: 0,
    attackerDefenseLevelBonus: 0,
    attackMultiplier: 1,
    defenseLevelBonus: 0,
    defenderDefenseLevelBonus: 0,
    defenderSpeedFlatBonus: 0,
    defenderSpeedLevelBonus: 0,
    damageReductionMultiplier: 1,
    finalDamageMultiplier: 1,
    fixedPowerAdd: 0,
    powerPercentAdd: 0,
    powerMultiplier: 1,
  };

  if (rule.kind === "attack_percent" || rule.kind === "decay_attack_percent") {
    result.attackLevelBonus = amount / 10;
    result.attackMultiplier = 1 + amount / 100;
  } else if (rule.kind === "weekend_attack_weekday_defense_percent") {
    if (triggered && role === "attacker") {
      result.attackLevelBonus = amount / 10;
      result.attackMultiplier = 1 + amount / 100;
    } else if (!triggered && role === "attacker") {
      result.attackerDefenseLevelBonus = amount / 10;
    } else if (!triggered) {
      result.defenseLevelBonus = amount / 10;
      result.defenderDefenseLevelBonus = amount / 10;
    }
  } else if (rule.kind === "attack_defense_percent") {
    if (role === "attacker") {
      result.attackLevelBonus = amount / 10;
      result.attackerDefenseLevelBonus = amount / 10;
      result.attackMultiplier = 1 + amount / 100;
    } else {
      result.defenseLevelBonus = amount / 10;
      result.defenderDefenseLevelBonus = amount / 10;
    }
  } else if (rule.kind === "split_attack_defense_percent") {
    if (role === "attacker") {
      result.attackLevelBonus = amount / 10;
      result.attackerDefenseLevelBonus = defenseAmount / 10;
      result.attackMultiplier = 1 + amount / 100;
    } else {
      result.defenseLevelBonus = defenseAmount / 10;
      result.defenderDefenseLevelBonus = defenseAmount / 10;
    }
  } else if (rule.kind === "defense_percent") {
    if (role === "attacker") {
      result.attackerDefenseLevelBonus = amount / 10;
    } else {
      result.defenseLevelBonus = amount / 10;
      result.defenderDefenseLevelBonus = amount / 10;
    }
  } else if (rule.kind === "physical_defense_percent") {
    if (role === "attacker") {
      result.attackerDefenseLevelBonus = amount / 10;
    } else {
      result.defenderDefenseLevelBonus = amount / 10;
      if (input.skill?.category === "physical") {
        result.defenseLevelBonus = amount / 10;
      }
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
  } else if (rule.kind === "speed_flat") {
    if (role === "attacker") result.attackerSpeedFlatBonus = amount;
    else result.defenderSpeedFlatBonus = amount;
  }

  if (rule.speedMode === "percent") {
    if (role === "attacker") result.attackerSpeedLevelBonus = speedAmount / 10;
    else result.defenderSpeedLevelBonus = speedAmount / 10;
  } else if (rule.speedMode === "flat") {
    if (role === "attacker") result.attackerSpeedFlatBonus = speedAmount;
    else result.defenderSpeedFlatBonus = speedAmount;
  }

  return {
    ...result,
    step: active
      ? {
          after:
            rule.kind === "fixed_power"
              ? result.fixedPowerAdd
              : rule.kind === "speed_flat"
                ? amount
              : rule.kind === "attack_percent" ||
                  rule.kind === "decay_attack_percent" ||
                  rule.kind === "attack_defense_percent" ||
                  rule.kind === "split_attack_defense_percent" ||
                  rule.kind === "defense_percent" ||
                  rule.kind === "physical_defense_percent" ||
                  rule.kind === "weekend_attack_weekday_defense_percent"
                ? (rule.kind === "attack_defense_percent" ||
                    rule.kind === "split_attack_defense_percent") &&
                  role === "defender"
                  ? 1 +
                    (rule.kind === "split_attack_defense_percent"
                      ? defenseAmount
                      : amount) /
                      100
                  : rule.kind === "defense_percent" ||
                      rule.kind === "physical_defense_percent"
                    ? 1 + amount / 100
                    : rule.kind === "weekend_attack_weekday_defense_percent"
                      ? 1 + amount / 100
                    : result.attackMultiplier
                : rule.kind === "power_percent"
                  ? result.powerMultiplier
                  : rule.kind === "damage_reduction_percent"
                    ? result.damageReductionMultiplier
                    : result.finalDamageMultiplier,
          before:
            rule.kind === "fixed_power" || rule.kind === "speed_flat" ? 0 : 1,
          input: rule.stack
            ? {
                ...(rule.defenseEffect === undefined ? {} : { defenseEffect }),
                effect,
                ...(rule.speedEffect === undefined ? {} : { speedEffect }),
                stacks,
              }
            : { effect, triggered },
          label: isWeekendAttackWeekdayDefense
            ? `${trait.name ?? trait.id} · ${triggered ? "周末双攻" : "平日双防"}`
            : rule.fixedPowerBySkillName
              ? `${trait.name ?? trait.id} · ${input.skill.name} +${effect}`
            : trait.name ?? trait.id,
          source: "reviewed-trait:interactive-effect-v1",
        }
      : null,
  };
}

export const TRAIT_EFFECT_RULE_NAMES = Object.freeze(Object.keys(RULES));
import {
  BEAST_FLOWER_BLOODLINES,
  BEAST_FLOWER_TRAIT_NAME,
  resolveBeastFlowerBloodline,
} from "./beast-flower-bloodline.js";
import {
  CONTRACT_BALLS,
  CONTRACT_SHAPE_TRAIT_NAME,
  resolveContractShape,
} from "./contract-shape.js";
import {
  normalizeTriggerControls,
  projectTriggerContext,
} from "./trigger-controls.js";
import { getTraitHitCountInputs } from "./trait-hit-count.js";
