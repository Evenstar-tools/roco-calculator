import { resolveRefractionEffects } from "./refraction.js";
import {
  normalizeTriggerControls,
  projectTriggerContext,
} from "./trigger-controls.js";
import { resolveSkillMarkApplications } from "./marks.js";

const booleanInput = (key, label) => ({
  defaultValue: false,
  key,
  label,
  type: "boolean",
});

const numberInput = (key, label, min, max, defaultValue) => ({
  defaultValue,
  key,
  label,
  max,
  min,
  type: "number",
});

const STATUS_EFFECTS = Object.freeze({
  热身运动: { ownHitCountAdd: 3 },
  芳香诱引: { ownHitCountAdd: 2 },
  羽翼庇护: {
    inputs: [booleanInput("counterAttackSucceeded", "应对攻击成功")],
    resolve(context) {
      return {
        ownHitCountAdd: context.counterAttackSucceeded === true ? 2 : 0,
      };
    },
  },
  力量增效: { ownAttack: 10 },
  魔法增效: { ownAttack: 7 },
  快速移动: {
    inputs: [booleanInput("counterDefenseSucceeded", "应对防御成功")],
    resolve(context) {
      return {
        ownSpeedFlat: context.counterDefenseSucceeded === true ? 160 : 80,
      };
    },
  },
  咆哮: { targetAttack: -6 },
  锐利眼神: { targetDefense: -12 },
  预备势: {
    conditional: {
      key: "counterDefenseSucceeded",
      targetDefense: -8,
    },
    inputs: [booleanInput("counterDefenseSucceeded", "应对防御成功")],
    ownAttack: 8,
  },
  防反: {
    inputs: [booleanInput("defenseCounterSucceeded", "防御应对成功")],
    ownAttack: 7,
    requiresCounter: true,
  },
  加固: { ownDefense: 14 },
  鼓劲: { ownDefense: 17 },
  三连破: { defaultHitCount: 3, ownAttackPerHit: 3 },
  嗜痛: {
    inputs: [
      booleanInput("defenseCounterSucceeded", "防御应对成功"),
      numberInput("incomingHitCount", "本次承受攻击次数", 0, 20, 0),
    ],
    ownAttackPerStack: 4,
    requiresCounter: true,
    stackKey: "incomingHitCount",
  },
  缓一缓: { ownAttack: 1, ownDefense: 1 },
  氧输送: { ownAttack: 7 },
  丰饶: { ownAttack: 14 },
  花炮: { defaultHitCount: 2, ownAttackPerHit: 6 },
  纤维化: {
    inputs: [booleanInput("defenseCounterSucceeded", "防御应对成功")],
    ownDefense: 7,
    requiresCounter: true,
  },
  怒火: { ownAttack: 12, ownDefense: -4 },
  润泽: { ownAttack: 19 },
  水泡盾: {
    inputs: [booleanInput("defenseCounterSucceeded", "防御应对成功")],
    ownAttack: 7,
    requiresCounter: true,
  },
  伺机而动: { ownFixedPower: 70 },
  淬火: {
    inputs: [booleanInput("defenseCounterSucceeded", "防御应对成功")],
    operations(context) {
      return {
        powerPercentForAllAttacks:
          context.defenseCounterSucceeded === true ? 1 : 0,
      };
    },
  },
  暖气: {
    inputs: [booleanInput("defenseCounterSucceeded", "防御应对成功")],
    ownFixedPower: 50,
    requiresCounter: true,
  },
  流沙: {
    conditional: {
      key: "counterDefenseSucceeded",
      targetDefense: -6,
    },
    inputs: [booleanInput("counterDefenseSucceeded", "应对防御成功")],
  },
  刺盾: {
    inputs: [booleanInput("defenseCounterSucceeded", "防御应对成功")],
    requiresCounter: true,
    targetAttack: -7,
  },
  钧势: { ownDefense: 14, ownSpeedFlat: -30 },
  不动如山: {
    inputs: [booleanInput("defenseCounterSucceeded", "防御应对成功")],
    ownAttack: 5,
    requiresCounter: true,
  },
  沙石阵: {
    resolve(context) {
      return {
        ownDefense: context.choiceTrait ? 18 : 9,
        ownSpeedFlat: -20,
      };
    },
  },
  霜冻: { targetDefense: -10 },
  龙吟: { ownAttack: 15, ownSpeedFlat: 80 },
  麻痹: {
    conditional: {
      key: "counterDefenseSucceeded",
      targetAttack: -7,
    },
    inputs: [booleanInput("counterDefenseSucceeded", "应对防御成功")],
  },
  电离爆破: { targetAttack: -2 },
  破绽: {
    conditional: {
      key: "counterDefenseSucceeded",
      ownAttack: 7,
    },
    inputs: [booleanInput("counterDefenseSucceeded", "应对防御成功")],
    targetDefense: -7,
  },
  破防: { targetDefense: -7 },
  气沉丹田: { ownAttack: 13 },
  耍赖: { ownAttack: 1 },
  嘲弄: {
    inputs: [booleanInput("enemySwitchedThisTurn", "敌方本回合更换精灵")],
    resolve(context) {
      return {
        ownAttack: 9,
        ownSpeedFlat: context.enemySwitchedThisTurn === true ? 70 : 0,
      };
    },
  },
  虚化: {
    inputs: [booleanInput("defenseCounterSucceeded", "防御应对成功")],
    ownDefense: 7,
    requiresCounter: true,
  },
  魔镜: { targetDefense: -5 },
  野火: {
    inputs: [
      booleanInput(
        "applyDefenseReduction",
        "选择物防-90%（不勾为灼烧7层）",
      ),
    ],
    operations() {
      return { appliedNonDamageStatus: true };
    },
    resolve(context) {
      const selected = context.applyDefenseReduction === true;
      const multiplier =
        context.choiceTrait === "一意孤行"
          ? selected ? 2 : 0
          : context.choiceTrait === "有求必应"
            ? 1
            : selected ? 1 : 0;
      return { targetDefense: -9 * multiplier };
    },
  },
  蒸汽进行曲: {
    inputs: [
      booleanInput("applySpeedBoost", "速度+60"),
      booleanInput("applyAttackBoost", "物攻+90%"),
    ],
    resolve(context) {
      let speedMultiplier = context.applySpeedBoost === true ? 1 : 0;
      let attackMultiplier = context.applyAttackBoost === true ? 1 : 0;
      if (context.choiceTrait === "有求必应") {
        if (speedMultiplier > 0 || attackMultiplier > 0) {
          speedMultiplier = 1;
          attackMultiplier = 1;
        }
      } else if (context.choiceTrait === "一意孤行") {
        speedMultiplier *= 2;
        attackMultiplier *= 2;
      }
      return {
        ownAttack: attackMultiplier * 9,
        ownSpeedFlat: speedMultiplier * 60,
      };
    },
  },
  焚尽: {
    inputs: [numberInput("dispelledMarkStacks", "驱散印记层数", 0, 99, 0)],
    resolve(context) {
      const stacks = integerInput(context.dispelledMarkStacks, 0, 99);
      return { ownAttack: stacks * 5 };
    },
  },
  焚毁: {
    inputs: [numberInput("dispelledMarkStacks", "驱散印记层数", 0, 99, 0)],
    resolve(context) {
      const stacks = integerInput(context.dispelledMarkStacks, 0, 99);
      return { ownAttack: stacks * 2 };
    },
  },
  啮合传递: {
    inputs: [numberInput("skillSlot", "技能栏位", 1, 4, 1)],
    resolve(context) {
      const slot = integerInput(context.skillSlot, 1, 4, 1);
      return {
        ownAttack: slot === 1 || slot === 3 ? 8 : 0,
        ownSpeedFlat: 30,
      };
    },
  },
  泥浆铠甲: {
    inputs: [booleanInput("defenseCounterSucceeded", "防御应对成功")],
    operations(context) {
      return {
        doublePositiveOwnBuffs: context.defenseCounterSucceeded === true,
      };
    },
    ownAttack: 6,
    ownDefense: 6,
  },
  石肤术: {
    inputs: [
      booleanInput("applyDefenseRise", "物防+160%"),
      booleanInput("applyDefenseDrop", "魔防-60%"),
    ],
    resolve(context) {
      return {
        ownDefense:
          (context.applyDefenseRise === true ? 16 : 0) +
          (context.applyDefenseDrop === true ? -6 : 0),
      };
    },
  },
  以毒攻毒: {
    inputs: [numberInput("poisonStacks", "中毒层数", 0, 99, 0)],
    resolve(context) {
      return {
        ownAttack: integerInput(context.poisonStacks, 0, 99) * 3,
      };
    },
  },
  腐化: {
    inputs: [numberInput("poisonStacks", "中毒层数", 0, 99, 0)],
    resolve(context) {
      return {
        targetAttack: integerInput(context.poisonStacks, 0, 99) * -3,
      };
    },
  },
  贮藏: {
    inputs: [numberInput("zeroCostSkillCount", "0能耗技能数量", 0, 4, 0)],
    resolve(context) {
      return {
        ownAttack:
          5 + integerInput(context.zeroCostSkillCount, 0, 4) * 5,
      };
    },
  },
  马步: {
    inputs: [
      booleanInput("applyAttackBoost", "选择物攻+150%"),
      numberInput("attackerHpPercent", "自身生命百分比", 0, 100, 100),
    ],
    resolve(context) {
      const selected = context.applyAttackBoost === true;
      const multiplier =
        context.choiceTrait === "有求必应"
          ? 1
          : context.choiceTrait === "一意孤行"
            ? selected ? 2 : 0
            : selected ? 1 : 0;
      return {
        ownAttack:
          multiplier > 0 && Number(context.attackerHpPercent) > 80
            ? 15 * multiplier
            : 0,
      };
    },
  },
  暗箱操作: {
    inputs: [booleanInput("defenseCounterSucceeded", "防御应对成功")],
    resolve(context) {
      return context.defenseCounterSucceeded === true
        ? { targetAttack: -10, targetDefense: -10 }
        : { ownAttack: -10, ownDefense: -10 };
    },
  },
  盛开: {
    inputs: [booleanInput("counterDefenseSucceeded", "应对防御成功")],
    resolve(context) {
      return {
        ownFixedPower: context.counterDefenseSucceeded === true ? 60 : 30,
      };
    },
  },
  漫反射: {
    operations() {
      return { fixedPowerOncePerType: 35 };
    },
  },
  放晴: {
    inputs: [booleanInput("counterDefenseSucceeded", "应对防御成功")],
    operations(context) {
      const sproutBonus = integerInput(context.sproutStacks, 0, 99, 0) * 0.1;
      return {
        powerPercentForType:
          (context.counterDefenseSucceeded === true ? 1 : 0.5) + sproutBonus,
        powerPercentType: "光",
      };
    },
  },
  点亮: {
    inputs: [booleanInput("defenseCounterSucceeded", "防御应对成功")],
    operations(context) {
      return {
        powerPercentForType:
          0.5 + integerInput(context.sproutStacks, 0, 99, 0) * 0.1,
        powerPercentType: "光",
      };
    },
    requiresCounter: true,
  },
  暴风眼: {
    operations(context) {
      return {
        hitCountPercentForAllAttacks:
          1 + integerInput(context.sproutStacks, 0, 99, 0),
      };
    },
  },
  化劲: { ownFixedPower: 40 },
  提气: {
    inputs: [booleanInput("enemySwitched", "敌方本回合更换精灵")],
    resolve(context) {
      return { ownFixedPower: 40 + (context.enemySwitched === true ? 50 : 0) };
    },
  },
  防御反击: {
    inputs: [booleanInput("defenseCounterSucceeded", "防御应对成功")],
    ownFixedPower: 40,
    requiresCounter: true,
  },
  力量吞噬: { ownFixedPower: 20, targetFixedPower: -20 },
  羽化加速: { ownFixedPower: 20 },
  超声波: {
    inputs: [booleanInput("defenseCounterSucceeded", "防御应对成功")],
    resolve(context) {
      const first = context.defenseCounterSucceeded === true ? 50 : 30;
      return {
        ownFixedPower: first + (context.choiceTrait ? 30 : 0),
      };
    },
  },
  乘风: { ownSpeedFlat: 120 },
  示弱: { ownSpeedFlat: 150 },
  地陷: {
    inputs: [booleanInput("counterTriggered", "触发应对状态")],
    resolve(context) {
      return { ownDefense: context.counterTriggered === true ? 14 : 7 };
    },
  },
  砂石冲撞: {
    inputs: [booleanInput("enemySwitchedThisTurn", "敌方本回合更换精灵")],
    resolve(context) {
      return {
        ownDefense: context.enemySwitchedThisTurn === true ? 10 : 0,
      };
    },
  },
  崩拳: {
    inputs: [booleanInput("counterTriggered", "触发应对状态")],
    resolve(context) {
      return { ownAttack: context.counterTriggered === true ? 10 : 0 };
    },
  },
  超导加速: { ownSpeedFlat: 30 },
  坍缩: {
    inputs: [booleanInput("defeatedEnemy", "本次击败敌方")],
    resolve(context) {
      return { ownAttack: context.defeatedEnemy === true ? 7 : 0 };
    },
  },
  跌落: {
    inputs: [booleanInput("counterTriggered", "触发应对状态")],
    resolve(context) {
      return { ownAttack: context.counterTriggered === true ? 5 : -5 };
    },
  },
});

