import {
  controlsAreSemanticallyEqual,
  normalizeTriggerControls,
  sanitizeTriggerValues,
} from "../domain/trigger-controls.js";

function normalizedControls(controls) {
  if (!Array.isArray(controls) || controls.length === 0) return [];
  const source = controls[0].source ?? "skill";
  return normalizeTriggerControls(controls, {
    scope: controls[0].scope,
    source,
  });
}

function readCandidate(context, control, legacyCounts) {
  if (Object.hasOwn(context, control.id)) return context[control.id];
  const legacyId = `${control.source}.${control.contextKey}`;
  if (
    legacyCounts.get(control.contextKey) === 1 &&
    (Object.hasOwn(context, legacyId) ||
      Object.hasOwn(context, control.contextKey))
  ) {
    return Object.hasOwn(context, legacyId)
      ? context[legacyId]
      : context[control.contextKey];
  }
  return control.defaultValue;
}

export function sanitizeTriggerContext(context = {}, controls = []) {
  const definitions = normalizedControls(controls);
  const legacyCounts = new Map();
  for (const control of definitions) {
    legacyCounts.set(
      control.contextKey,
      (legacyCounts.get(control.contextKey) ?? 0) + 1,
    );
  }
  const candidates = Object.fromEntries(
    definitions
      .map((control) => [
        control.id,
        readCandidate(context, control, legacyCounts),
      ])
      .filter(([, value]) => value !== undefined),
  );
  return sanitizeTriggerValues(candidates, definitions);
}

export function transitionTriggerContext(
  context = {},
  previousControls = [],
  nextControls = [],
) {
  const previous = normalizedControls(previousControls);
  const next = normalizedControls(nextControls);
  const previousValues = sanitizeTriggerContext(context, previous);
  const previousById = new Map(previous.map((control) => [control.id, control]));
  const candidates = {};
  for (const control of next) {
    const oldControl = previousById.get(control.id);
    const value =
      oldControl &&
      controlsAreSemanticallyEqual(oldControl, control) &&
      Object.hasOwn(previousValues, control.id)
        ? previousValues[control.id]
        : control.defaultValue;
    if (value !== undefined) candidates[control.id] = value;
  }
  return sanitizeTriggerContext(candidates, next);
}

export function removeTriggerControlValues(context = {}, controls = []) {
  const next = { ...context };
  for (const control of normalizedControls(controls)) {
    delete next[control.id];
    delete next[`${control.source}.${control.contextKey}`];
    delete next[control.contextKey];
  }
  return next;
}
