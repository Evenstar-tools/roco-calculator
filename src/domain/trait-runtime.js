import { projectTriggerContext } from "./trigger-controls.js";

export function isEnemyStarfallTraitControl(control) {
  return control?.type === "number" && control.label === "敌方星陨层数";
}

export function linkStarfallTraitControls(context, controls, stacks) {
  const linked = { ...context };
  for (const control of controls) {
    if (isEnemyStarfallTraitControl(control)) linked[control.id] = stacks;
  }
  return linked;
}

export function linkEnemyCostTraitControls(context, controls, totalCost) {
  const automatic = controls.find((control) => control.contextKey === "enemyTotalSkillCostAuto");
  const cost = controls.find((control) => control.contextKey === "enemyTotalSkillCost");
  if (!automatic || !cost || projectTriggerContext(context, controls).enemyTotalSkillCostAuto === false) return context;
  return { ...context, [cost.id]: totalCost };
}

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
    const markStacks = control.source === "defenderTrait"
      ? context.defenderEnemyStarfallStacks
      : context.attackerEnemyStarfallStacks;
    if (isEnemyStarfallTraitControl(control) && markStacks !== undefined) {
      instanceValues[control.id] = markStacks;
    }
  }
  const projected = projectTriggerContext(
    { ...context, ...instanceValues },
    controls,
  );
  if (projected.enemyTotalSkillCostAuto === true && context.automaticEnemyTotalSkillCost !== undefined) {
    projected.enemyTotalSkillCost = context.automaticEnemyTotalSkillCost;
  }
  return projected;
}
