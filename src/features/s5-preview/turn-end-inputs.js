import { normalizeTriggerControls } from "../../domain/trigger-controls.js";

const SETTLED_FIELDS = {
  "gold-vein-dragon": "SettledChargeCount",
  "underground-silver-dragon": "SettledEnergySpent",
};

export function getS5PreviewTurnEndInputs(mechanicKey, role = "attacker") {
  const suffix = SETTLED_FIELDS[mechanicKey];
  if (!suffix) return [];
  const source = `${role}Trait`;
  return normalizeTriggerControls([
    { contextKey: `${source}S5${suffix}`, label: "已结算数量", type: "number",
      defaultValue: undefined, min: 0, hidden: true },
    { contextKey: `${source}S5TurnEndApply`, label: "回合结束", type: "boolean",
      defaultValue: false, action: "s5-stat-turn-end" },
  ], { source, scope: "direction" });
}
