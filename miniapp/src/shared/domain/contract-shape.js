import { hasDeclaredHitCount } from "./skill-effects.js";

export const CONTRACT_SHAPE_TRAIT_NAME = "契约的形状";

export const CONTRACT_BALLS = Object.freeze([
  { value: "normal", label: "普通球", summary: "攻防速 +5%" },
  { value: "advanced", label: "高级球", summary: "攻防速 +10%" },
  { value: "king", label: "国王球", summary: "攻防速 +15%" },
  { value: "beautiful", label: "美妙球", summary: "对方双攻 -30% · 威力 +20" },
  { value: "temperature", label: "调温球", summary: "对方灼烧 ×4 · 冻结 ×1" },
  { value: "photosynthesis", label: "光合球", summary: "回复 9% · 魔攻 +40%" },
  { value: "net", label: "网兜球", summary: "能耗 -1 · 连击 +1" },
  { value: "insulation", label: "绝缘球", summary: "速度 +50 · 对方中毒 ×1" },
  { value: "sand", label: "淘沙球", summary: "对方速度 -40 · 物防 -40% · 连击 +2" },
  { value: "transform", label: "变幻球", summary: "双防 +30% · 对方星陨 ×1" },
  { value: "darkstar", label: "暗星球", summary: "吸血 +30% · 对方能量 -1" },
  { value: "combat", label: "好战球", summary: "物攻 +40% · 对方魔防 -40%" },
  { value: "capture", label: "捕光球", summary: "无效果" },
  { value: "prism", label: "棱镜球", summary: "指定随机球效果 · 数值减半" },
]);

const BALLS_BY_VALUE = new Map(
  CONTRACT_BALLS.map((entry) => [entry.value, entry]),
);

const categories = (physical = 0, magical = 0) => ({ physical, magical });

function emptyResolution() {
  return {
    active: false,
    ballType: null,
    effectiveBallType: null,
    label: null,
    scale: 1,
    attackLevelBonusByCategory: categories(),
    defenseLevelBonusByCategory: categories(),
    targetAttackLevelBonusByCategory: categories(),
    targetDefenseLevelBonusByCategory: categories(),
    ownerSpeedMultiplier: 1,
    ownerSpeedFlat: 0,
    ownerHealingPercent: 0,
    ownerSkillCostAdd: 0,
    ownerLifestealPercent: 0,
    targetSpeedFlat: 0,
    fixedPowerAdd: 0,
    hitCountAdd: 0,
    targetHitCountAdd: 0,
    targetPoisonStacksAdd: 0,
    targetStarfallStacksAdd: 0,
    targetEnergyAdd: 0,
    targetBurnRoundsAdd: 0,
    targetFreezeRoundsAdd: 0,
    settlement: null,
  };
}

function scaledDiscrete(value, scale) {
  return Math.trunc(value * scale);
}

function settlement({ ballType, effectiveEntry, ownerRole, status, text }) {
  const prismPrefix = ballType === "prism"
    ? `棱镜球（${effectiveEntry.label}半值）`
    : effectiveEntry.label;
  return {
    ballType,
    effectiveBallType: effectiveEntry.value,
    side: ownerRole,
    status: status ?? "applied",
    text: text ?? `${prismPrefix}｜${effectiveEntry.summary}`,
  };
}

export function isContractBall(value) {
  return BALLS_BY_VALUE.has(value);
}

