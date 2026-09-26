import { normalizeNegativeStatusSide } from "./negative-status.js";
import { getSkillEffectInputs } from "./skill-effects.js";
import { getSkillStatusEffectInputs } from "./skill-status-effects.js";

const BINDINGS = {
  enemyFreezeStacks: { status: "freeze" },
  enemyFrozen: { status: "freeze", boolean: true },
  enemyPoisonStacks: { status: "poison" },
  poisonStacks: { status: "poison" },
  enemyPoisoned: { status: "poison", boolean: true },
};
const SKILLS = ["碎冰冰", "极寒领域", "鸩毒", "过敏原", "以毒攻毒", "腐化", "不可接触"];
const CONTROLS = SKILLS.flatMap((name) => [
  ...getSkillEffectInputs({ name }), ...getSkillStatusEffectInputs({ name }),
]).filter((input) => BINDINGS[input.contextKey]);

// Write canonical keys as well as aliases: a saved editor value must not shadow shared state.
export function linkedNegativeStatusContext(state, sourceSide, context = {}) {
  if (state.calculationOptions?.includeNegativeStatusSettlement !== true) return context;
  const target = sourceSide === "attacker" ? "defender" : "attacker";
  const statuses = normalizeNegativeStatusSide(state.negativeStatuses?.[target]);
  const linked = { ...context };
  for (const [key, binding] of Object.entries(BINDINGS)) {
    linked[key] = binding.boolean ? statuses[binding.status] > 0 : statuses[binding.status];
  }
  for (const input of CONTROLS) linked[input.id] = linked[input.contextKey];
  return linked;
}

export function negativeStatusInputUpdate(state, sourceSide, skill, key, value) {
  if (state.calculationOptions?.includeNegativeStatusSettlement !== true) return null;
  const input = [...getSkillEffectInputs(skill), ...getSkillStatusEffectInputs(skill)]
    .find((control) => control.id === key || control.contextKey === key);
  const binding = BINDINGS[input?.contextKey];
  if (!binding) return null;
  const side = sourceSide === "attacker" ? "defender" : "attacker";
  const current = normalizeNegativeStatusSide(state.negativeStatuses?.[side])[binding.status];
  return {
    type: "negative-status/update", side, key: binding.status,
    // Checking presence keeps an existing count; otherwise starts at one layer.
    value: binding.boolean ? (value ? Math.max(1, current) : 0) : value,
  };
}
