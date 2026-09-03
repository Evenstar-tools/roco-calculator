import { projectTriggerContext } from "./trigger-controls.js";

function canonicalRoleKey(value) {
  return String(value)
    .replace(/^attackerTrait/, "trait")
    .replace(/^defenderTrait/, "trait");
}

export function canonicalTraitControlKey(control) {
  const fingerprint = String(control?.id ?? "").split(".").at(-1);
  if (!control?.contextKey || !fingerprint) {
    throw new TypeError("特性控件缺少稳定语义标识");
  }
  return `trait.${canonicalRoleKey(control.contextKey)}.${fingerprint}`;
}

export function projectTraitRuntimeContext(
  context = {},
  trait = {},
  controls = [],
) {
  const stored = trait.runtimeInputValues ?? {};
  const instanceValues = {};
  for (const control of controls) {
    const canonicalKey = canonicalTraitControlKey(control);
    if (Object.hasOwn(stored, canonicalKey)) {
      instanceValues[control.id] = stored[canonicalKey];
    } else if (Object.hasOwn(stored, control.id)) {
      instanceValues[control.id] = stored[control.id];
    }
  }
  return projectTriggerContext(
    { ...context, ...instanceValues },
    controls,
  );
}
