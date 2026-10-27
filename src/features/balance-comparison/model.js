import { buildCalculatorViewModel, getSpirit } from "../../domain/calculator-view-model.js";
import { hasCompleteRaceStats } from "../../domain/stat.js";
import { getServerRelease } from "../../domain/server-environment.js";
import { createSpiritSearchIndex } from "../../data/search-index.js";
import { withS5PreviewCalculationGuard } from "../s5-preview/calculation-guard.js";
import { withS5PreviewSettlements } from "../s5-preview/settlement.js";
import { projectBattleLevelHealth } from "../../state/calculator-session.js";
import { getS5PreviewBattleLevelEvaluation } from "../../domain/battle-level.js";
import { getS5PreviewTraitInputs } from "../../domain/s5-preview-traits.js";
import { damagePresentation } from "../../domain/result-presentation.js";

export const BALANCE_STATS = Object.freeze([
  { key: "hp", label: "生命" },
  { key: "physicalAttack", label: "物攻" },
  { key: "magicalAttack", label: "魔攻" },
  { key: "physicalDefense", label: "物防" },
  { key: "magicalDefense", label: "魔防" },
  { key: "speed", label: "速度" },
]);
const SIDE_KEYS = ["attacker", "defender"];

export function raceStatsBeforePatch(spirit, record) {
  const changeInfo = spirit?.changeInfo;
  if (!changeInfo || !record || spirit.calculationStatus === "pending-race-stats" ||
    !BALANCE_STATS.every(({ key }) => Number.isSafeInteger(spirit.raceStats?.[key]) && spirit.raceStats[key] > 0) ||
    (changeInfo.history !== undefined && !Array.isArray(changeInfo.history))) return null;
  const records = [changeInfo, ...(changeInfo.history ?? [])];
  const patchId = record.patch?.id;
  const matches = patchId == null ? [] : records.filter(entry => entry?.patch?.id === patchId);
  if (patchId != null && matches.length !== 1) return null;
  const targetIndex = records.indexOf(patchId == null ? record : matches[0]);
  if (targetIndex < 0) return null;
  const raceStats = Object.fromEntries(BALANCE_STATS.map(({ key }) => [key, spirit.raceStats[key]]));
  let targetChanged = false;
  for (const entry of records.slice(0, targetIndex + 1)) {
    if (!entry || (entry.items !== undefined && !Array.isArray(entry.items))) return null;
    for (const item of entry.items ?? []) {
      if (item?.kind !== "stat" || !BALANCE_STATS.some(({ key }) => key === item.field)) continue;
      if (!Number.isSafeInteger(item.before) || item.before < 1 ||
        !Number.isSafeInteger(item.after) || item.after < 1) return null;
      raceStats[item.field] = item.before;
      if (entry === records[targetIndex] && item.before !== item.after) targetChanged = true;
    }
  }
  if (!targetChanged) return null;
  raceStats.total = BALANCE_STATS.reduce((sum, { key }) => sum + raceStats[key], 0);
  return Number.isSafeInteger(raceStats.total) ? raceStats : null;
}

function buildView(args, hpInputModes = {}, force = false) {
  const { snapshot, state } = args;
  const serverId = args.serverId ?? snapshot.meta?.serverId ?? snapshot.serverId ?? "cn";
  if (!getServerRelease(serverId).capabilities.calculate) return buildCalculatorViewModel(args);
  let projected = state;
  for (const [direction, side] of [["forward", "defender"], ["reverse", "attacker"]]) {
    projected = projectBattleLevelHealth(projected, { snapshot, side,
      hpInputMode: hpInputModes[direction], force });
  }
  return buildCalculatorViewModel({ ...args, state: projected });
}