function integerInput(value, min, max, fallback = 0) {
  const numeric = Number(value);
  const normalized = Number.isFinite(numeric) ? Math.floor(numeric) : fallback;
  return Math.min(max, Math.max(min, normalized));
}

function normalizeDeltas(deltas = {}) {
  const number = (value) => {
    const normalized = Number(value ?? 0);
    return normalized === 0 ? 0 : normalized;
  };
  return {
    ownAttack: number(deltas.ownAttack),
    ownDefense: number(deltas.ownDefense),
    ownFixedPower: number(deltas.ownFixedPower),
    ownHitCountAdd: number(deltas.ownHitCountAdd),
    ownSpeedFlat: number(deltas.ownSpeedFlat),
    targetAttack: number(deltas.targetAttack),
    targetDefense: number(deltas.targetDefense),
    targetFixedPower: number(deltas.targetFixedPower),
    targetHitCountAdd: number(deltas.targetHitCountAdd),
    targetSpeedFlat: number(deltas.targetSpeedFlat),
  };
}

const SPROUT_POSITIVE_STEPS = Object.freeze({
  ownAttack: 1,
  ownDefense: 1,
  ownFixedPower: 10,
  ownHitCountAdd: 1,
  ownSpeedFlat: 10,
});

function applySproutToPositiveDeltas(deltas, sproutStacks) {
  const stacks = integerInput(sproutStacks, 0, 99, 0);
  if (stacks === 0) return deltas;
  return Object.fromEntries(
    Object.entries(deltas).map(([key, value]) => [
      key,
      value > 0 && SPROUT_POSITIVE_STEPS[key]
        ? value + SPROUT_POSITIVE_STEPS[key] * stacks
        : value,
    ]),
  );
}

