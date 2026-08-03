import { hasDeclaredHitCount } from "./skill-effects.js";

export const BEAST_FLOWER_TRAIT_NAME = "稀兽花宝";

export const BEAST_FLOWER_BLOODLINES = Object.freeze([
  { value: "normal", label: "普通", summary: "技能威力 +40" },
  { value: "grass", label: "草", summary: "回复 20% 生命" },
  { value: "fire", label: "火", summary: "对方灼烧 ×6" },
  { value: "water", label: "水", summary: "技能能耗 -2" },
  { value: "light", label: "光", summary: "魔攻能力等级 +8" },
  { value: "earth", label: "地", summary: "对方速度 -60 · 连击 -3" },
  { value: "ice", label: "冰", summary: "对方冻结 ×2" },
  { value: "dragon", label: "龙", summary: "对方魔防能力等级 -8" },
  { value: "electric", label: "电", summary: "速度 +100" },
  { value: "poison", label: "毒", summary: "对方中毒 ×2" },
  { value: "bug", label: "虫", summary: "对方物防能力等级 -8" },
  { value: "martial", label: "武", summary: "物攻能力等级 +8" },
  { value: "wing", label: "翼", summary: "连击 +3" },
  { value: "cute", label: "萌", summary: "对方双攻能力等级 -6" },
  { value: "ghost", label: "幽", summary: "对方能量 -2" },
  { value: "evil", label: "恶", summary: "吸血 +50%" },
  { value: "machine", label: "机械", summary: "双防能力等级 +6" },
  { value: "illusion", label: "幻", summary: "对方星陨 ×2" },
]);

const BLOODLINES_BY_VALUE = new Map(
  BEAST_FLOWER_BLOODLINES.map((entry) => [entry.value, entry]),
);

function categories(physical = 0, magical = 0) {
  return { physical, magical };
}

function emptyResolution() {
  return {
    active: false,
    bloodlineType: null,
    label: null,
    attackLevelBonusByCategory: categories(),
    defenseLevelBonusByCategory: categories(),
    targetAttackLevelBonusByCategory: categories(),
    targetDefenseLevelBonusByCategory: categories(),
    ownerSpeedFlat: 0,
    targetSpeedFlat: 0,
    fixedPowerAdd: 0,
    hitCountAdd: 0,
    targetHitCountAdd: 0,
    targetStarfallStacksAdd: 0,
    settlement: null,
  };
}

function settlement(entry, ownerRole, status = "applied", text = null) {
  const bloodlineLabel = entry.value === "normal"
    ? "普通血脉"
    : `${entry.label}系血脉`;
  return {
    bloodlineType: entry.value,
    side: ownerRole,
    status,
    text: text ?? `${bloodlineLabel}｜${entry.summary}`,
  };
}

export function isBeastFlowerBloodline(value) {
  return BLOODLINES_BY_VALUE.has(value);
}

export function resolveBeastFlowerBloodline({
  activated = false,
  bloodlineType = null,
  ownerRole = "attacker",
  skill = null,
} = {}) {
  const entry = BLOODLINES_BY_VALUE.get(bloodlineType);
  if (!activated || !entry || !skill) return emptyResolution();

  const result = {
    ...emptyResolution(),
    active: true,
    bloodlineType,
    label: entry.label,
    settlement: settlement(entry, ownerRole),
  };

  switch (bloodlineType) {
    case "normal":
      result.fixedPowerAdd = 40;
      break;
    case "grass":
      result.settlement = settlement(
        entry,
        ownerRole,
        "recorded",
        "草系血脉｜回复 20% 生命 · 不自动改写当前生命",
      );
      break;
    case "fire":
      result.settlement = settlement(
        entry,
        ownerRole,
        "recorded",
        "火系血脉｜灼烧 ×6 · 本次伤害不追加",
      );
      break;
    case "water":
      result.settlement = settlement(
        entry,
        ownerRole,
        "recorded",
        "水系血脉｜技能能耗 -2 · 本次伤害不变",
      );
      break;
    case "light":
      result.attackLevelBonusByCategory = categories(0, 8);
      break;
    case "earth":
      result.targetSpeedFlat = -60;
      result.targetHitCountAdd = hasDeclaredHitCount(skill) ? -3 : 0;
      break;
    case "ice":
      result.settlement = settlement(
        entry,
        ownerRole,
        "recorded",
        "冰系血脉｜冻结 ×2 · 本次伤害不追加",
      );
      break;
    case "dragon":
      result.targetDefenseLevelBonusByCategory = categories(0, -8);
      break;
    case "electric":
      result.ownerSpeedFlat = 100;
      break;
    case "poison":
      result.settlement = settlement(
        entry,
        ownerRole,
        "recorded",
        "毒系血脉｜中毒 ×2 · 本次伤害不追加",
      );
      break;
    case "bug":
      result.targetDefenseLevelBonusByCategory = categories(-8, 0);
      break;
    case "martial":
      result.attackLevelBonusByCategory = categories(8, 0);
      break;
    case "wing":
      result.hitCountAdd = hasDeclaredHitCount(skill) ? 3 : 0;
      break;
    case "cute":
      result.targetAttackLevelBonusByCategory = categories(-6, -6);
      break;
    case "ghost":
      result.settlement = settlement(
        entry,
        ownerRole,
        "recorded",
        "幽系血脉｜对方能量 -2 · 本次伤害不变",
      );
      break;
    case "evil":
      result.settlement = settlement(
        entry,
        ownerRole,
        "recorded",
        "恶系血脉｜吸血 +50% · 仅记录回复效果",
      );
      break;
    case "machine":
      result.defenseLevelBonusByCategory = categories(6, 6);
      break;
    case "illusion":
      result.targetStarfallStacksAdd = 2;
      result.settlement = settlement(
        entry,
        ownerRole,
        skill.type === "幻" ? "not-triggered" : "applied",
        skill.type === "幻"
          ? "幻系血脉｜星陨 ×2 · 幻系技能不触发"
          : "幻系血脉｜星陨 ×2",
      );
      break;
    default:
      return emptyResolution();
  }

  return result;
}