function customForSide(snapshot, state, customStats, customEnabled, sideKey) {
  const spirit = getSpirit(snapshot, state.sides[sideKey]);
  if (!spirit || customEnabled?.[sideKey]?.[spirit.id] !== true) return null;
  if (spirit.calculationStatus === "pending-race-stats" || !hasCompleteRaceStats(spirit.raceStats)) {
    return { spirit, issue: "种族值待确认，暂不支持自定义试算" };
  }
  const draft = customStats?.[sideKey]?.[spirit.id] ?? {};
  const raceStats = { ...spirit.raceStats };
  for (const { key } of BALANCE_STATS) {
    if (Object.hasOwn(draft, key)) {
      const value = Number(draft[key]);
      if (!Number.isSafeInteger(value) || value < 1) return { spirit, issue: "自定义种族值须为正整数" };
      raceStats[key] = value;
    }
  }
  raceStats.total = BALANCE_STATS.reduce((sum, { key }) => sum + raceStats[key], 0);
  return { spirit, raceStats };
}

function restoreViewIdentity(view, idMap, officialSelectable) {
  const seen = new WeakMap();
  const restore = (value, key = "") => {
    if (typeof value === "string") return ["id", "spiritId"].includes(key) ? idMap.get(value) ?? value : value;
    if (!value || typeof value !== "object") return value;
    if (seen.has(value)) return seen.get(value);
    const result = Array.isArray(value) ? [] : {};
    seen.set(value, result);
    for (const [childKey, child] of Object.entries(value)) result[childKey] = restore(child, childKey);
    return result;
  };
  const restored = restore(view);
  restored.selectableSpirits = officialSelectable;
  return restored;
}

function customView(args, customStats, customEnabled, officialView, hpInputModes) {
  const { snapshot, state } = args;
  const extras = [];
  const learnsets = [];
  const sides = { ...state.sides };
  const idMap = new Map();
  let issue = null;
  for (const sideKey of SIDE_KEYS) {
    const custom = customForSide(snapshot, state, customStats, customEnabled, sideKey);
    if (!custom) continue;
    if (custom.issue) { issue ??= custom.issue; continue; }
    const { spirit, raceStats } = custom;
    // A distinct transient entity per side is required because the shared VM
    // resolves spiritId and both sides may configure the same official species.
    let id = `balance-custom:${sideKey}:${spirit.id}`;
    while ((snapshot.spirits ?? []).some((entity) => entity.id === id)) id += ":custom";
    idMap.set(id, spirit.id);
    extras.push({ ...spirit, id, raceStats });
    const learnset = snapshot.learnsets?.find((entry) => entry.spiritId === state.sides[sideKey].spiritId);
    if (learnset) learnsets.push({ ...learnset, spiritId: id });
    const { battleForm: _battleForm, panelStats: _panelStats, ...side } = state.sides[sideKey];
    sides[sideKey] = { ...side, spiritId: id };
  }
  if (!extras.length) return { view: officialView, issue };
  const internalSnapshot = {
    ...snapshot,
    spirits: [...snapshot.spirits, ...extras],
    learnsets: [...(snapshot.learnsets ?? []), ...learnsets],
  };
  const internalState = { ...state, sides };
  const view = buildView({
    ...args, snapshot: internalSnapshot, state: internalState,
    spiritIndex: createSpiritSearchIndex(internalSnapshot.spirits),
  }, hpInputModes, true);
  return { view: restoreViewIdentity(view, idMap, officialView.selectableSpirits), issue };
}

export function buildBalanceComparison({
  snapshot, state, activeDirection = "forward",
  customStats = {}, customEnabled = {}, hpInputModes = {}, ...viewArgs
}) {
  const args = { ...viewArgs, snapshot, state, activeDirection };
  const hasCustom = SIDE_KEYS.some((sideKey) => {
    const spirit = getSpirit(snapshot, state.sides[sideKey]);
    return spirit && customEnabled?.[sideKey]?.[spirit.id] === true;
  });
  const officialView = buildView(args, hpInputModes, hasCustom);
  const custom = hasCustom ? customView(args, customStats, customEnabled, officialView, hpInputModes)
    : { view: officialView, issue: null };
  return { afterView: withS5PreviewCalculationGuard(withS5PreviewSettlements(custom.view, snapshot, state), snapshot, state),
    active: hasCustom, hasCustom, issue: custom.issue };
}

