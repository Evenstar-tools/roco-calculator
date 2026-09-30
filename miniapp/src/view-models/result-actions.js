import { canApplyBattleActivation, canToggleNegativeStatusActivation } from "../shared/state/battle-activation.js";
import {
  getStatusSkillTriggerPreview,
  hasStatusHitCountCoefficient,
  isPureStatusSkill,
  resolveSkillStatusActivation,
} from "../shared/domain/skill-status-effects.js";
import { getDefaultHitCount } from "../shared/domain/skill-effects.js";
import { resolveBattleSpirit } from "../shared/domain/battle-form.js";
import { getEffectiveTraits } from "../shared/domain/effective-traits.js";
import { linkedNegativeStatusContext } from "../shared/domain/negative-status-context.js";
import { getSkill, getVisibleSkillInputs } from "./skills.js";
import { createSkillPresentation } from "./skill-presentation.js";

const EMPTY_ACTIONS = Object.freeze({
  defense: [],
  modifiers: [],
});

function activeSideForDirection(direction) {
  return direction === "reverse" ? "defender" : "attacker";
}

function skillCategory(skill, context) {
  const resolution = resolveSkillStatusActivation(skill, context) ?? {};
  const deltas = resolution.deltas ?? {};
  const operations = resolution.operations ?? {};
  if (
    skill.category === "defense" ||
    Number(deltas.ownDefense ?? 0) !== 0 ||
    Number(operations.defenseReductionPercent ?? 0) !== 0
  ) return "defense";
  return "modifiers";
}

function skillEntries(state, side) {
  if (state.mode === "single") {
    return [{ entry: state.sides[side].skills.single, mode: "single", slotIndex: 0 }];
  }
  return (state.sides[side].skills.four ?? []).map((entry, slotIndex) => ({
    entry,
    mode: "four",
    slotIndex,
  }));
}

function isDefenseCounterControl(control) {
  const key = control?.contextKey ?? control?.key ?? control?.id;
  return key === "defenseCounterSucceeded" ||
    key === "counterDefenseSucceeded";
}

function skillTriggerHint(skill, controls, result, statusPreview) {
  if (isPureStatusSkill(skill)) {
    if (!statusPreview) return "状态触发后按当前条件结算效果";
    if (statusPreview.repeatable) {
      const repeatHint = `已按 ${statusPreview.count} 次触发预览`;
      return statusPreview.hitCountConfigurable
        ? `${repeatHint} · 每次 ${statusPreview.hitCount} 连击`
        : repeatHint;
    }
    return "状态触发后按当前条件结算效果";
  }
  if (skill.category === "defense") {
    return controls.some(isDefenseCounterControl)
      ? "防御应对成功时附加增益；减伤按本次应对结算"
      : "防御技能触发后按本次应对结算";
  }
  const hitCount = Math.max(
    1,
    Math.floor(Number(result?.hitCount ?? getDefaultHitCount(skill)) || 1),
  );
  return hitCount > 1 ? `伤害按 ${hitCount} 段连击分别结算` : null;
}

function traitTriggerHint(controls) {
  const counter = controls.find(isDefenseCounterControl);
  if (counter) return `满足“${counter.label}”后按当前参数结算`;
  const boolean = controls.find((control) => control.type === "boolean");
  return boolean
    ? `开启“${boolean.label}”后按当前参数结算`
    : "满足特性条件后按当前参数结算";
}

