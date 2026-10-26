import { buildCalculatorViewModel, getSpirit } from "../../domain/calculator-view-model.js";
import { getEffectiveTraits } from "../../domain/effective-traits.js";
import { calculateAllPanelStats, hasCompleteRaceStats } from "../../domain/stat.js";
import { getNatureMultipliers } from "../../domain/natures.js";
import { getServerRelease } from "../../domain/server-environment.js";
import { createSpiritSearchIndex } from "../../data/search-index.js";

export const BALANCE_STATS = Object.freeze([
  { key: "hp", label: "生命" },
  { key: "physicalAttack", label: "物攻" },
  { key: "magicalAttack", label: "魔攻" },
  { key: "physicalDefense", label: "物防" },
  { key: "magicalDefense", label: "魔防" },
  { key: "speed", label: "速度" },
]);
const STAT_KEYS = new Set(BALANCE_STATS.map(({ key }) => key));
const SKILL_NUMBERS = new Set(["basePower", "cost"]);
const SIDE_KEYS = ["attacker", "defender"];
const finite = (value) => typeof value === "number" && Number.isFinite(value);

function buildView(args, hpInputModes = {}) {
  const { snapshot, state } = args;
  const serverId = args.serverId ?? snapshot.meta?.serverId ?? snapshot.serverId ?? "cn";
  if (!getServerRelease(serverId).capabilities.calculate) return buildCalculatorViewModel(args);
  let directions = state.directions;
  for (const [direction, targetSide] of [["forward", "defender"], ["reverse", "attacker"]]) {
    const current = state.directions[direction];
    const percent = current.context?.currentHpPercent;
    // Existing saves hold both HP and % without recording the input unit.
    // Rescale only with an explicit Web-only unit selection; old saves keep HP.
    if (hpInputModes[direction] !== "percent" || !finite(percent)) continue;
    const side = state.sides[targetSide];
    const spirit = getSpirit(snapshot, side);
    if (!hasCompleteRaceStats(spirit?.raceStats)) continue;
    const panel = calculateAllPanelStats({
      raceStats: spirit.raceStats, displayIvs: side.displayIvs,
      natureMultipliers: getNatureMultipliers(side.nature),
    });
    if (directions === state.directions) directions = { ...directions };
    directions[direction] = { ...current, currentHp: Math.round(panel.hp * Math.min(100, Math.max(0, percent)) / 100) };
  }
  return buildCalculatorViewModel({
    ...args, state: directions === state.directions ? state : { ...state, directions },
  });
}

function recordedEntities(snapshot) {
  const result = [];
  for (const [collection, entityType] of [["spirits", "spirit"], ["skills", "skill"], ["traits", "trait"]]) {
    for (const entity of snapshot[collection] ?? []) {
      let info = entity.changeInfo;
      if (!info) {
        const entry = snapshot.currentPatchChanges?.[collection]?.find(({ entityId }) => entityId === entity.id);
        if (entry) info = { patch: snapshot.currentPatchChanges.patch, ...entry };
      }
      if (info?.patch?.id) result.push({ collection, entityType, entity, info });
    }
  }
  return result;
}

/** A narrow reversal of audited fields, never a complete historical engine/snapshot. */
export function createRecordedBaseline(snapshot, { patchId } = {}) {
  const records = recordedEntities(snapshot);
  const selectedPatch = patchId ?? snapshot.currentPatchChanges?.patch?.id ?? records[0]?.info.patch.id;
  const matching = records.filter(({ info }) => info.patch.id === selectedPatch);
  const patch = matching[0]?.info.patch ?? null;
  const issues = [];
  const changes = [];
  const replacements = new Map();
  for (const { collection, entityType, entity, info } of matching) {
    const updated = { ...entity, ...(entity.raceStats ? { raceStats: { ...entity.raceStats } } : {}) };
    let modified = false;
    const addIssue = (code, message, item = null) => issues.push({
      code, message, entityType, entityId: entity.id,
      entityName: entity.fullName ?? entity.name, item,
    });
    if (info.isNew) addIssue("NEW_ENTITY", "新增实体缺少调整前资料，当前无法对比");
    if (!Array.isArray(info.items) || !info.items.length) {
      addIssue("MISSING_CHANGE_RECORD", "改动记录不完整，当前无法还原调整前数值");
    }
    for (const item of info.items ?? []) {
      const change = {
        entityType, entityId: entity.id, entityName: entity.fullName ?? entity.name,
        ...item, patchId: selectedPatch,
      };
      changes.push(change);
      if (item.kind === "wording") continue;
      const isRaceStat = entityType === "spirit" && item.kind === "stat" && STAT_KEYS.has(item.field);
      const isSkillNumber = entityType === "skill" && item.kind === "stat" && SKILL_NUMBERS.has(item.field);
      if (!isRaceStat && !isSkillNumber) {
        addIssue("UNSUPPORTED_RULE_CHANGE", `${item.label ?? "机制"}的调整前规则未核验，当前无法对比`, item);
        continue;
      }
      const target = isRaceStat ? updated.raceStats : updated;
      if (!target || !finite(item.before) || !finite(item.after) ||
          (isRaceStat && (!Number.isInteger(item.before) || item.before <= 0)) ||
          item.before < 0 || target[item.field] !== item.after) {
        addIssue("BASELINE_MISMATCH", `${item.label ?? item.field}的改动记录与当前值不一致，当前无法对比`, item);
        continue;
      }
      target[item.field] = item.before;
      modified = true;
    }
    if (modified) {
      if (updated.raceStats) updated.raceStats.total = BALANCE_STATS.reduce((total, { key }) => total + updated.raceStats[key], 0);
      replacements.set(`${collection}:${entity.id}`, updated);
    }
  }
  const baseline = {
    ...snapshot,
    spirits: (snapshot.spirits ?? []).map((entity) => replacements.get(`spirits:${entity.id}`) ?? entity),
    skills: (snapshot.skills ?? []).map((entity) => replacements.get(`skills:${entity.id}`) ?? entity),
    traits: snapshot.traits,
  };
  return { snapshot: baseline, patch, issues, changes };
}