function stageDeltas(effect, multiplier, context) {
  const conditional = effect.conditional;
  const effectiveHitCount = Math.max(
    1,
    Math.floor(
      Number(context.effectiveHitCount) ||
        Number(effect.defaultHitCount) ||
        1,
    ),
  );
  return {
    ownAttack:
      Number(effect.ownAttack ?? 0) +
      Number(effect.ownAttackPerHit ?? 0) * effectiveHitCount +
      Number(effect.ownAttackPerStack ?? 0) * multiplier +
      (conditional && context[conditional.key] === true
        ? Number(conditional.ownAttack ?? 0)
        : 0),
    ownDefense:
      Number(effect.ownDefense ?? 0) +
      Number(effect.ownDefensePerStack ?? 0) * multiplier +
      (conditional && context[conditional.key] === true
        ? Number(conditional.ownDefense ?? 0)
        : 0),
    ownFixedPower:
      Number(effect.ownFixedPower ?? 0) +
      (conditional && context[conditional.key] === true
        ? Number(conditional.ownFixedPower ?? 0)
        : 0),
    ownHitCountAdd:
      Number(effect.ownHitCountAdd ?? 0) +
      (conditional && context[conditional.key] === true
        ? Number(conditional.ownHitCountAdd ?? 0)
        : 0),
    ownSpeedFlat:
      Number(effect.ownSpeedFlat ?? 0) +
      (conditional && context[conditional.key] === true
        ? Number(conditional.ownSpeedFlat ?? 0)
        : 0),
    targetAttack:
      Number(effect.targetAttack ?? 0) +
      (conditional && context[conditional.key] === true
        ? Number(conditional.targetAttack ?? 0)
        : 0),
    targetDefense:
      Number(effect.targetDefense ?? 0) +
      (conditional && context[conditional.key] === true
        ? Number(conditional.targetDefense ?? 0)
        : 0),
    targetFixedPower:
      Number(effect.targetFixedPower ?? 0) +
      (conditional && context[conditional.key] === true
        ? Number(conditional.targetFixedPower ?? 0)
        : 0),
  };
}

