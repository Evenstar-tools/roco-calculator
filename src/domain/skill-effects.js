const booleanInput = (key, label, extra = {}) => ({
  defaultValue: false,
  ...extra,
  key,
  label,
  type: "boolean",
});
const numberInput = (key, label, min = 0, max, defaultValue) => ({
  key,
  label,
  min,
  ...(max === undefined ? {} : { max }),
  ...(defaultValue === undefined ? {} : { defaultValue }),
  type: "number",
});

export const SWEET_TRAP_ENERGY_RANGE = Object.freeze([0, 99]);

const choiceInput = (key, label, options, defaultValue) => ({
  defaultValue,
  key,
  label,
  options,
  type: "choice",
});
const when = (input, key, equals, defaultValue) => ({
  ...input,
  when: { defaultValue, equals, key },
});

const booleanAdd = (contextKey, label, add, extra = {}) => ({
  inputs: [booleanInput(contextKey, label)],
  ruleId: "boolean_power_add",
  ruleParams: { add, contextKey, label, ...extra },
});

const counterMultiplier = (multiplier, extra = {}) => ({
  inputs: [booleanInput("counterTriggered", "触发应对")],
  ruleId: "counter_multiplier",
  ruleParams: {
    contextKey: "counterTriggered",
    label: "触发应对",
    multiplier,
    ...extra,
  },
});

const positionAdd = (positions, add) => ({
  inputs: [numberInput("skillPosition", "技能位置", 1, 4)],
  ruleId: "position_power_add",
  ruleParams: { add, contextKey: "skillPosition", positions },
});

const stackAdd = (contextKey, label, perStack, max = 20) => ({
  inputs: [numberInput(contextKey, label, 0, max, 0)],
  ruleId: "stack_scaled",
  ruleParams: { contextKey, defaultValue: 0, label, perStack },
});

const hitCountGrowth = (
  contextKey,
  label,
  baseHitCount,
  perStack,
  max = 20,
  defaultValue = 0,
) => ({
  inputs: [numberInput(contextKey, label, 0, max, defaultValue)],
  ruleId: "hit_count_scaled",
  ruleParams: {
    baseHitCount,
    contextKey,
    defaultValue,
    label,
    perStack,
  },
});

const exponentialGrowth = (
  contextKey,
  label,
  multiplier = 2,
  max = 10,
) => ({
  inputs: [numberInput(contextKey, label, 0, max, 0)],
  ruleId: "exponential_scaled",
  ruleParams: {
    contextKey,
    defaultValue: 0,
    label,
    multiplier,
  },
});

const booleanHitCount = (
  contextKey,
  label,
  baseHitCount,
  options,
) => ({
  inputs: [booleanInput(contextKey, label)],
  ruleId: "boolean_hit_count",
  ruleParams: {
    baseHitCount,
    contextKey,
    label,
    ...options,
  },
});

const thresholdMultiplier = (
  contextKey,
  label,
  threshold,
  multiplier,
  options = {},
) => ({
  inputs: [
    numberInput(
      contextKey,
      label,
      options.min ?? 0,
      options.max,
      options.defaultValue,
    ),
  ],
  ruleId: "threshold_power_multiplier",
  ruleParams: {
    contextKey,
    label,
    multiplier,
    threshold,
    ...options,
  },
});

const thresholdHitCount = (
  contextKey,
  label,
  threshold,
  baseHitCount,
  triggeredHitCount,
  options = {},
) => ({
  inputs: [
    numberInput(
      contextKey,
      label,
      options.min ?? 0,
      options.max,
      options.defaultValue,
    ),
  ],
  ruleId: "threshold_hit_count",
  ruleParams: {
    baseHitCount,
    contextKey,
    label,
    threshold,
    triggeredHitCount,
    ...options,
  },
});