export function resolveContractShape({
  ballType = null,
  prismEffect = null,
  ownerRole = "attacker",
  skill = null,
} = {}) {
  const selectedEntry = BALLS_BY_VALUE.get(ballType);
  const effectiveBallType = ballType === "prism" ? prismEffect : ballType;
  const effectiveEntry = BALLS_BY_VALUE.get(effectiveBallType);
  if (
    !skill ||
    !selectedEntry ||
    !effectiveEntry ||
    effectiveEntry.value === "prism"
  ) {
    return emptyResolution();
  }

  const scale = ballType === "prism" ? 0.5 : 1;
  const prefix = ballType === "prism"
    ? `棱镜球（${effectiveEntry.label}半值）`
    : effectiveEntry.label;
  const result = {
    ...emptyResolution(),
    active: true,
    ballType,
    effectiveBallType,
    label: selectedEntry.label,
    scale,
    settlement: settlement({ ballType, effectiveEntry, ownerRole }),
  };

  switch (effectiveBallType) {
    case "normal":
    case "advanced":
    case "king": {
      const level =
        { normal: 0.5, advanced: 1, king: 1.5 }[effectiveBallType] * scale;
      result.attackLevelBonusByCategory = categories(level, level);
      result.defenseLevelBonusByCategory = categories(level, level);
      result.ownerSpeedMultiplier = 1 + level / 10;
      result.settlement = settlement({
        ballType,
        effectiveEntry,
        ownerRole,
        text: `${prefix}｜攻防速 +${level * 10}%`,
      });
      break;
    }
    case "beautiful":
      result.targetAttackLevelBonusByCategory = categories(-3 * scale, -3 * scale);
      result.fixedPowerAdd = 20 * scale;
      result.settlement = settlement({
        ballType,
        effectiveEntry,
        ownerRole,
        text: `${prefix}｜对方双攻 -${30 * scale}% · 威力 +${20 * scale}`,
      });
      break;
    case "temperature":
      result.targetBurnRoundsAdd = scaledDiscrete(4, scale);
      result.targetFreezeRoundsAdd = scaledDiscrete(1, scale);
      result.settlement = settlement({
        ballType,
        effectiveEntry,
        ownerRole,
        status: "recorded",
        text: `${prefix}｜对方灼烧 ×${result.targetBurnRoundsAdd}、冻结 ×${result.targetFreezeRoundsAdd} · 本次伤害不追加`,
      });
      break;
    case "photosynthesis":
      result.attackLevelBonusByCategory = categories(0, 4 * scale);
      result.ownerHealingPercent = 9 * scale;
      result.settlement = settlement({
        ballType,
        effectiveEntry,
        ownerRole,
        text: `${prefix}｜回复 ${9 * scale}% · 魔攻 +${40 * scale}%`,
      });
      break;
    case "net":
      result.ownerSkillCostAdd = -scaledDiscrete(1, scale) || 0;
      result.hitCountAdd = hasDeclaredHitCount(skill)
        ? scaledDiscrete(1, scale)
        : 0;
      result.settlement = settlement({
        ballType,
        effectiveEntry,
        ownerRole,
        text: `${prefix}｜能耗 ${result.ownerSkillCostAdd} · 连击 +${result.hitCountAdd}${scale < 1 ? " · 离散值向零取整" : ""}`,
      });
      break;
    case "insulation":
      result.ownerSpeedFlat = 50 * scale;
      result.targetPoisonStacksAdd = scaledDiscrete(1, scale);
      result.settlement = settlement({
        ballType,
        effectiveEntry,
        ownerRole,
        text: `${prefix}｜速度 +${50 * scale} · 对方中毒 ×${result.targetPoisonStacksAdd}`,
      });
      break;
    case "sand":
      result.targetSpeedFlat = -40 * scale;
      result.targetDefenseLevelBonusByCategory = categories(-4 * scale, 0);
      result.hitCountAdd = hasDeclaredHitCount(skill)
        ? scaledDiscrete(2, scale)
        : 0;
      result.settlement = settlement({
        ballType,
        effectiveEntry,
        ownerRole,
        text: `${prefix}｜对方速度 -${40 * scale} · 物防 -${40 * scale}% · 连击 +${result.hitCountAdd}`,
      });
      break;
    case "transform":
      result.defenseLevelBonusByCategory = categories(3 * scale, 3 * scale);
      result.targetStarfallStacksAdd = scaledDiscrete(1, scale);
      result.settlement = settlement({
        ballType,
        effectiveEntry,
        ownerRole,
        text: `${prefix}｜双防 +${30 * scale}% · 对方星陨 ×${result.targetStarfallStacksAdd}${scale < 1 ? " · 离散值向零取整" : ""}`,
      });
      break;
    case "darkstar":
      result.ownerLifestealPercent = 30 * scale;
      result.targetEnergyAdd = -scaledDiscrete(1, scale) || 0;
      result.settlement = settlement({
        ballType,
        effectiveEntry,
        ownerRole,
        status: "recorded",
        text: `${prefix}｜吸血 +${30 * scale}% · 对方能量 ${result.targetEnergyAdd} · 仅记录`,
      });
      break;
    case "combat":
      result.attackLevelBonusByCategory = categories(4 * scale, 0);
      result.targetDefenseLevelBonusByCategory = categories(0, -4 * scale);
      result.settlement = settlement({
        ballType,
        effectiveEntry,
        ownerRole,
        text: `${prefix}｜物攻 +${40 * scale}% · 对方魔防 -${40 * scale}%`,
      });
      break;
    case "capture":
      result.settlement = settlement({
        ballType,
        effectiveEntry,
        ownerRole,
        status: "recorded",
        text: `${prefix}｜无效果`,
      });
      break;
    default:
      return emptyResolution();
  }

  return result;
}
