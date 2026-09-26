import { expect, test } from "vitest";
import snapshot from "../../data/snapshots/current.json";
import { getSkillEffectInputs } from "../../src/domain/skill-effects.js";
import { getSkillStatusEffectInputs, resolveSkillStatusActivation } from "../../src/domain/skill-status-effects.js";
import { linkedNegativeStatusContext, negativeStatusInputUpdate } from "../../src/domain/negative-status-context.js";

test.each(["碎冰冰", "极寒领域", "鸩毒", "过敏原", "以毒攻毒", "腐化", "不可接触"])("%s 状态关联覆盖 canonical、反向对应正确且关闭不丢独立值", (name) => {
  const skill = snapshot.skills.find((entry) => entry.name === name);
  const input = [...getSkillEffectInputs(skill), ...getSkillStatusEffectInputs(skill)]
    .find((control) => /enemyFreezeStacks|enemyFrozen|enemyPoisonStacks|enemyPoisoned|poisonStacks/.test(control.contextKey));
  const state = { calculationOptions: { includeNegativeStatusSettlement: true }, negativeStatuses: {
    attacker: { freeze: 99, poison: 99 }, defender: { freeze: 3, poison: 3 },
  } };
  const manual = { [input.contextKey]: input.type === "boolean" ? false : 7, [input.id]: input.type === "boolean" ? false : 7 };
  const linked = linkedNegativeStatusContext(state, "attacker", manual);
  expect(linked[input.id]).toBe(input.type === "boolean" ? true : 3);
  expect(linkedNegativeStatusContext(state, "defender", manual)[input.id]).toBe(input.type === "boolean" ? true : 99);
  const key = /Freeze|Frozen/.test(input.contextKey) ? "freeze" : "poison";
  expect(negativeStatusInputUpdate(state, "attacker", skill, input.id, input.type === "boolean" ? true : 50))
    .toEqual({ type: "negative-status/update", side: "defender", key, value: input.type === "boolean" ? 3 : 50 });
  expect(negativeStatusInputUpdate(state, "defender", skill, input.contextKey, input.type === "boolean" ? false : 0)?.value).toBe(0);
  if (name === "以毒攻毒") expect(resolveSkillStatusActivation(skill, linked).deltas.ownAttack).toBe(9);
  if (name === "腐化") expect(resolveSkillStatusActivation(skill, linked).deltas.targetAttack).toBe(-9);
  if (name === "不可接触") expect(resolveSkillStatusActivation(skill, linked).operations.defenseReductionPercent).toBe(80);
  state.calculationOptions.includeNegativeStatusSettlement = false;
  expect(linkedNegativeStatusContext(state, "attacker", manual)).toBe(manual);
  expect(negativeStatusInputUpdate(state, "attacker", skill, input.id, 3)).toBeNull();
});
