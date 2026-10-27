import { buildCalculatorViewModel, getSpirit } from "../../domain/calculator-view-model.js";
import { hasCompleteRaceStats } from "../../domain/stat.js";
import { getServerRelease } from "../../domain/server-environment.js";
import { createSpiritSearchIndex } from "../../data/search-index.js";
import { withS5PreviewCalculationGuard } from "../s5-preview/calculation-guard.js";
import { withS5PreviewSettlements } from "../s5-preview/settlement.js";
import { projectBattleLevelHealth } from "../../state/calculator-session.js";

export const BALANCE_STATS = Object.freeze([
  { key: "hp", label: "生命" },
  { key: "physicalAttack", label: "物攻" },
  { key: "magicalAttack", label: "魔攻" },
  { key: "physicalDefense", label: "物防" },
  { key: "magicalDefense", label: "魔防" },
  { key: "speed", label: "速度" },
]);
const SIDE_KEYS = ["attacker", "defender"];

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
