import { describe, expect, test } from "vitest";
import runtimeSnapshot from "../../public/data/runtime.json";
import { getTraitView } from "../../src/domain/calculator-view-model.js";
import {
  canonicalTraitControlKey,
  extractTraitValues,
  materializeTraitContext,
} from "../../src/state/trait-values.js";

function snapshot() {
  return {
    skills: [],
    spirits: [
      {
        id: "spirit-dimo",
        fullName: "圣冰迪莫",
        traitIds: ["trait-ignite"],
      },
    ],
    traits: [
      {
        id: "trait-ignite",
        name: "点燃",
        description: "每层增加双攻双防。",
      },
    ],
  };
}

describe("trait value persistence", () => {
  test("normalizes attacker trait values and restores them for the defender role", () => {
    const data = snapshot();
    const spirit = data.spirits[0];
    const attackerControls = getTraitView(data, spirit, "attacker").inputs;
    const defenderControls = getTraitView(data, spirit, "defender").inputs;
    const attackerStack = attackerControls.find(
      (control) => control.contextKey === "attackerTraitStacks",
    );
    const attackerEffect = attackerControls.find(
      (control) => control.contextKey === "attackerTraitEffect",
    );
    const attackerSpeedEffect = attackerControls.find(
      (control) => control.contextKey === "attackerTraitSpeedEffect",
    );
    const defenderStack = defenderControls.find(
      (control) => control.contextKey === "defenderTraitStacks",
    );
    const defenderEffect = defenderControls.find(
      (control) => control.contextKey === "defenderTraitEffect",
    );
    const defenderSpeedEffect = defenderControls.find(
      (control) => control.contextKey === "defenderTraitSpeedEffect",
    );

    const values = extractTraitValues(
      {
        spiritId: spirit.id,
        skills: {
          four: [null, null, null, null],
          single: {
            context: {
              [attackerEffect.id]: 20,
              [attackerStack.id]: 3,
              currentHpPercent: 1,
              weatherRainTurns: 8,
            },
            skillId: null,
          },
        },
      },
      data,
    );

    expect(values).toEqual({
      [canonicalTraitControlKey(attackerEffect)]: 20,
      [canonicalTraitControlKey(attackerStack)]: 3,
    });
    expect(canonicalTraitControlKey(attackerEffect)).toBe(
      canonicalTraitControlKey(defenderEffect),
    );
    expect(canonicalTraitControlKey(attackerStack)).toBe(
      canonicalTraitControlKey(defenderStack),
    );
    expect(canonicalTraitControlKey(attackerSpeedEffect)).toBe(
      canonicalTraitControlKey(defenderSpeedEffect),
    );
    expect(materializeTraitContext(values, data, spirit.id, "defender")).toEqual(
      {
        [defenderEffect.id]: 20,
        [defenderSpeedEffect.id]: 20,
        [defenderStack.id]: 3,
      },
    );
  });

  test("drops unknown and out-of-range trait values against the current snapshot", () => {
    const data = snapshot();
    const spirit = data.spirits[0];
    const attackerControls = getTraitView(data, spirit, "attacker").inputs;
    const attackerStack = attackerControls.find(
      (control) => control.contextKey === "attackerTraitStacks",
    );
    const attackerEffect = attackerControls.find(
      (control) => control.contextKey === "attackerTraitEffect",
    );
    const attackerSpeedEffect = attackerControls.find(
      (control) => control.contextKey === "attackerTraitSpeedEffect",
    );

    expect(
      materializeTraitContext(
        {
          [canonicalTraitControlKey(attackerEffect)]: 999,
          [canonicalTraitControlKey(attackerStack)]: 999,
          "trait.unknown.deadbeef": true,
        },
        data,
        spirit.id,
        "attacker",
      ),
    ).toEqual({
      [attackerEffect.id]: 500,
      [attackerSpeedEffect.id]: 20,
      [attackerStack.id]: 20,
    });
  });

  test("round-trips a stable boolean trait control", () => {
    const spirit = runtimeSnapshot.spirits.find(
      (candidate) => candidate.fullName === "霜翼领主",
    );
    const attackerControl = getTraitView(
      runtimeSnapshot,
      spirit,
      "attacker",
    ).inputs.find((control) => control.type === "boolean");
    const values = extractTraitValues({
      spiritId: spirit.id,
      traitValues: {
        [canonicalTraitControlKey(attackerControl)]: true,
      },
    }, runtimeSnapshot);

    expect(values).toEqual({
      [canonicalTraitControlKey(attackerControl)]: true,
    });
    const restored = materializeTraitContext(
      values,
      runtimeSnapshot,
      spirit.id,
      "attacker",
    );
    expect(restored[attackerControl.id]).toBe(true);
  });

  test("round-trips 契约的形状 choices across attack and defense roles", () => {
    const spirit = runtimeSnapshot.spirits.find(
      (candidate) => candidate.fullName === "陨星虫",
    );
    const attackerControls = getTraitView(
      runtimeSnapshot,
      spirit,
      "attacker",
    ).inputs;
    const defenderControls = getTraitView(
      runtimeSnapshot,
      spirit,
      "defender",
    ).inputs;
    const attackerBall = attackerControls.find(
      (control) => control.contextKey === "contractBallType",
    );
    const attackerPrism = attackerControls.find(
      (control) => control.contextKey === "contractPrismEffect",
    );
    const defenderBall = defenderControls.find(
      (control) => control.contextKey === "contractBallType",
    );
    const defenderPrism = defenderControls.find(
      (control) => control.contextKey === "contractPrismEffect",
    );
    const values = extractTraitValues({
      spiritId: spirit.id,
      traitValues: {
        [canonicalTraitControlKey(attackerBall)]: "prism",
        [canonicalTraitControlKey(attackerPrism)]: "darkstar",
      },
    }, runtimeSnapshot);

    expect(canonicalTraitControlKey(attackerBall)).toBe(
      canonicalTraitControlKey(defenderBall),
    );
    expect(canonicalTraitControlKey(attackerPrism)).toBe(
      canonicalTraitControlKey(defenderPrism),
    );
    expect(materializeTraitContext(
      values,
      runtimeSnapshot,
      spirit.id,
      "defender",
    )).toMatchObject({
      [defenderBall.id]: "prism",
      [defenderPrism.id]: "darkstar",
    });
  });
});