export function getSkillStatusEffect(skill) {
  return STATUS_EFFECTS[skill?.name] ?? null;
}

export function getSkillStatusEffectInputs(skill) {
  return normalizeTriggerControls(getSkillStatusEffect(skill)?.inputs ?? [], {
    source: "skill",
  });
}

export function getDefenseSkillReductionPercent(skill) {
  if (skill?.category !== "defense") return null;
  const match = String(skill.description ?? "").match(
    /减伤\s*(\d+(?:\.\d+)?)\s*[%％]/,
  );
  if (!match) return null;
  return Math.min(100, Math.max(0, Number(match[1])));
}

export function resolveSkillStatusActivation(skill, context = {}) {
  const refraction = resolveRefractionEffects({
    carriedSkills: context.carriedSkills,
    selectedSkill: skill,
    sproutStacks: context.sproutStacks,
  });
  if (refraction) {
    return {
      applied: refraction.types.length > 0,
      deltas: normalizeDeltas(refraction.deltas),
      operations: refraction.operations,
      reason: refraction.types.length > 0
        ? null
        : "请再携带至少一个其他系别技能",
    };
  }
  const effect = getSkillStatusEffect(skill);
  const defenseReductionPercent = getDefenseSkillReductionPercent(skill);
  const markApplications = resolveSkillMarkApplications(skill);
  if (
    !effect &&
    defenseReductionPercent === null &&
    markApplications.length === 0
  ) return null;
  if (!effect) {
    const applied = defenseReductionPercent > 0 || markApplications.length > 0;
    return {
      applied,
      deltas: normalizeDeltas({}),
      operations: {
        ...(defenseReductionPercent === null ? {} : { defenseReductionPercent }),
        ...(markApplications.length > 0 ? { markApplications } : {}),
      },
      reason:
        applied
          ? null
          : "该防御技能没有可应用的减伤数值",
    };
  }
  context = projectTriggerContext(
    context,
    getSkillStatusEffectInputs(skill),
  );

  if (
    effect.requiresCounter &&
    context.defenseCounterSucceeded !== true
  ) {
    if (defenseReductionPercent !== null) {
      return {
        applied: defenseReductionPercent > 0,
        deltas: normalizeDeltas({}),
        operations: { defenseReductionPercent },
        reason: null,
      };
    }
    return {
      applied: false,
      reason: "请先勾选防御应对成功",
    };
  }

  const multiplier = effect.stackKey
    ? Math.max(0, Math.floor(Number(context[effect.stackKey]) || 0))
    : 1;
  if (effect.stackKey && multiplier === 0) {
    return {
      applied: false,
      reason: "请先填写本次触发层数",
    };
  }

  const deltas = applySproutToPositiveDeltas(
    normalizeDeltas(
      typeof effect.resolve === "function"
        ? effect.resolve(context)
        : stageDeltas(effect, multiplier, context),
    ),
    context.sproutStacks,
  );
  const operations =
    typeof effect.operations === "function" ? effect.operations(context) : {};
  if (defenseReductionPercent !== null) {
    operations.defenseReductionPercent = defenseReductionPercent;
  }
  if (markApplications.length > 0) {
    operations.markApplications = markApplications;
  }
  const applied =
    Object.values(deltas).some((value) => value !== 0) ||
    markApplications.length > 0 ||
    Object.values(operations).some(
      (value) => value === true || (Number.isFinite(Number(value)) && Number(value) !== 0),
    );
  return {
    applied,
    deltas,
    operations,
    reason:
      applied
        ? null
        : skill?.name === "马步" && context.applyAttackBoost === true
          ? "自身生命需高于80%"
          : "该技能当前没有可应用的能力或威力变化",
  };
}