const REVIEWED_EFFECTS = Object.freeze({
  闪击: { ruleId: "speed_difference" },
  鸣沙陷阱: { ruleId: "physical_defense_difference" },
  冰锋横扫: {
    ruleId: "enemy_total_skill_cost_power",
    ruleParams: {
      contextKey: "enemyTotalSkillCost",
      label: "敌方四技能总能耗",
      multiplier: 10,
    },
  },
  愿力冲击: {
    inputs: [
      booleanInput("enemyUsedStatusSkill", "目标本回合使用状态技能"),
    ],
    ruleId: "boolean_power_multiplier",
    ruleParams: {
      contextKey: "enemyUsedStatusSkill",
      label: "目标使用状态技能",
      multiplier: 2.5,
    },
  },
  魔能爆: {
    inputs: [numberInput("energy", "当前能量", 0, 10, 0)],
    ruleId: "mana_burst",
  },

  钢铁洪流: positionAdd([1], 90),
  械斗: positionAdd([1], 60),
  离子震荡: positionAdd([3], 40),
  磁暴: positionAdd([1, 3], 30),

  偷袭: counterMultiplier(3),
  突袭: counterMultiplier(3),
  无影脚: counterMultiplier(2),
  爆冲: counterMultiplier(5),
  技巧打击: counterMultiplier(10),
  闪燃: counterMultiplier(4),
  龙卷风: counterMultiplier(1.5),
  虫击: counterMultiplier(2, { ignoreResistanceWhenTriggered: true }),

  怨力打击: {
    inputs: [numberInput("enemySkillPower", "敌方技能威力", 0)],
    ruleId: "enemy_skill_power_multiplier",
    ruleParams: {
      contextKey: "enemySkillPower",
      label: "敌方技能威力",
      multiplier: 3,
    },
  },
  垂死反击: {
    inputs: [numberInput("attackerHpPercent", "自身生命百分比", 0, 100)],
    ruleId: "hp_scaled",
    ruleParams: {
      changePerInterval: 5,
      contextKey: "attackerHpPercent",
      direction: "increase",
      interval: 5,
      label: "自身生命百分比",
    },
  },
  彗星: {
    inputs: [numberInput("attackerHpPercent", "自身生命百分比", 0, 100)],
    ruleId: "hp_scaled",
    ruleParams: {
      changePerInterval: 10,
      contextKey: "attackerHpPercent",
      direction: "decrease",
      interval: 5,
      label: "自身生命百分比",
    },
  },
  筛管奔流: booleanAdd("attackerHpAbove80", "自身生命高于 80%", 75),

  坟场搏击: {
    inputs: [numberInput("enemyEnergy", "敌方能量", 0, 10)],
    ruleId: "energy_percentage_decrease",
    ruleParams: {
      contextKey: "enemyEnergy",
      label: "敌方能量",
      percentPerEnergy: 0.1,
    },
  },
  碎冰冰: stackAdd("enemyFreezeStacks", "敌方冻结层数", 20),
  极寒领域: booleanAdd("enemyFrozen", "敌方已有冻结", 60),
  牵连: stackAdd("enemyExhaustedCount", "敌方力竭精灵数", 30, 6),
  鸩毒: {
    inputs: [
      numberInput("enemyPoisonStacks", "敌方中毒层数", 0, 20),
      booleanInput("counterTriggered", "触发应对"),
    ],
    ruleId: "stack_plus_counter_add",
    ruleParams: {
      contextKey: "enemyPoisonStacks",
      counterKey: "counterTriggered",
      counterPerStack: 40,
      label: "敌方中毒层数",
      perStack: 10,
    },
  },
  燃尽: {
    inputs: [numberInput("defenderHpPercent", "敌方生命百分比", 0, 100)],
    ruleId: "hp_scaled",
    ruleParams: {
      changePerInterval: 5,
      contextKey: "defenderHpPercent",
      direction: "decrease",
      interval: 5,
      label: "敌方生命百分比",
    },
  },
  多维击打: hitCountGrowth(
    "enemyStarfallMarks",
    "敌方星陨印记",
    1,
    1,
  ),

  超级糖果: booleanAdd("attackerMoeActive", "自身获得萌化", 60),
  幼态延续: booleanAdd("attackerMoeActive", "自身拥有萌化", 60, {
    sproutFixedUnit: true,
  }),
  破罐破摔: booleanAdd("attackerDebuffed", "自身有减益", 60),

  逆袭: {
    inputs: [numberInput("actualSkillCost", "实际能耗", 1, 20)],
    ruleId: "cost_scaled",
    ruleParams: {
      contextKey: "actualSkillCost",
      direction: "increase",
      label: "实际能耗",
      perCost: 50,
    },
  },
  涌泉: {
    inputs: [numberInput("actualSkillCost", "实际能耗", 0, 20)],
    ruleId: "cost_scaled",
    ruleParams: {
      contextKey: "actualSkillCost",
      direction: "decrease",
      label: "实际能耗",
      perCost: 10,
    },
  },
  触底强击: booleanAdd(
    "energyDepletedAfterUse",
    "使用后能量耗尽",
    120,
  ),

  气势一击: booleanAdd("previousCounterSucceeded", "上回合应对成功", 180),
  见招拆招: booleanAdd("previousSkillWasStatus", "上回合使用状态技能", 55),
  当头棒喝: booleanAdd(
    "enemySwitchedThisTurn",
    "敌方本回合换精灵",
    100,
  ),
  草虫冲击: booleanAdd(
    "enemySwitchedThisTurn",
    "敌方本回合换精灵",
    50,
    { ignoreResistanceWhenTriggered: true },
  ),
  天旋地转: booleanAdd("burstTriggered", "触发迸发", 30),
  扇风: {
    inputs: [booleanInput("actedBeforeEnemy", "先于敌方攻击")],
    ruleId: "boolean_power_multiplier",
    ruleParams: {
      contextKey: "actedBeforeEnemy",
      label: "先于敌方攻击",
      multiplier: 1.5,
      rounding: "floor",
    },
  },
  色散: {
    inputs: [
      booleanInput("enemyIsMixedBloodline", "目标为混血精灵"),
    ],
    ruleId: "boolean_damage_multiplier",
    ruleParams: {
      contextKey: "enemyIsMixedBloodline",
      label: "混血精灵伤害加成",
      multiplier: 1.5,
    },
  },
  电弧: booleanAdd("burstTriggered", "触发迸发", 40),
  引雷: (() => {
    const effect = booleanAdd("burstTriggered", "触发迸发", 20);
    return {
      ...effect,
      ruleParams: { ...effect.ruleParams, hitCount: 2 },
    };
  })(),
  雷暴: stackAdd("activeBurstKinds", "已生效迸发种类", 10, 20),

  乘胜追击: hitCountGrowth("skillUseCount", "此前使用次数", 1, 1),
  趁火打劫: hitCountGrowth("defeatedEnemyCount", "此前击败次数", 2, 2, 6),
  孢子爆散: hitCountGrowth("skillUseCount", "此前使用次数", 1, 2),
  叠势: hitCountGrowth("counterSuccessCount", "成功应对次数", 2, 2),
  月光合奏: hitCountGrowth("totalMoeStacks", "双方萌化总层数", 1, 1),
  飞断: booleanAdd("teamDonationActive", "己方队伍获得奉献", 20),
  虫群: hitCountGrowth("donationHitBonus", "奉献增加连击", 1, 1),

  迫近攻击: stackAdd("skillUseCount", "此前使用次数", 45),
  连续爪击: booleanHitCount(
    "counterTriggered",
    "触发应对",
    2,
    { multiplier: 2 },
  ),
  穿膛: thresholdMultiplier(
    "enemyEnergy",
    "敌方能量",
    2,
    5,
    { max: 10, operator: "lte" },
  ),
  能量刃: stackAdd("counterSuccessCount", "成功应对次数", 90),
  埋伏: booleanHitCount(
    "enemySwitchedThisTurn",
    "敌方本回合换精灵",
    3,
    { add: 3 },
  ),
  急中生智: booleanAdd("attackerDebuffed", "自身有减益", 40),
  光能聚集: stackAdd(
    "otherGrassSkillUseCount",
    "其他草系技能使用次数",
    60,
  ),
  甜蜜陷阱: stackAdd(
    "energy",
    "当前能量",
    10,
    SWEET_TRAP_ENERGY_RANGE[1],
  ),
  吹火: stackAdd("skillUseCount", "此前使用次数", 20),
  流星火雨: stackAdd("defeatedEnemyCount", "此前击败次数", 75, 6),
  山火: exponentialGrowth(
    "otherFireSkillUseCount",
    "其他火系技能使用次数",
  ),
  阳火增辉: exponentialGrowth(
    "defeatedEnemyCount",
    "此前击败次数",
    2,
    6,
  ),
  水波术: stackAdd("growthRoundCount", "已成长回合数", 20),
  叠浪: {
    inputs: [numberInput("actualSkillCost", "实际能耗", 0, 3, 3)],
    ruleId: "cost_scaled",
    ruleParams: {
      contextKey: "actualSkillCost",
      direction: "decrease",
      label: "实际能耗",
      perCost: 10,
    },
  },
  过曝: stackAdd("otherTypeCount", "已使用其他系别数", 30, 17),
  透镜实验: booleanAdd(
    "enemyCarriesLightSkill",
    "选择威力分支且敌方携带光系技能",
    50,
  ),
  齿轮扭矩: stackAdd("positionChangeCount", "位置变化次数", 15),
  微型斥候: stackAdd(
    "resistedAttackCount",
    "受到抵抗攻击次数",
    20,
  ),
  地陷: counterMultiplier(2),
  滚雪球: counterMultiplier(2),
  雪原狩猎: {
    inputs: [booleanInput("blizzardWeather", "当前为暴风雪天气")],
    ruleId: "boolean_power_multiplier",
    ruleParams: {
      contextKey: "blizzardWeather",
      label: "暴风雪天气",
      multiplier: 1.5,
    },
  },
  吹炎: counterMultiplier(2),
  绵里藏针: stackAdd(
    "nonAttackPreviousTurnCount",
    "上回合未攻击触发次数",
    20,
  ),
  落雷: stackAdd("entryCount", "此前入场次数", 40),
  过敏原: booleanHitCount(
    "enemyPoisoned",
    "敌方有中毒",
    1,
    { add: 2 },
  ),
  虫群过境: hitCountGrowth(
    "teamDonationCount",
    "己方奉献次数",
    2,
    1,
  ),
  虫鸣: hitCountGrowth(
    "teamBugChantCount",
    "队伍携带虫鸣数量",
    1,
    1,
    6,
    1,
  ),
  散手: booleanHitCount(
    "counterTriggered",
    "触发应对",
    2,
    { triggeredHitCount: 6 },
  ),
  反击拳: booleanHitCount(
    "actedAfterEnemy",
    "后于敌方攻击",
    2,
    { triggeredHitCount: 3 },
  ),
  回旋踢: {
    inputs: [booleanInput("enemySwitchedThisTurn", "敌方本回合换精灵")],
    ruleId: "boolean_power_multiplier",
    ruleParams: {
      contextKey: "enemySwitchedThisTurn",
      label: "敌方本回合换精灵",
      multiplier: 2,
    },
  },
  疾风刺: booleanHitCount(
    "actedBeforeEnemy",
    "先于敌方攻击",
    1,
    { triggeredHitCount: 3 },
  ),
  远行: stackAdd("actedFirstCount", "此前先手次数", 25),
  撒娇: (() => {
    const effect = stackAdd("moeGainCount", "获得萌化次数", 20);
    return {
      ...effect,
      ruleParams: {
        ...effect.ruleParams,
        flatBonusContextKey: "sproutFixedPowerBonus",
      },
    };
  })(),
  拆礼物: booleanAdd("enemyMoeActive", "敌方有萌化", 100),
  背袭: thresholdMultiplier(
    "enemyEnergy",
    "敌方能量",
    0,
    20,
    { max: 10, operator: "eq" },
  ),
  灵光: booleanHitCount(
    "enemySwitchedThisTurn",
    "敌方本回合换精灵",
    3,
    { multiplier: 2 },
  ),
  撕咬: thresholdHitCount(
    "attackerHpPercent",
    "自身生命百分比",
    50,
    3,
    5,
    { defaultValue: 100, max: 100, operator: "lt" },
  ),
  暗突袭: counterMultiplier(2),
  血契: {
    inputs: [
      numberInput(
        "attackerHpPercent",
        "自身生命百分比",
        0,
        100,
        100,
      ),
    ],
    ruleId: "hp_scaled",
    ruleParams: {
      changePerInterval: 10,
      contextKey: "attackerHpPercent",
      defaultValue: 100,
      direction: "increase",
      interval: 10,
      label: "自身生命百分比",
    },
  },
  星痕: booleanAdd("enemyHasMark", "敌方有印记", 40),
  天体吸积: stackAdd("enemyMarkStacks", "敌方印记层数", 20),

  友谊满溢: {
    inputs: [
      choiceInput(
        "friendshipMode",
        "选择效果",
        [
          { label: "威力成长", value: "growth" },
          { label: "应对翻倍", value: "counter" },
        ],
        "growth",
      ),
      numberInput("skillUseCount", "此前使用次数", 0, 20, 0),
      when(
        booleanInput("counterTriggered", "触发应对"),
        "friendshipMode",
        "counter",
        "growth",
      ),
    ],
    ruleId: "friendship_choice",
    ruleParams: {
      choiceKey: "friendshipMode",
      defaultChoice: "growth",
    },
  },
  撒花: {
    inputs: [
      choiceInput(
        "flowerMode",
        "选择效果",
        [
          { label: "生命加威", value: "power" },
          { label: "应对回血", value: "heal" },
        ],
        "power",
      ),
      when(
        numberInput("attackerHpPercent", "自身生命百分比", 0, 100, 100),
        "flowerMode",
        "power",
        "power",
      ),
      when(
        booleanInput("counterTriggered", "触发应对"),
        "flowerMode",
        "heal",
        "power",
      ),
    ],
    ruleId: "flower_choice",
    ruleParams: { choiceKey: "flowerMode", defaultChoice: "power" },
  },
  轮班: {
    inputs: [
      choiceInput(
        "shiftMode",
        "选择效果",
        [
          { label: "1号位加威", value: "power" },
          { label: "额外传动", value: "drive" },
        ],
        "power",
      ),
      when(
        numberInput("skillPosition", "技能位置", 1, 4),
        "shiftMode",
        "power",
        "power",
      ),
    ],
    ruleId: "shift_choice",
    ruleParams: { choiceKey: "shiftMode", defaultChoice: "power" },
  },
  驱赶: {
    inputs: [
      choiceInput(
        "driveOutMode",
        "选择效果",
        [
          { label: "稳定加威", value: "steady" },
          { label: "应对加威", value: "counter" },
        ],
        "steady",
      ),
      when(
        booleanInput("counterTriggered", "触发应对"),
        "driveOutMode",
        "counter",
        "steady",
      ),
    ],
    ruleId: "drive_out_choice",
    ruleParams: {
      choiceKey: "driveOutMode",
      defaultChoice: "steady",
    },
  },
  试飞: {
    inputs: [
      choiceInput(
        "flightMode",
        "选择成长",
        [
          { label: "威力成长", value: "power" },
          { label: "连击成长", value: "hits" },
        ],
        "power",
      ),
      numberInput("skillUseCount", "此前使用次数", 0, 20, 0),
    ],
    ruleId: "test_flight_choice",
    ruleParams: { choiceKey: "flightMode", defaultChoice: "power" },
  },
  灾厄: {
    inputs: [booleanInput("counterTriggered", "触发应对")],
    ruleId: "calamity_target",
  },
  下注: {
    inputs: [
      choiceInput(
        "betMode",
        "选择效果",
        [
          { label: "固定加威", value: "fixed" },
          { label: "低血加威", value: "lowHp" },
        ],
        "fixed",
      ),
      when(
        numberInput("attackerHpPercent", "自身生命百分比", 0, 100, 100),
        "betMode",
        "lowHp",
        "fixed",
      ),
    ],
    ruleId: "bet_choice",
    ruleParams: { choiceKey: "betMode", defaultChoice: "fixed" },
  },
});

