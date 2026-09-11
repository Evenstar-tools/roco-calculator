export const DURABILITY_FORMULA_VERSION = "panel-durability-v1";

function assertPositivePanelStat(stat, value) {
  if (Number.isFinite(value) && value > 0) return;
  const error = new TypeError(`面板属性 ${stat} 必须是有限正数`);
  error.code = "INVALID_PANEL_STAT";
  error.stat = stat;
  error.value = value;
  throw error;
}

export function calculateDurability({
  maxHp,
  physicalDefense,
  magicalDefense,
} = {}) {
  assertPositivePanelStat("maxHp", maxHp);
  assertPositivePanelStat("physicalDefense", physicalDefense);
  assertPositivePanelStat("magicalDefense", magicalDefense);

  const physical = maxHp * physicalDefense;
  const magical = maxHp * magicalDefense;
  const combined =
    (maxHp * physicalDefense * magicalDefense) /
    (physicalDefense + magicalDefense);

  return {
    formulaVersion: DURABILITY_FORMULA_VERSION,
    raw: { physical, magical, combined },
    display: {
      physical: Math.round(physical),
      magical: Math.round(magical),
      combined: Math.round(combined),
    },
  };
}
