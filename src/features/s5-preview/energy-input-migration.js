import { canonicalTraitControlKey } from "../../domain/trait-runtime.js";
import { normalizeTriggerControls, sanitizeTriggerValues } from "../../domain/trigger-controls.js";

const SILVER_SPIRIT_ID = "spirit_preview_s5_underground-silver-dragon";
const SILVER_TRAIT_ID = "trait_preview_s5_underground-silver-dragon";
const roles = ["attacker", "defender"];
const roleControls = Object.fromEntries(roles.map(role => {
  const source = `${role}Trait`;
  return [role, normalizeTriggerControls([
    { contextKey: `${source}S5CurrentMagicalAttackBonus`, type: "number", defaultValue: 0, min: 0 },
    { contextKey: `${source}S5EnergySpent`, label: "累计消耗能量", suffix: "点", type: "number", defaultValue: 0, min: 0 },
  ], { source, scope: "direction" })];
}));

export const getLegacySilverEnergyInput = (role = "attacker") => roleControls[role][0];
export const getSilverEnergySpentInput = (role = "attacker") => roleControls[role][1];
const isRecord = value => value && typeof value === "object" && !Array.isArray(value);
const keysFor = (control, canonical) => [
  ...(canonical ? [canonicalTraitControlKey(control)] : []),
  control.id, `${control.source}.${control.contextKey}`, control.contextKey,
];
function explicitValue(record, control, canonical = false) {
  const key = keysFor(control, canonical).find(key => Object.hasOwn(record, key));
  return key === undefined ? null : { raw: record[key] };
}
function energySpent(record, role, canonical = false) {
  const [old, current] = roleControls[role];
  const value = explicitValue(record, current, canonical);
  if (value) return sanitizeTriggerValues({ [current.id]: value.raw }, [current])[current.id];
  const legacy = explicitValue(record, old, canonical);
  if (!legacy) return undefined;
  const total = typeof legacy.raw === "number" || typeof legacy.raw === "string" && legacy.raw.trim() !== ""
    ? Number(legacy.raw) : Number.NaN;
  // Do not turn a former fractional/manual total into an invented energy count.
  return Number.isSafeInteger(total) && total >= 0 && total % 10 === 0 ? total / 10 : null;
}

/** Undefined means no saved input; null means an old total needs explicit replacement. */
export function readSilverEnergySpent(context = {}, role = "attacker", trait = {}) {
  const merged = { ...context };
  for (const control of roleControls[role]) {
    const stored = explicitValue(trait.runtimeInputValues ?? {}, control, true);
    if (stored) merged[control.id] = stored.raw;
  }
  return energySpent(merged, role);
}

function replaceRecord(record, role, amount, canonical = false) {
  const next = { ...record };
  for (const ownerRole of canonical ? roles : [role]) {
    for (const control of roleControls[ownerRole]) {
      for (const key of keysFor(control, canonical)) delete next[key];
    }
  }
  const control = getSilverEnergySpentInput(role);
  next[canonical ? canonicalTraitControlKey(control) : control.id] = amount;
  return Object.keys(next).length === Object.keys(record).length && Object.entries(next).every(([key, value]) => record[key] === value)
    ? record : next;
}
function correctOwnerValues(record) {
  for (const role of roles) {
    if (explicitValue(record, getSilverEnergySpentInput(role), true)) {
      return replaceRecord(record, role, energySpent(record, role, true), true);
    }
  }
  for (const role of roles) {
    const amount = energySpent(record, role, true);
    if (amount != null) return replaceRecord(record, role, amount, true);
  }
  return record;
}

export function correctS5PreviewEnergyInputs(value) {
  let corrected = value;
  if (value.spiritId === SILVER_SPIRIT_ID && isRecord(value.traitValues)) {
    const traitValues = correctOwnerValues(value.traitValues);
    if (traitValues !== value.traitValues) corrected = { ...value, traitValues };
  }
  const acquired = value.acquiredTraitValues?.[SILVER_TRAIT_ID];
  if (isRecord(acquired)) {
    const traitValues = correctOwnerValues(acquired);
    if (traitValues !== acquired) corrected = { ...corrected,
      acquiredTraitValues: { ...value.acquiredTraitValues, [SILVER_TRAIT_ID]: traitValues },
    };
  }
  let directions = corrected.directions;
  if (!corrected.sides || !isRecord(directions?.forward?.context) || !isRecord(directions?.reverse?.context)) return corrected;
  for (const [side, outgoing, incoming] of [["attacker", "forward", "reverse"], ["defender", "reverse", "forward"]]) {
    if (corrected.sides[side]?.spiritId !== SILVER_SPIRIT_ID) continue;
    const amount = energySpent(directions[outgoing].context, "attacker");
    if (amount == null) continue;
    for (const [direction, role] of [[outgoing, "attacker"], [incoming, "defender"]]) {
      const previous = directions[direction];
      const context = replaceRecord(previous.context, role, amount);
      if (context !== previous.context) directions = { ...directions, [direction]: { ...previous, context } };
    }
  }
  return directions === corrected.directions ? corrected : { ...corrected, directions };
}