function selectionScope(snapshot, state) {
  const scope = { spirit: new Set(), skill: new Set(), trait: new Set(), traitNames: new Set() };
  for (const sideKey of SIDE_KEYS) {
    const side = state.sides[sideKey];
    const spirit = getSpirit(snapshot, side);
    if (side.spiritId) scope.spirit.add(side.spiritId);
    if (spirit?.id) scope.spirit.add(spirit.id);
    const entries = [...(side.skills?.four ?? [])];
    if (state.mode !== "four") entries.push(side.skills?.single);
    for (const entry of entries) {
      const id = typeof entry === "string" ? entry : entry?.skillId ?? entry?.id ?? entry?.skill?.id;
      if (id) scope.skill.add(id);
    }
    for (const trait of getEffectiveTraits(snapshot, { ...side, spirit })) {
      if (trait.id) scope.trait.add(trait.id);
      if (trait.name) scope.traitNames.add(trait.name);
    }
  }
  return scope;
}

function inScope(record, scope) {
  if (scope[record.entityType]?.has(record.entityId)) return true;
  if (record.entityType === "trait" && scope.traitNames.has(record.entityName)) return true;
  // Runtime records attach trait changes to all natural owners. Acquired and
  // inherited copies must also block, even when that owner is not selected.
  const item = record.item ?? record;
  if (item.kind === "trait" || item.kind === "wording" && String(item.label).startsWith("特性·")) {
    const name = String(item.label ?? "").replace(/^特性[·：:]/u, "");
    return scope.traitNames.has(name);
  }
  return false;
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
  const changes = [];
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
    for (const { key, label } of BALANCE_STATS) {
      if (raceStats[key] !== spirit.raceStats[key]) changes.push({
        entityType: "spirit", entityId: spirit.id, entityName: spirit.fullName,
        side: sideKey, kind: "custom", field: key, label,
        before: spirit.raceStats[key], after: raceStats[key],
      });
    }
  }
  if (!extras.length) return { view: officialView, changes, issue };
  const internalSnapshot = {
    ...snapshot,
    spirits: [...snapshot.spirits, ...extras],
    learnsets: [...(snapshot.learnsets ?? []), ...learnsets],
  };
  const internalState = { ...state, sides };
  const view = buildView({
    ...args, snapshot: internalSnapshot, state: internalState,
    spiritIndex: createSpiritSearchIndex(internalSnapshot.spirits),
  }, hpInputModes);
  return { view: restoreViewIdentity(view, idMap, officialView.selectableSpirits), changes, issue };
}

export function damageDelta(before, after) {
  const oldDamage = typeof before === "number" ? before : before?.totalDamage;
  const newDamage = typeof after === "number" ? after : after?.totalDamage;
  if (!finite(oldDamage) || !finite(newDamage)) return null;
  const difference = newDamage - oldDamage;
  return {
    difference,
    percent: oldDamage === 0 ? difference === 0 ? 0 : null : difference / oldDamage * 100,
    hpPercentPoints: finite(before?.hpPercent) && finite(after?.hpPercent) ? after.hpPercent - before.hpPercent : null,
  };
}

export function buildBalanceComparison({
  snapshot, state, activeDirection = "forward", patchId, enabled = false,
  customStats = {}, customEnabled = {}, hpInputModes = {}, ...viewArgs
}) {
  const args = { ...viewArgs, snapshot, state, activeDirection };
  const hasCustom = SIDE_KEYS.some((sideKey) => {
    const spirit = getSpirit(snapshot, state.sides[sideKey]);
    return spirit && customEnabled?.[sideKey]?.[spirit.id] === true;
  });
  const active = Boolean(enabled || hasCustom);
  const officialView = active ? buildView(args, hpInputModes) : buildCalculatorViewModel(args);
  const custom = hasCustom ? customView(args, customStats, customEnabled, officialView, hpInputModes) : { view: officialView, changes: [], issue: null };
  let beforeView = active ? officialView : null;
  let issue = custom.issue;
  let patch = null;
  let changes = [];
  if (enabled) {
    const baseline = createRecordedBaseline(snapshot, { patchId });
    patch = baseline.patch;
    const scope = selectionScope(snapshot, state);
    changes = baseline.changes.filter((change) => inScope(change, scope));
    const selectedIssues = baseline.issues.filter((entry) => inScope(entry, scope));
    issue ??= !patch ? "所选调整缺少可核验的改动记录" : selectedIssues[0]?.message ?? null;
    beforeView = issue ? null : buildView({
      ...args, snapshot: baseline.snapshot,
      spiritIndex: createSpiritSearchIndex(baseline.snapshot.spirits),
    }, hpInputModes);
  }
  if (active && !officialView.configurationReady) issue ??= officialView.configurationIssue ?? "当前配置尚不能计算";
  if (issue) beforeView = null;
  return {
    beforeView, afterView: custom.view, active, hasCustom, issue, patch,
    changes: [...changes, ...custom.changes],
    beforeLabel: enabled ? "记录调整前" : "官方当前值",
    afterLabel: hasCustom ? "自定义试算" : "当前值",
  };
}
