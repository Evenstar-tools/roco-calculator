import { getTraitView } from "../domain/calculator-view-model.js";
import { canonicalTraitControlKey } from "../domain/trait-runtime.js";
import { sanitizeTriggerValues } from "../domain/trigger-controls.js";

export { canonicalTraitControlKey };

function controlsForRole(snapshot, spiritId, role) {
  const spirit = snapshot?.spirits?.find((entry) => entry.id === spiritId);
  return (spirit ? getTraitView(snapshot, spirit, role)?.inputs ?? [] : [])
    .filter((control) => control.scope !== "battle");
}

function contextsFromConfig(config) {
  const entries = [
    config?.skills?.single,
    ...(config?.skills?.four ?? []),
  ].filter((entry) => entry && typeof entry === "object");
  return entries.flatMap((entry) => [
    entry.context ?? {},
    ...Object.values(entry.memoryBySkill ?? {}).map(
      (memory) => memory?.context ?? {},
    ),
  ]);
}

function explicitControlValue(context, control) {
  for (const key of [
    control.id,
    `${control.source}.${control.contextKey}`,
    control.contextKey,
  ]) {
    if (Object.hasOwn(context, key)) return { found: true, value: context[key] };
  }
  return { found: false, value: undefined };
}

function sanitizeOne(control, value) {
  const standaloneControl = control.visibleWhen
    ? { ...control, visibleWhen: undefined }
    : control;
  return sanitizeTriggerValues(
    { [standaloneControl.id]: value },
    [standaloneControl],
  )[standaloneControl.id];
}

export function extractTraitValues(config, snapshot) {
  if (!config?.spiritId || !snapshot) return {};
  const values = {};
  const stored = config.traitValues ?? {};
  const contexts = contextsFromConfig(config);

  for (const role of ["attacker", "defender"]) {
    for (const control of controlsForRole(snapshot, config.spiritId, role)) {
      const canonicalKey = canonicalTraitControlKey(control);
      if (Object.hasOwn(stored, canonicalKey)) {
        const sanitized = sanitizeOne(control, stored[canonicalKey]);
        if (sanitized !== undefined) values[canonicalKey] = sanitized;
      }
      for (const context of contexts) {
        const candidate = explicitControlValue(context, control);
        if (!candidate.found) continue;
        const sanitized = sanitizeOne(control, candidate.value);
        if (sanitized !== undefined) values[canonicalKey] = sanitized;
      }
    }
  }

  return values;
}

export function materializeTraitContext(
  traitValues,
  snapshot,
  spiritId,
  role,
) {
  const candidates = {};
  const controls = controlsForRole(snapshot, spiritId, role);
  for (const control of controls) {
    const canonicalKey = canonicalTraitControlKey(control);
    if (Object.hasOwn(traitValues ?? {}, canonicalKey)) {
      candidates[control.id] = traitValues[canonicalKey];
    }
  }
  return sanitizeTriggerValues(candidates, controls);
}
