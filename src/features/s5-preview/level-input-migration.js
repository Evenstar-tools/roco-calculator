import { canonicalTraitControlKey } from "../../domain/trait-runtime.js";
import { normalizeTriggerControls, sanitizeTriggerValues } from "../../domain/trigger-controls.js";

const MINGGULONG_ID = "spirit_preview_s5_minggulong";
const ABU_IDS = new Set(["spirit_preview_s5_abu", "spirit_preview_s5_boss-abu", "spirit_preview_s5_super-abu"]);

function controls(role, defaultLevel, step) {
  const source = `${role}Trait`;
  return normalizeTriggerControls([
    { contextKey: `${source}S5CurrentLevel`, type: "number", defaultValue: defaultLevel, min: 1, max: 99 },
    { contextKey: `${source}S5LevelEventCount`, type: "number", defaultValue: 0, min: 0 },
    { contextKey: `${source}S5BattleLevel`, type: "number", defaultValue: defaultLevel, min: 1, max: 99, step },
  ], { source, scope: "direction" });
}

const MINGGULONG = { delta: -10, controls: { attacker: controls("attacker", 99, 10), defender: controls("defender", 99, 10) } };
const ABU = { delta: 2, controls: { attacker: controls("attacker", 60, 2), defender: controls("defender", 60, 2) } };
const mechanicFor = spiritId => spiritId === MINGGULONG_ID ? MINGGULONG : ABU_IDS.has(spiritId) ? ABU : null;

export function getLegacyMinggulongLevelInputs(role = "attacker") {
  return MINGGULONG.controls[role].slice(0, 2);
}

export function getLegacyAbuLevelInputs(role = "attacker") {
  return ABU.controls[role].slice(0, 2);
}

const keysFor = (control, canonical) => [
  ...(canonical ? [canonicalTraitControlKey(control)] : []),
  control.id, `${control.source}.${control.contextKey}`, control.contextKey,
];

function explicitValue(record, control, canonical = false) {
  const key = keysFor(control, canonical).find(key => Object.hasOwn(record, key));
  return key === undefined ? null : { value: sanitizeTriggerValues({ [control.id]: record[key] }, [control])[control.id] };
}

function hasLegacyLevel(record, mechanic, role, canonical = false) {
  return mechanic.controls[role].slice(0, 2).some(control =>
    keysFor(control, canonical).some(key => Object.hasOwn(record, key)));
}

function currentLevel(record, mechanic, role, canonical = false) {
  const [level, count, current] = mechanic.controls[role];
  const existing = explicitValue(record, current, canonical);
  if (existing) return existing.value;
  const oldLevel = explicitValue(record, level, canonical);
  const oldCount = explicitValue(record, count, canonical);
  if (!oldLevel && !oldCount) return null;
  const derived = (oldLevel?.value ?? level.defaultValue) + mechanic.delta * (oldCount?.value ?? 0);
  if (mechanic === ABU) return Math.min(99, derived);
  // The old calculator blocked unknown lower bounds; do not invent a clamp.
  return Number.isSafeInteger(derived) && derived >= 1 && derived <= 99 ? derived : null;
}

function replaceLevel(record, mechanic, role, level, canonical = false) {
  const [oldLevel, oldCount, current] = mechanic.controls[role];
  const next = { ...record };
  for (const control of [oldLevel, oldCount]) {
    for (const key of keysFor(control, canonical)) delete next[key];
  }
  const key = canonical ? canonicalTraitControlKey(current) : current.id;
  next[key] = level;
  const entries = Object.entries(next);
  return entries.length === Object.keys(record).length && entries.every(([key, value]) => record[key] === value)
    ? record : next;
}

/** Exact, read-only compatibility for the former owner-level start/count inputs. */
export function correctS5PreviewLevelInputs(value) {
  let corrected = value;
  const savedMechanic = mechanicFor(value.spiritId);
  if (savedMechanic && value.traitValues && typeof value.traitValues === "object" &&
      hasLegacyLevel(value.traitValues, savedMechanic, "attacker", true)) {
    const level = currentLevel(value.traitValues, savedMechanic, "attacker", true);
    if (level !== null) {
      const traitValues = replaceLevel(value.traitValues, savedMechanic, "attacker", level, true);
      if (traitValues !== value.traitValues) corrected = { ...value, traitValues };
    }
  }
  let directions = corrected.directions;
  if (!corrected.sides || !directions?.forward?.context || !directions?.reverse?.context) return corrected;
  for (const [side, outgoing, incoming] of [["attacker", "forward", "reverse"], ["defender", "reverse", "forward"]]) {
    const mechanic = mechanicFor(corrected.sides[side]?.spiritId);
    if (!mechanic) continue;
    // This is an old-input migration, not a runtime mirroring/normalization pass.
    // A new-only save must read back byte-for-byte for optimistic storage checks.
    if (!hasLegacyLevel(directions[outgoing].context, mechanic, "attacker") &&
        !hasLegacyLevel(directions[incoming].context, mechanic, "defender")) continue;
    const level = currentLevel(directions[outgoing].context, mechanic, "attacker");
    if (level === null) continue;
    for (const [direction, role] of [[outgoing, "attacker"], [incoming, "defender"]]) {
      const previous = directions[direction];
      const context = replaceLevel(previous.context, mechanic, role, level);
      if (context !== previous.context) directions = { ...directions, [direction]: { ...previous, context } };
    }
  }
  return directions === corrected.directions ? corrected : { ...corrected, directions };
}
