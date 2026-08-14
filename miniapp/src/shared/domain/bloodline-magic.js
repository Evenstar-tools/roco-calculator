export const BLOODLINE_MAGIC_OPTIONS = Object.freeze([
  {
    id: "none",
    implemented: true,
    name: "无",
    note: "未使用血脉魔法。",
  },
  {
    id: "photosynthetic-healing",
    implemented: true,
    name: "光合治愈",
    note: "回复最大生命的50%；仅小丑家族“戏耍”参与伤害结算。",
  },
  {
    id: "throttling",
    implemented: false,
    name: "节流术",
    note: "暂未接入结算，不影响伤害。",
  },
  {
    id: "evolution-power",
    implemented: false,
    name: "进化之力",
    note: "暂未接入结算，不影响伤害。",
  },
  {
    id: "enhancement",
    implemented: false,
    name: "强化术",
    note: "暂未接入结算，不影响伤害。",
  },
  {
    id: "flame-burst",
    implemented: false,
    name: "闪焰爆发",
    note: "暂未接入结算，不影响伤害。",
  },
]);

const OPTION_BY_ID = new Map(
  BLOODLINE_MAGIC_OPTIONS.map((option) => [option.id, option]),
);

export function getBloodlineMagicOption(id) {
  return OPTION_BY_ID.get(String(id ?? "")) ?? OPTION_BY_ID.get("none");
}

export function normalizeBloodlineMagicContext(context = {}) {
  const option = getBloodlineMagicOption(context.bloodlineMagicId);
  return {
    bloodlineMagicId: option.id,
    bloodlineMagicTriggered:
      option.id !== "none" && context.bloodlineMagicTriggered === true,
  };
}

export function resolveBloodlineMagicHealing({
  context = {},
  maximumHp = 0,
} = {}) {
  const normalized = normalizeBloodlineMagicContext(context);
  const active = normalized.bloodlineMagicTriggered === true &&
    normalized.bloodlineMagicId === "photosynthetic-healing";
  return {
    active,
    energy: 0,
    healing: active
      ? Math.round(Math.max(0, Number(maximumHp) || 0) * 0.5)
      : 0,
    magicId: normalized.bloodlineMagicId,
    sourceLabel: active ? "光合治愈" : null,
  };
}