function inputsForExplicitRule(ruleId, params = {}) {
  switch (ruleId) {
    case "mana_burst":
      return [numberInput("energy", "当前能量", 0, 10, 0)];
    case "counter_multiplier":
      return [
        booleanInput(
          params.contextKey ?? "counterTriggered",
          params.label ?? "触发应对",
        ),
      ];
    case "hp_scaled":
      return [
        numberInput(
          params.contextKey ?? "currentHpPercent",
          params.label ?? "当前生命百分比",
          0,
          100,
        ),
      ];
    case "energy_scaled":
      return [
        numberInput(
          params.contextKey ?? "energy",
          params.label ?? "当前能量",
          0,
        ),
      ];
    case "stack_scaled":
      return [
        numberInput(
          params.contextKey ?? "stackCount",
          params.label ?? "当前层数",
          0,
        ),
      ];
    default:
      return [];
  }
}

export function getSkillEffectRule(skill) {
  if (!skill) return null;
  if (skill.ruleId) {
    return {
      inputs:
        REVIEWED_EFFECTS[skill.name]?.inputs ??
        inputsForExplicitRule(skill.ruleId, skill.ruleParams),
      ruleId: skill.ruleId,
      ruleParams: {
        ...(REVIEWED_EFFECTS[skill.name]?.ruleParams ?? {}),
        ...(skill.ruleParams ?? {}),
      },
      source: skill.provenance?.ruleId ?? "snapshot-rule",
    };
  }
  const reviewed = REVIEWED_EFFECTS[skill.name];
  if (!reviewed) return null;
  return {
    ...reviewed,
    inputs: reviewed.inputs ?? [],
    ruleParams: reviewed.ruleParams ?? {},
    source: "reviewed-rule:rock-calculator-and-bwiki-2026-07-24",
  };
}

export function getSkillEffectInputs(skill) {
  return normalizeTriggerControls(getSkillEffectRule(skill)?.inputs ?? [], {
    source: "skill",
  });
}

export function getDefaultHitCount(skill) {
  const reviewedHitCount = getSkillEffectRule(skill)?.ruleParams?.hitCount;
  if (Number.isInteger(reviewedHitCount) && reviewedHitCount > 0) {
    return reviewedHitCount;
  }
  const match = String(skill?.description ?? "").match(/(\d+)\s*连击/u);
  return match ? Math.max(1, Number(match[1])) : 1;
}

export function hasDeclaredHitCount(skill) {
  return /(\d+)\s*连击/u.test(String(skill?.description ?? ""));
}
import { normalizeTriggerControls } from "./trigger-controls.js";
