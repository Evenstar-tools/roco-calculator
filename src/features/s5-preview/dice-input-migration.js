import { canonicalTraitControlKey } from "../../domain/trait-runtime.js";
import { normalizeTriggerControls, sanitizeTriggerValues } from "../../domain/trigger-controls.js";

const SPIRIT_ID = "spirit_preview_s5_diliutun";
const TRAIT_ID = "trait_preview_s5_diliutun";
const roles = ["attacker", "defender"];
const controls = Object.fromEntries(roles.map(role => [role, [20, 6].map(max => {
  const source = `${role}Trait`;
  return normalizeTriggerControls([{ contextKey: `${source}S5DiceFace`, label: "本次实际骰点",
    type: "number", defaultValue: 1, min: 1, max }], { source, scope: "direction" })[0];
})]));
export const getLegacyS5DiceInput = (role = "attacker") => controls[role][0];
export const getS5SixFaceDiceInput = (role = "attacker") => controls[role][1];
const isRecord = value => value && typeof value === "object" && !Array.isArray(value);
function explicit(record, control, aliases = true) {
  const keys = [canonicalTraitControlKey(control), control.id,
    ...(aliases ? [`${control.source}.${control.contextKey}`, control.contextKey] : [])];
  const key = keys.find(key => Object.hasOwn(record ?? {}, key));
  return key === undefined ? null : { raw: record[key] };
}
function validLegacy(raw) {
  const value = typeof raw === "number" || typeof raw === "string" && raw.trim() !== "" ? Number(raw) : Number.NaN;
  return Number.isSafeInteger(value) && value >= 1 && value <= 6 ? value : null;
}

/** Missing stays undefined; an invalid old face stays unresolved, never clamped. */
export function readS5SixFaceDiceInput(context = {}, role = "attacker", trait = {}) {
  const [old, current] = controls[role];
  const stored = trait.runtimeInputValues ?? {};
  const next = explicit(stored, current) ?? explicit(context, current);
  if (next) return sanitizeTriggerValues({ [current.id]: next.raw }, [current])[current.id];
  const previous = explicit(stored, old, false) ?? explicit(context, old, false);
  return previous ? validLegacy(previous.raw) : undefined;
}

function upgrade(record, role, canonical = false) {
  const [old, current] = controls[role];
  if (explicit(record, current)) return record;
  const previous = explicit(record, old, false);
  const value = previous ? validLegacy(previous.raw) : null;
  if (value === null) return record;
  const next = { ...record, [canonical ? canonicalTraitControlKey(current) : current.id]: value };
  delete next[old.id]; delete next[canonicalTraitControlKey(old)];
  return next;
}

export function correctS5PreviewDiceInputs(value) {
  let corrected = value;
  if (value.spiritId === SPIRIT_ID && isRecord(value.traitValues)) {
    const traitValues = roles.reduce((record, role) => upgrade(record, role, true), value.traitValues);
    if (traitValues !== value.traitValues) corrected = { ...corrected, traitValues };
  }
  const acquired = value.acquiredTraitValues?.[TRAIT_ID];
  if (isRecord(acquired)) {
    const traitValues = roles.reduce((record, role) => upgrade(record, role, true), acquired);
    if (traitValues !== acquired) corrected = { ...corrected,
      acquiredTraitValues: { ...value.acquiredTraitValues, [TRAIT_ID]: traitValues } };
  }
  let directions = corrected.directions;
  for (const [side, outgoing, incoming] of [["attacker", "forward", "reverse"], ["defender", "reverse", "forward"]]) {
    if (corrected.sides?.[side]?.spiritId !== SPIRIT_ID) continue;
    for (const [direction, role] of [[outgoing, "attacker"], [incoming, "defender"]]) {
      const previous = directions?.[direction];
      if (!isRecord(previous?.context)) continue;
      const context = upgrade(previous.context, role);
      if (context !== previous.context) directions = { ...directions, [direction]: { ...previous, context } };
    }
  }
  return directions === corrected.directions ? corrected : { ...corrected, directions };
}
