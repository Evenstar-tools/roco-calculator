import { getTraitView } from "../domain/calculator-view-model.js";
import { canonicalTraitControlKey } from "../domain/trait-runtime.js";
import { sanitizeTriggerValues } from "../domain/trigger-controls.js";
import { getGoldChargeCountInput, getLegacyGoldChargeInputs } from "../features/s5-preview/charge-input-migration.js";
import { getSilverEnergySpentInput, getLegacySilverEnergyInput } from "../features/s5-preview/energy-input-migration.js";
import { correctS5PreviewDiceInputs, getLegacyS5DiceInput } from "../features/s5-preview/dice-input-migration.js";

export { canonicalTraitControlKey };

function controlsForRole(snapshot, spiritId, role) {
  const spirit = snapshot?.spirits?.find((entry) => entry.id === spiritId);
  const controls = (spirit ? getTraitView(snapshot, spirit, role)?.inputs ?? [] : [])
    .filter((control) => control.scope !== "battle");
  if (spiritId === "spirit_preview_s5_diliutun") return [
    ...controls.map(control => control.contextKey.endsWith("S5DiceFace") ? { ...control, defaultValue: undefined } : control),
    { ...getLegacyS5DiceInput(role), defaultValue: undefined },
  ];
  const silver = spiritId === "spirit_preview_s5_underground-silver-dragon";
  if (!silver && spiritId !== "spirit_preview_s5_gold-vein-dragon") return controls;
  const count = silver ? getSilverEnergySpentInput(role) : getGoldChargeCountInput(role);
  if (!controls.some(control => control.id === count.id)) return controls;
  // Persist unresolved old totals without showing old controls or inventing an
  // explicit zero that would bypass the runtime request to enter a charge count.
  return [
    ...controls.map(control => control.id === count.id ? { ...control, defaultValue: undefined } : control),
    ...(silver ? [getLegacySilverEnergyInput(role)] : getLegacyGoldChargeInputs(role)).map(control => ({ ...control, defaultValue: undefined })),
  ];
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
  if (control.contextKey.endsWith("S5CurrentMagicalAttackBonus")) return value;
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

  return correctS5PreviewDiceInputs({ spiritId: config.spiritId, traitValues: values }).traitValues;
}

export function materializeTraitContext(
  traitValues,
  snapshot,
  spiritId,
  role,
) {
  traitValues = correctS5PreviewDiceInputs({ spiritId, traitValues }).traitValues;
  const candidates = {};
  const controls = controlsForRole(snapshot, spiritId, role);
  for (const control of controls) {
    const canonicalKey = canonicalTraitControlKey(control);
    if (Object.hasOwn(traitValues ?? {}, canonicalKey)) {
      candidates[control.id] = traitValues[canonicalKey];
    }
  }
  const sanitized = sanitizeTriggerValues(candidates, controls);
  for (const control of controls) {
    if (control.contextKey.endsWith("S5CurrentMagicalAttackBonus") && Object.hasOwn(candidates, control.id)) {
      sanitized[control.id] = candidates[control.id];
    }
  }
  return sanitized;
}