/** Compare the selected displayed damage with the same matchup at both level60.
 * The baseline is transient and includes the level-dependent trait thresholds.
 */
export function buildBattleLevelComparison({ afterView, ...args }) {
  const { snapshot, state, activeDirection = "forward" } = args;
  const direction = state.directions?.[activeDirection];
  if (!direction || (direction.selectedDamageSource && direction.selectedDamageSource !== "skill") ||
    (afterView?.active?.direction && afterView.active.direction !== activeDirection)) return null;
  const current = afterView?.result?.selectedResult;
  if (current?.status !== "exact") return null;
  const currentDamage = damagePresentation(current).damage;
  if (!Number.isFinite(currentDamage) || currentDamage < 0) return null;
  const owners = SIDE_KEYS.filter(side => getS5PreviewBattleLevelEvaluation(snapshot, state, side)?.calcStatus === "ready");
  if (!owners.length) return null;

  const directions = Object.fromEntries(Object.entries(state.directions).map(([key, value]) =>
    [key, { ...value, context: { ...value.context } }]));
  for (const side of owners) {
    const spirit = getSpirit(snapshot, state.sides[side]);
    const identity = spirit.previewIdentity;
    const trait = snapshot.traits.find(entry => spirit.traitIds?.includes(entry.id) &&
      entry.previewIdentity?.catalogId === identity.catalogId && entry.previewIdentity?.key === identity.key &&
      entry.previewIdentity?.mechanicKey === identity.mechanicKey);
    const outgoing = side === "attacker" ? "forward" : "reverse";
    const incoming = side === "attacker" ? "reverse" : "forward";
    for (const [key, role] of [[outgoing, "attacker"], [incoming, "defender"]]) {
      const input = getS5PreviewTraitInputs(trait, role)?.find(control => control.contextKey.endsWith("BattleLevel"));
      if (!input) return null;
      directions[key].context[input.id] = 60;
      directions[key].context[input.contextKey] = 60;
    }
  }
  // Start from the currently rendered integer HP ratio, including custom race
  // stats and absolute-HP inputs; never reuse a stale saved percent or HP cap.
  for (const [key, side] of [["forward", "defender"], ["reverse", "attacker"]]) {
    const health = afterView.sides?.[side]?.health;
    if (!Number.isFinite(health?.currentHp) || !(health.maxHp > 0)) return null;
    directions[key].currentHp = health.currentHp;
    directions[key].context.currentHpPercent = health.currentHp / health.maxHp * 100;
  }
  const baselineState = { ...state, directions };
  const baselineView = buildBalanceComparison({ ...args, state: baselineState,
    hpInputModes: { forward: "percent", reverse: "percent" } }).afterView;
  const baseline = baselineView.result?.selectedResult;
  if (baseline?.status !== "exact" || baseline.skillId !== current.skillId) return null;
  const baselineDamage = damagePresentation(baseline).damage;
  if (!Number.isFinite(baselineDamage) || baselineDamage < 0 || (!currentDamage && !baselineDamage)) return null;
  const attackSide = activeDirection === "forward" ? "attacker" : "defender";
  const defendSide = activeDirection === "forward" ? "defender" : "attacker";
  return {
    status: baselineDamage > 0 ? "ready" : "zero-baseline",
    attackerLevel: afterView.sides[attackSide].combatLevel,
    defenderLevel: afterView.sides[defendSide].combatLevel,
    currentDamage, baselineDamage,
    percent: baselineDamage > 0 ? Number(((currentDamage / baselineDamage - 1) * 100).toFixed(1)) : null,
    skillName: current.skillName,
  };
}
