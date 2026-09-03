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
    note: "立即回复最大生命的15%；之后3回合结束时各回复15%。仅本次立即回复参与小丑家族“戏耍”的伤害结算。",
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
  const healing = active
    ? Math.round(Math.max(0, Number(maximumHp) || 0) * 0.15)
    : 0;
  const endTurnHealing = healing;
  const endTurnTicks = active ? 3 : 0;
  return {
    active,
    endTurnHealing,
    endTurnTicks,
    energy: 0,
    healing,
    magicId: normalized.bloodlineMagicId,
    sourceLabel: active ? "光合治愈" : null,
    totalPotentialHealing: healing + endTurnHealing * endTurnTicks,
  };
}