function skillAction(snapshot, state, side, candidate, calculation, traitViews) {
  const skill = getSkill(snapshot, candidate.entry);
  if (!skill) return null;
  const direction = side === "attacker" ? "forward" : "reverse";
  const context = candidate.mode === "single"
    ? state.directions[direction]?.context ?? {}
    : candidate.entry && typeof candidate.entry === "object"
      ? candidate.entry.context ?? {}
      : {};
  const result = calculation?.rows?.[candidate.slotIndex];
  const configuredSkills = (state.sides[side]?.skills?.four ?? [])
    .map((entry) => getSkill(snapshot, entry));
  const carriedSkills = candidate.mode === "single"
    ? [skill, ...configuredSkills]
    : configuredSkills;
  const positiveMark = state.marks?.[side]?.positive;
  const targetNegativeMark = state.marks?.[side === "attacker" ? "defender" : "attacker"]?.negative;
  const applicationContext = linkedNegativeStatusContext(state, side, {
    targetPoisonMarkStacks: targetNegativeMark?.id === "poison" ? targetNegativeMark.stacks : 0,
    ...state.directions[direction]?.context,
    ...context,
  });
  const presentation = createSkillPresentation({
    baselineStatuses: state.negativeStatuses?.[side === "attacker" ? "defender" : "attacker"],
    carriedSkills,
    context,
    currentIndex: candidate.slotIndex,
    includeGaleTurbineCompanion: candidate.mode === "four",
    negativeStatusEnabled: state.calculationOptions?.includeNegativeStatusSettlement === true,
    negativeStatusContext: applicationContext,
    result,
    skill,
    sproutStacks: positiveMark?.id === "sprout" ? positiveMark.stacks : 0,
    traitName: traitViews?.attacker?.name,
    traits: getEffectiveTraits(snapshot, {
      ...state.sides[side],
      spirit: resolveBattleSpirit(snapshot, state.sides[side]),
    }),
  });
  const activationOptions = {
    negativeStatusEnabled: state.calculationOptions?.includeNegativeStatusSettlement === true,
    negativeStatusCanApply: result?.negativeStatusCanApply === true || presentation.negativeStatusApplication,
    postAttackEffects: result?.postAttackEffects,
  };
  const targetDirection = direction === "forward" ? "reverse" : "forward";
  const hasTransientDefense = Boolean(state.directions[direction]?.overrides?.activeDefenseStatus ||
    Number(state.directions[targetDirection]?.reduction ?? 1) !== 1);
  if (!hasTransientDefense && !canApplyBattleActivation(skill, applicationContext, activationOptions)) return null;
  const configuredHitCount = candidate.mode === "single"
    ? state.directions[direction]?.hitCount ?? 1
    : candidate.entry?.hitCount ?? 1;
  const configuredStatusTriggerCount = candidate.mode === "single"
    ? state.directions[direction]?.statusTriggerCount
    : candidate.entry?.statusTriggerCount;
  const legacyStatusTriggerCount = hasStatusHitCountCoefficient(skill)
    ? 1
    : configuredHitCount;
  const statusPreview = getStatusSkillTriggerPreview(skill, {
    context: { ...context, choiceTrait: presentation.choiceTrait },
    hitCount: configuredHitCount,
    triggerCount: configuredStatusTriggerCount ?? legacyStatusTriggerCount,
  });
  const controls = presentation.inputs ?? getVisibleSkillInputs(skill, context);
  const statusEffectHint = [
    statusPreview?.cumulativeEffect === "待满足触发条件" ? null : statusPreview?.cumulativeEffect,
    presentation.negativeStatusEffectHint,
  ].filter(Boolean).join(" · ") || statusPreview?.cumulativeEffect;
  return {
    category: skillCategory(skill, context),
    context,
    controls,
    description: skill.description ?? "应用该技能产生的战斗状态",
    effectHint: isPureStatusSkill(skill)
      ? statusEffectHint || presentation.effectHint
      : presentation.effectHint,
    ...(presentation.usageSummary ? { usageSummary: presentation.usageSummary, usage: presentation.usage, usageDetails: presentation.usageDetails } : {}),
    key: `skill:${side}:${candidate.mode}:${candidate.slotIndex}`,
    kind: "skill",
    mode: candidate.mode,
    negativeStatusApplication: presentation.negativeStatusApplication,
    negativeStatusToggle: canToggleNegativeStatusActivation(skill, applicationContext, activationOptions),
    name: skill.name,
    side,
    slotIndex: candidate.slotIndex,
    source: "技能",
    triggerHint: skillTriggerHint(skill, controls, result, statusPreview),
  };
}

function traitControlValue(state, direction, view, control) {
  if (control.scope === "battle") {
    return state.directions[direction]?.context?.[control.id] ??
      control.defaultValue;
  }
  return state.sides[view.ownerSide]?.traitValues?.[control.canonicalKey] ??
    control.defaultValue;
}

function traitActions(state, direction, traitViews) {
  return Object.entries(traitViews ?? {}).flatMap(([role, view]) => {
    if (!view) return [];
    const controls = view.controls ?? [];
    if (!controls.length) return [];
    const values = Object.fromEntries(
      controls.map((control) => [
        control.canonicalKey,
        traitControlValue(state, direction, view, control),
      ]),
    );
    const control = controls.length === 1 && controls[0].type === "boolean"
      ? controls[0]
      : null;
    return [{
      category: role === "defender" ? "defense" : "modifiers",
      control,
      controls,
      description: view.description ?? controls[0].label,
      key: `trait:${view.ownerSide}:${role}:${controls
        .map((item) => item.canonicalKey)
        .join("|")}`,
      kind: "trait",
      name: view.name,
      role,
      side: view.ownerSide,
      source: "特性",
      triggerHint: traitTriggerHint(controls),
      value: control ? values[control.canonicalKey] : undefined,
      values,
    }];
  });
}

export function createResultActions({
  calculation,
  direction,
  snapshot,
  state,
  traitViews,
}) {
  if (!snapshot || !state) return EMPTY_ACTIONS;
  const side = activeSideForDirection(direction);
  const actions = [
    ...skillEntries(state, side)
      .map((candidate) => skillAction(
        snapshot,
        state,
        side,
        candidate,
        calculation,
        traitViews,
      ))
      .filter(Boolean),
    ...traitActions(state, direction, traitViews),
  ];
  return actions.reduce(
    (grouped, action) => {
      grouped[action.category].push(action);
      return grouped;
    },
    { defense: [], modifiers: [] },
  );
}
