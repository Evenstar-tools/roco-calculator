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
  力量增效: { ownAttack: 10 },
  魔法增效: { ownAttack: 7 },
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
  三连破: { ownAttack: 3 },
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
  花炮: { ownAttack: 12 },
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
  钧势: { ownDefense: 14 },
  不动如山: {
    inputs: [booleanInput("defenseCounterSucceeded", "防御应对成功")],
    ownAttack: 5,
    requiresCounter: true,
  },
  沙石阵: { ownDefense: 9 },
  霜冻: { targetDefense: -10 },
  龙吟: { ownAttack: 15 },
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
  嘲弄: { ownAttack: 9 },
  虚化: {
    inputs: [booleanInput("defenseCounterSucceeded", "防御应对成功")],
    ownDefense: 7,
    requiresCounter: true,
  },
  魔镜: { targetDefense: -5 },
});

function stageDeltas(effect, multiplier, context) {
  const conditional = effect.conditional;
  return {
    ownAttack:
      Number(effect.ownAttack ?? 0) +
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
  };
}

export function getSkillStatusEffect(skill) {
  return STATUS_EFFECTS[skill?.name] ?? null;
}

export function getSkillStatusEffectInputs(skill) {
  return getSkillStatusEffect(skill)?.inputs ?? [];
}

export function resolveSkillStatusActivation(skill, context = {}) {
  const effect = getSkillStatusEffect(skill);
  if (!effect) return null;

  if (
    effect.requiresCounter &&
    context.defenseCounterSucceeded !== true
  ) {
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

  const deltas = stageDeltas(effect, multiplier, context);
  const applied = Object.values(deltas).some((value) => value !== 0);
  return {
    applied,
    deltas,
    reason: applied ? null : "该技能当前没有可应用的能力等级变化",
  };
}
