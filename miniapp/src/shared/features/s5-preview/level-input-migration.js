import { canonicalTraitControlKey } from "../../domain/trait-runtime.js";
import { normalizeTriggerControls, sanitizeTriggerValues } from "../../domain/trigger-controls.js";

const MINGGULONG_ID = "spirit_preview_s5_minggulong";
const ABU_IDS = new Set(["spirit_preview_s5_abu", "spirit_preview_s5_boss-abu", "spirit_preview_s5_super-abu"]);

function controls(role, defaultLevel, step, currentMax = 99) {
  const source = `${role}Trait`;
  return normalizeTriggerControls([
    { contextKey: `${source}S5CurrentLevel`, type: "number", defaultValue: defaultLevel, min: 1, max: 99 },
    { contextKey: `${source}S5LevelEventCount`, type: "number", defaultValue: 0, min: 0 },
    { contextKey: `${source}S5BattleLevel`, type: "number", defaultValue: defaultLevel, min: 1, max: currentMax, step },
  ], { source, scope: "direction" });
}

const MINGGULONG = { delta: -10, controls: { attacker: controls("attacker", 99, 10), defender: controls("defender", 99, 10) } };
const ABU = { delta: 2, controls: { attacker: controls("attacker", 60, 2, 150), defender: controls("defender", 60, 2, 150) },
  oldCurrent: { attacker: controls("attacker", 60, 2)[2], defender: controls("defender", 60, 2)[2] } };
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

const legacyControls = (mechanic, role) => [
  ...mechanic.controls[role].slice(0, 2), ...(mechanic.oldCurrent ? [mechanic.oldCurrent[role]] : []),
];

function hasLegacyLevel(record, mechanic, role, canonical = false) {
  return legacyControls(mechanic, role).some(control =>
    keysFor(control, canonical).some(key => Object.hasOwn(record, key)));
}

function currentLevel(record, mechanic, role, canonical = false) {
  const [level, count, current] = mechanic.controls[role];
  const existing = explicitValue(record, current, canonical);
  if (existing) return existing.value;
  const oldCurrent = mechanic.oldCurrent && explicitValue(record, mechanic.oldCurrent[role], canonical);
  if (oldCurrent) return oldCurrent.value;
  const oldLevel = explicitValue(record, level, canonical);
  const oldCount = explicitValue(record, count, canonical);
  if (!oldLevel && !oldCount) return null;
  const derived = (oldLevel?.value ?? level.defaultValue) + mechanic.delta * (oldCount?.value ?? 0);
  if (mechanic === ABU) return Math.min(99, derived);
  // The old calculator blocked unknown lower bounds; do not invent a clamp.
  return Number.isSafeInteger(derived) && derived >= 1 && derived <= 99 ? derived : null;
}

function replaceLevel(record, mechanic, role, level, canonical = false) {
  const current = mechanic.controls[role][2];
  const next = { ...record };
  for (const control of legacyControls(mechanic, role)) {
    for (const key of keysFor(control, canonical)) delete next[key];
  }
  const key = canonical ? canonicalTraitControlKey(current) : current.id;
  next[key] = level;
  const entries = Object.entries(next);
  return entries.length === Object.keys(record).length && entries.every(([key, value]) => record[key] === value)
    ? record : next;
}

/** Read-only compatibility for former start/count and Abu's max99 current IDs. */
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
    // The new Abu ID wins in either projection. Only the old directly saved
    // current level can fall back to the incoming projection; start/count keeps
    // its historical outgoing-owner semantics and its 99-level cap.
    const outgoingContext = directions[outgoing].context, incomingContext = directions[incoming].context;
    const level = mechanic === ABU
      ? explicitValue(outgoingContext, mechanic.controls.attacker[2])?.value
        ?? explicitValue(incomingContext, mechanic.controls.defender[2])?.value
        ?? currentLevel(outgoingContext, mechanic, "attacker")
        ?? explicitValue(incomingContext, mechanic.oldCurrent.defender)?.value
        ?? null
      : currentLevel(outgoingContext, mechanic, "attacker");
    if (level === null) continue;
    for (const [direction, role] of [[outgoing, "attacker"], [incoming, "defender"]]) {
      const previous = directions[direction];
      const context = replaceLevel(previous.context, mechanic, role, level);
      if (context !== previous.context) directions = { ...directions, [direction]: { ...previous, context } };
    }
  }
  return directions === corrected.directions ? corrected : { ...corrected, directions };
}
