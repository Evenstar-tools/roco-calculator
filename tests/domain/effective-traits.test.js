import { describe, expect, test } from "vitest";
import { getEffectiveTraits } from "../../src/domain/effective-traits.js";
import { resolveCombatant } from "../../src/domain/skill-result/loadout.js";
import {
  getTraitEffectInputs,
  resolveBeastFlowerBloodlineTrait,
  resolveContractShapeTrait,
  resolveTraitEffectRule,
} from "../../src/domain/trait-effects.js";
import { resolveTraitHitCountBonus } from "../../src/domain/trait-hit-count.js";
import { canonicalTraitControlKey } from "../../src/domain/trait-runtime.js";
import { resolveTraitMultipliers } from "../../src/domain/traits.js";

describe("getEffectiveTraits", () => {
  test("keeps the native Moon Memory trait and deduplicates acquired traits with isolated values", () => {
    const snapshot = {
      traits: [
        { id: "moon-memory", name: "铭记于月亮" },
        { id: "old-toy", name: "旧玩具" },
        { id: "cold-light", name: "冷光源" },
      ],
    };
    const spirit = {
      id: "silver-moon-wolf",
      traitIds: ["moon-memory"],
    };
    const traits = getEffectiveTraits(snapshot, {
      acquiredTraitIds: ["old-toy", "cold-light", "old-toy"],
      acquiredTraitValues: {
        "old-toy": { "trait.stacks.old-toy": 2 },
        "cold-light": { "trait.active.cold-light": true },
      },
      spirit,
    });

    expect(traits.map(({ id }) => id)).toEqual([
      "moon-memory",
      "old-toy",
      "cold-light",
    ]);
    expect(traits[0]).not.toHaveProperty("runtimeInputValues");
    expect(traits[1]).toMatchObject({
      acquired: true,
      runtimeInputValues: { "trait.stacks.old-toy": 2 },
    });
    expect(traits[2]).toMatchObject({
      acquired: true,
      runtimeInputValues: { "trait.active.cold-light": true },
    });
  });

  test("uses each acquired trait's isolated control value during calculation", () => {
    const moonMemory = { id: "moon-memory", name: "铭记于月亮" };
    const intimidation = { id: "intimidation", name: "威慑" };
    const embolden = { id: "embolden", name: "壮胆" };
    const sharedControl = getTraitEffectInputs(
      intimidation,
      "attacker",
    )[0];
    const sharedControlId = sharedControl.id;
    const sharedCanonicalKey = canonicalTraitControlKey(sharedControl);
    expect(getTraitEffectInputs(embolden, "attacker")[0].id).toBe(
      sharedControlId,
    );

    const attackerTraits = getEffectiveTraits(
      { traits: [moonMemory, intimidation, embolden] },
      {
        acquiredTraitIds: ["intimidation", "embolden"],
        acquiredTraitValues: {
          intimidation: { [sharedCanonicalKey]: true },
          embolden: { [sharedCanonicalKey]: false },
        },
        spirit: { traitIds: [moonMemory.id] },
      },
    );
    const result = resolveTraitMultipliers({
      attacker: { panelStats: { speed: 100 }, types: ["武"] },
      attackerTraits,
      context: {},
      defender: { panelStats: { speed: 80 }, types: ["普通"] },
      defenderTraits: [],
      skill: { category: "physical", cost: 2, type: "武" },
    });

    expect(result).toMatchObject({
      attackMultiplier: 1.3,
      status: "exact",
    });
  });

  test("ignores injected acquired traits when the owner lacks Moon Memory", () => {
    const oldToy = { id: "old-toy", name: "旧玩具" };
    expect(
      getEffectiveTraits(
        { traits: [oldToy] },
        {
          acquiredTraitIds: [oldToy.id],
          spirit: { id: "ordinary-spirit", traitIds: [] },
        },
      ),
    ).toEqual([]);
  });

  test("applies only the first five acquired traits even for raw calculation input", () => {
    const moonMemory = { id: "moon-memory", name: "铭记于月亮" };
    const acquired = Array.from({ length: 6 }, (_, index) => ({
      id: `trait-${index + 1}`,
      name: `特性${index + 1}`,
    }));
    const traits = getEffectiveTraits(
      { traits: [moonMemory, ...acquired] },
      {
        acquiredTraitIds: acquired.map(({ id }) => id),
        spirit: { traitIds: [moonMemory.id] },
      },
    );

    expect(traits.map(({ id }) => id)).toEqual([
      moonMemory.id,
      "trait-1",
      "trait-2",
      "trait-3",
      "trait-4",
      "trait-5",
    ]);
  });

  test("does not unlock acquisition through injected side traits", () => {
    const moonMemory = { id: "moon-memory", name: "铭记于月亮" };
    const oldToy = { id: "old-toy", name: "旧玩具" };
    const traits = getEffectiveTraits(
      { traits: [moonMemory, oldToy] },
      {
        acquiredTraitIds: [oldToy.id],
        spirit: { id: "ordinary-spirit", traitIds: [] },
        traits: [moonMemory],
      },
    );

    expect(traits.map(({ id }) => id)).toEqual([moonMemory.id]);
  });

  test("loads acquired traits into the combatant used by matchup calculations", () => {
    const moonMemory = { id: "moon-memory", name: "铭记于月亮" };
    const oldToy = { id: "old-toy", name: "旧玩具" };
    const spirit = {
      id: "silver-moon-wolf",
      traitIds: [moonMemory.id],
      types: ["幽", "幻"],
    };
    const combatant = resolveCombatant(
      { traits: [moonMemory, oldToy] },
      {
        acquiredTraitIds: [oldToy.id],
        panelStats: { hp: 500, speed: 400 },
        skills: { single: null },
        spirit,
      },
      "single",
      {
        skills: {},
        spirits: { [spirit.id]: spirit },
        traits: { [moonMemory.id]: moonMemory, [oldToy.id]: oldToy },
      },
    );

    expect(combatant.traits.map(({ id }) => id)).toEqual([
      moonMemory.id,
      oldToy.id,
    ]);
  });

  test("uses isolated acquired values in special hit-count resolvers", () => {
    const moonMemory = { id: "moon-memory", name: "铭记于月亮" };
    const windCombo = { id: "wind-combo", name: "乘风连击" };
    const values = Object.fromEntries(
      getTraitEffectInputs(windCombo, "attacker").map((control) => [
        canonicalTraitControlKey(control),
        control.contextKey === "windSkillUseCount" ? 3 : true,
      ]),
    );
    const traits = getEffectiveTraits(
      { traits: [moonMemory, windCombo] },
      {
        acquiredTraitIds: [windCombo.id],
        acquiredTraitValues: { [windCombo.id]: values },
        spirit: { traitIds: [moonMemory.id] },
      },
    );

    expect(
      resolveTraitHitCountBonus({
        context: {},
        skill: {
          category: "physical",
          description: "造成物伤，2连击。",
          type: "翼",
        },
        traits,
      }),
    ).toMatchObject({ hitCountAdd: 3 });
  });

  test("reuses one canonical acquired value in attacker and defender roles", () => {
    const universeEye = { id: "universe-eye", name: "宇宙之眼" };
    const attackerControl = getTraitEffectInputs(universeEye, "attacker")[0];
    const defenderControl = getTraitEffectInputs(universeEye, "defender")[0];
    const canonicalKey = canonicalTraitControlKey(attackerControl);
    expect(canonicalTraitControlKey(defenderControl)).toBe(canonicalKey);
    const acquired = {
      ...universeEye,
      runtimeInputValues: { [canonicalKey]: 3 },
    };

    expect(resolveTraitEffectRule(acquired, "attacker", {}))
      .toMatchObject({ attackerDefenseLevelBonus: 3 });
    expect(resolveTraitEffectRule(acquired, "defender", {}))
      .toMatchObject({ defenderDefenseLevelBonus: 3 });
  });

  test("projects isolated values into complex acquired trait resolvers", () => {
    const beast = { id: "beast-flower", name: "稀兽花宝" };
    const beastValues = Object.fromEntries(
      getTraitEffectInputs(beast, "attacker").map((control) => [
        canonicalTraitControlKey(control),
        control.contextKey === "bloodlineType" ? "wing" : true,
      ]),
    );
    const contract = { id: "contract-shape", name: "契约的形状" };
    const contractValues = Object.fromEntries(
      getTraitEffectInputs(contract, "attacker").map((control) => [
        canonicalTraitControlKey(control),
        control.contextKey === "contractBallType" ? "sand" : "",
      ]),
    );
    const skill = {
      category: "physical",
      description: "造成物伤，2连击。",
      type: "翼",
    };

    expect(resolveBeastFlowerBloodlineTrait({
      context: {},
      role: "attacker",
      skill,
      traits: [{ ...beast, runtimeInputValues: beastValues }],
    })).toMatchObject({ active: true, bloodlineType: "wing", hitCountAdd: 3 });
    expect(resolveContractShapeTrait({
      context: {},
      role: "attacker",
      skill,
      traits: [{ ...contract, runtimeInputValues: contractValues }],
    })).toMatchObject({ active: true, ballType: "sand", hitCountAdd: 2 });
  });
});
