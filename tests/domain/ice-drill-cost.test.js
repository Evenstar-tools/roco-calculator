import { expect, test } from "vitest";
import { getTraitEffectInputs } from "../../src/domain/trait-effects.js";
import { canonicalTraitControlKey, linkEnemyCostTraitControls, projectTraitRuntimeContext } from "../../src/domain/trait-runtime.js";
import { carriedSkillTotalCost } from "../../src/domain/skill-result/loadout.js";

test("冰钻默认自动总能耗，可手动覆盖为零并恢复自动", () => {
  const trait = { name: "冰钻" };
  const controls = getTraitEffectInputs(trait);
  const cost = controls.find((item) => item.contextKey === "enemyTotalSkillCost");
  const auto = controls.find((item) => item.contextKey === "enemyTotalSkillCostAuto");
  trait.runtimeInputValues = { [canonicalTraitControlKey(cost)]: 0 };
  const context = { automaticEnemyTotalSkillCost: 13 };
  expect(projectTraitRuntimeContext(context, trait, controls).enemyTotalSkillCost).toBe(13);
  expect(linkEnemyCostTraitControls({}, controls, 13)[cost.id]).toBe(13);
  trait.runtimeInputValues[canonicalTraitControlKey(auto)] = false;
  expect(projectTraitRuntimeContext(context, trait, controls).enemyTotalSkillCost).toBe(0);
  trait.runtimeInputValues[canonicalTraitControlKey(cost)] = 8;
  expect(projectTraitRuntimeContext({ automaticEnemyTotalSkillCost: 20 }, trait, controls).enemyTotalSkillCost).toBe(8);
  trait.runtimeInputValues[canonicalTraitControlKey(auto)] = true;
  expect(projectTraitRuntimeContext({ automaticEnemyTotalSkillCost: 20 }, trait, controls).enemyTotalSkillCost).toBe(20);
});

test("总能耗优先四个携带槽，空槽忽略，不额外加入单技能", () => {
  const skills = { a: { id: "a", cost: 3 }, b: { id: "b", cost: 5 }, single: { id: "single", cost: 9 } };
  expect(carriedSkillTotalCost({ skills: { four: ["a", "b", null, "a"], single: "single" } }, "single", skills)).toBe(11);
  expect(carriedSkillTotalCost({ skills: { single: "single" } }, "single", skills)).toBe(9);
});
