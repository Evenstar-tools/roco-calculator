import { canonicalTraitControlKey } from "../../domain/trait-runtime.js";
import { normalizeTriggerControls, sanitizeTriggerValues } from "../../domain/trigger-controls.js";

const GOLD_SPIRIT_ID = "spirit_preview_s5_gold-vein-dragon";
const GOLD_TRAIT_ID = "trait_preview_s5_gold-vein-dragon";

function controls(role) {
  const source = `${role}Trait`;
  return normalizeTriggerControls([
    { contextKey: `${source}S5AttackBuffActive`, type: "boolean", defaultValue: false },
    { contextKey: `${source}S5CurrentAttackBonus`, type: "number", defaultValue: 50, min: 0 },
    { contextKey: `${source}S5ChargeCount`, label: "聚能次数", type: "number", defaultValue: 0, min: 0 },
  ], { source, scope: "direction" });
}

const ROLE_CONTROLS = { attacker: controls("attacker"), defender: controls("defender") };

export function getLegacyGoldChargeInputs(role = "attacker") {
  return ROLE_CONTROLS[role].slice(0, 2);
}

export function getGoldChargeCountInput(role = "attacker") {
  return ROLE_CONTROLS[role][2];
}

const isRecord = value => value && typeof value === "object" && !Array.isArray(value);
const keysFor = (control, canonical) => [
  ...(canonical ? [canonicalTraitControlKey(control)] : []),
  control.id, `${control.source}.${control.contextKey}`, control.contextKey,
];

function explicitValue(record, control, canonical) {
  const key = keysFor(control, canonical).find(key => Object.hasOwn(record, key));
  return key === undefined ? null : { raw: record[key], value: sanitizeTriggerValues({ [control.id]: record[key] }, [control])[control.id] };
}

function chargeCount(record, role, canonical = false) {
  const [active, bonus, count] = ROLE_CONTROLS[role];
  const current = explicitValue(record, count, canonical);
  if (current) return current.value;
  const oldActive = explicitValue(record, active, canonical);
  const oldBonus = explicitValue(record, bonus, canonical);
  if (!oldActive && !oldBonus) return null;
  if (oldActive?.value !== true) return 0;
  const numericBonus = !oldBonus ? 50
    : typeof oldBonus.raw === "number" || typeof oldBonus.raw === "string" && oldBonus.raw.trim() !== ""
      ? Number(oldBonus.raw) : Number.NaN;
  // Arbitrary former manual totals cannot be rounded into whole charge events.
  return Number.isSafeInteger(numericBonus) && numericBonus >= 0 && numericBonus % 50 === 0
    ? numericBonus / 50 : null;
}

function replaceRecord(record, role, count, canonical = false) {
  const next = { ...record };
  const roles = canonical ? ["attacker", "defender"] : [role];
  for (const sourceRole of roles) {
    for (const control of ROLE_CONTROLS[sourceRole]) {
      for (const key of keysFor(control, canonical)) delete next[key];
    }
  }
  const current = getGoldChargeCountInput(role);
  next[canonical ? canonicalTraitControlKey(current) : current.id] = count;
  const entries = Object.entries(next);
  return entries.length === Object.keys(record).length && entries.every(([key, value]) => record[key] === value)
    ? record : next;
}

function correctScopedValues(record) {
  // A new explicit value in either role wins all former percentage fields.
  for (const role of ["attacker", "defender"]) {
    const current = explicitValue(record, getGoldChargeCountInput(role), true);
    if (current) return replaceRecord(record, role, current.value, true);
  }
  for (const role of ["attacker", "defender"]) {
    const count = chargeCount(record, role, true);
    if (count !== null) return replaceRecord(record, role, count, true);
  }
  return record;
}

/** Only gold-vein-dragon owns these conversions; little-scissor shares the old keys. */
export function correctS5PreviewChargeInputs(value) {
  let corrected = value;
  if (value.spiritId === GOLD_SPIRIT_ID && isRecord(value.traitValues)) {
    const traitValues = correctScopedValues(value.traitValues);
    if (traitValues !== value.traitValues) corrected = { ...value, traitValues };
  }
  const acquired = value.acquiredTraitValues?.[GOLD_TRAIT_ID];
  if (isRecord(acquired)) {
    const traitValues = correctScopedValues(acquired);
    if (traitValues !== acquired) corrected = { ...corrected,
      acquiredTraitValues: { ...value.acquiredTraitValues, [GOLD_TRAIT_ID]: traitValues },
    };
  }
  let directions = corrected.directions;
  if (!corrected.sides || !isRecord(directions?.forward?.context) || !isRecord(directions?.reverse?.context)) return corrected;
  for (const [side, outgoing, incoming] of [["attacker", "forward", "reverse"], ["defender", "reverse", "forward"]]) {
    if (corrected.sides[side]?.spiritId !== GOLD_SPIRIT_ID) continue;
    const count = chargeCount(directions[outgoing].context, "attacker");
    if (count === null) continue;
    for (const [direction, role] of [[outgoing, "attacker"], [incoming, "defender"]]) {
      const previous = directions[direction];
      const context = replaceRecord(previous.context, role, count);
      if (context !== previous.context) directions = { ...directions, [direction]: { ...previous, context } };
    }
  }
  return directions === corrected.directions ? corrected : { ...corrected, directions };
}
