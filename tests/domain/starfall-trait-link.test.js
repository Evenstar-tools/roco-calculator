import { describe, expect, test } from "vitest";
import { getTraitEffectInputs, resolveTraitEffectRule } from "../../src/domain/trait-effects.js";
import { normalizeMarkSlot } from "../../src/domain/marks.js";
import { canonicalTraitControlKey, linkStarfallTraitControls, projectTraitRuntimeContext } from "../../src/domain/trait-runtime.js";

describe("星陨特性统一印记来源", () => {
  test.each(["观星", "坠星"])("%s 的关联层数覆盖星陨印记 99 层上限", (name) => {
    const trait = { name };
    const controls = getTraitEffectInputs(trait, "attacker");
    const stacks = controls.find((control) => control.label === "敌方星陨层数");
    const mark = normalizeMarkSlot({ id: "starfall", stacks: 120 }, "negative");
    expect(mark.stacks).toBe(99);
    expect(stacks.max).toBe(99);
    const linked = linkStarfallTraitControls({}, controls, mark.stacks);
    expect(projectTraitRuntimeContext(linked, trait, controls)[stacks.contextKey]).toBe(99);
    for (const count of [20, 21, 99]) {
      const effect = resolveTraitEffectRule(trait, "attacker", {
        attacker: {},
        context: { attackerEnemyStarfallStacks: count },
        defender: {},
        skill: { category: "physical", type: "地" },
      });
      expect(effect.powerMultiplier).toBeCloseTo(1 + count * 0.2);
    }
  });

  test.each(["坠星", "观星", "宇宙之眼"])("%s 忽略独立旧层数，保留手动每层加成", (name) => {
    const trait = { name };
    const controls = getTraitEffectInputs(trait, "attacker");
    const stacks = controls.find((control) => control.label === "敌方星陨层数");
    expect(stacks).toBeDefined();
    trait.runtimeInputValues = { [canonicalTraitControlKey(stacks)]: 9 };
    const context = { [stacks.id]: 7, attackerEnemyStarfallStacks: 3, defenderEnemyStarfallStacks: 1 };
    expect(projectTraitRuntimeContext(context, trait, controls)[stacks.contextKey]).toBe(3);
    expect(linkStarfallTraitControls(context, controls, 3)[stacks.id]).toBe(3);
    expect(projectTraitRuntimeContext({ ...context, attackerEnemyStarfallStacks: 0 }, trait, controls)[stacks.contextKey]).toBe(0);
    const effect = controls.find((control) => control.label === "每层威力");
    if (effect) {
      context[effect.id] = 35;
      expect(projectTraitRuntimeContext(context, trait, controls)[effect.contextKey]).toBe(35);
    }
  });

  test("防御方宇宙之眼读取攻击方身上的星陨", () => {
    const trait = { name: "宇宙之眼" };
    const controls = getTraitEffectInputs(trait, "defender");
    const stacks = controls.find((control) => control.label === "敌方星陨层数");
    expect(projectTraitRuntimeContext({ attackerEnemyStarfallStacks: 8, defenderEnemyStarfallStacks: 2 }, trait, controls)[stacks.contextKey]).toBe(2);
  });
});
