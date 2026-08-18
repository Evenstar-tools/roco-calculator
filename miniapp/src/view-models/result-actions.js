import { canApplyBattleActivation } from "../shared/state/battle-activation.js";
import { resolveSkillStatusActivation } from "../shared/domain/skill-status-effects.js";
import { getSkill, getVisibleSkillInputs } from "./skills.js";
import { createSkillPresentation } from "./skill-presentation.js";

const EMPTY_ACTIONS = Object.freeze({
  defense: [],
  modifiers: [],
  status: [],
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
  if (
    operations.appliedNonDamageStatus === true ||
    Number(operations.healPercent ?? 0) !== 0
  ) return "status";
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

function skillAction(snapshot, state, side, candidate, calculation, traitViews) {
  const skill = getSkill(snapshot, candidate.entry);
  if (!skill) return null;
  const direction = side === "attacker" ? "forward" : "reverse";
  const context = candidate.mode === "single"
    ? state.directions[direction]?.context ?? {}
    : candidate.entry && typeof candidate.entry === "object"
      ? candidate.entry.context ?? {}
      : {};
  if (!canApplyBattleActivation(skill, context)) return null;
  const configuredSkills = (state.sides[side]?.skills?.four ?? [])
    .map((entry) => getSkill(snapshot, entry));
  const carriedSkills = candidate.mode === "single"
    ? [skill, ...configuredSkills]
    : configuredSkills;
  const result = calculation?.rows?.[candidate.slotIndex];
  const positiveMark = state.marks?.[side]?.positive;
  const presentation = createSkillPresentation({
    carriedSkills,
    context,
    currentIndex: candidate.slotIndex,
    includeGaleTurbineCompanion: candidate.mode === "four",
    result,
    skill,
    sproutStacks: positiveMark?.id === "sprout" ? positiveMark.stacks : 0,
    traitName: traitViews?.attacker?.name,
  });
  return {
    category: skillCategory(skill, context),
    context,
    controls: presentation.inputs ?? getVisibleSkillInputs(skill, context),
    description: skill.description ?? "应用该技能产生的战斗状态",
    effectHint: presentation.effectHint,
    key: `skill:${side}:${candidate.mode}:${candidate.slotIndex}`,
    kind: "skill",
    mode: candidate.mode,
    name: skill.name,
    side,
    slotIndex: candidate.slotIndex,
    source: "技能",
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
    { defense: [], modifiers: [], status: [] },
  );
}
