import { describe, expect, test } from "vitest";
import {
  applyBalanceTraitTrigger,
  applyBattleActivation,
} from "../../src/state/battle-activation.js";
import { createInitialState } from "../../src/state/defaults.js";
import { calculatorReducer } from "../../src/state/reducer.js";

function createSnapshot() {
  return {
    meta: { id: "test-data", rulesVersion: "test-rules" },
    spirits: [
      {
        id: "attacker",
        fullName: "测试攻方",
        raceStats: {
          hp: 100,
          magicalAttack: 100,
          magicalDefense: 100,
          physicalAttack: 100,
          physicalDefense: 100,
          speed: 100,
        },
        traitIds: [],
        types: ["普通"],
      },
      {
        id: "defender",
        fullName: "测试守方",
        raceStats: {
          hp: 100,
          magicalAttack: 100,
          magicalDefense: 100,
          physicalAttack: 100,
          physicalDefense: 100,
          speed: 100,
        },
        traitIds: [],
        types: ["普通"],
      },
    ],
    skills: [
      {
        basePower: 0,
        category: "status",
        id: "steam-march",
        name: "蒸汽进行曲",
        type: "机械",
      },
      {
        basePower: 35,
        category: "physical",
        id: "scratch",
        name: "抓挠",
        type: "普通",
      },
      {
        basePower: 0,
        category: "status",
        id: "warm-up",
        name: "热身运动",
        type: "普通",
      },
      {
        basePower: 0,
        category: "status",
        id: "opportunity",
        name: "伺机而动",
        type: "普通",
      },
      {
        basePower: 0,
        category: "defense",
        description: "减伤80%。",
        id: "test-shield",
        name: "测试盾",
        type: "水",
      },
      {
        basePower: 0,
        category: "status",
        description: "敌方获得2层星陨印记。",
        id: "mark-skill",
        name: "星印",
        type: "幻",
      },
      {
        basePower: 0,
        category: "status",
        id: "refraction",
        name: "折射",
        type: "光",
      },
      {
        basePower: 40,
        category: "magical",
        id: "grass-skill",
        name: "草系攻击",
        type: "草",
      },
      {
        basePower: 40,
        category: "magical",
        id: "illusion-skill",
        name: "幻系攻击",
        type: "幻",
      },
      {
        basePower: 0,
        category: "status",
        id: "friendship",
        name: "友谊满溢",
        type: "普通",
      },
    ],
    traits: [],
    typeChart: { matrix: [[1]], types: ["普通"] },
  };
}

describe("shared battle activation", () => {
  test("copies the opponent positive ability stages when Balance triggers", () => {
    const state = createInitialState(createSnapshot());
    state.directions.forward.overrides = {
      attackLevelStage: 8,
      defenseLevelStage: 3,
    };
    state.directions.reverse.overrides = {
      attackLevelStage: 6,
      defenseLevelStage: 4,
    };

    const next = applyBalanceTraitTrigger({ side: "defender", state });

    expect(next.directions.reverse.overrides.attackLevelStage).toBe(14);
    expect(next.directions.forward.overrides.defenseLevelStage).toBe(7);
  });

  test("stores battle-scoped trait controls in the active direction and mirrors roles", () => {
    const snapshot = createSnapshot();
    const state = createInitialState(snapshot);
    const next = calculatorReducer(state, {
      direction: "forward",
      key: "attackerTrait.indiscriminateFilterActivated.12345678",
      type: "battle/set-trait-control",
      value: true,
    });

    expect(next.directions.forward.context).toMatchObject({
      "attackerTrait.indiscriminateFilterActivated.12345678": true,
    });
    expect(next.directions.reverse.context).toMatchObject({
      "defenderTrait.indiscriminateFilterActivated.12345678": true,
    });
    expect(next.sides.attacker.traitValues).toEqual({});
  });

  test("updates rain globally for both calculation directions", () => {
    const state = createInitialState(createSnapshot());
    const next = calculatorReducer(state, {
      type: "battle/set-rain",
      value: 5,
    });

    expect(next.directions.forward.context.weatherRainTurns).toBe(5);
    expect(next.directions.reverse.context.weatherRainTurns).toBe(5);
  });

  test("applies a desktop status skill to persistent attack and speed state", () => {
    const snapshot = createSnapshot();
    const state = createInitialState(snapshot);
    state.sides.attacker.spiritId = "attacker";
    state.sides.defender.spiritId = "defender";
    state.sides.attacker.skills.four = [
      {
        context: { applyAttackBoost: true, applySpeedBoost: true },
        skillId: "steam-march",
      },
      "scratch",
      null,
      null,
    ];

    const result = applyBattleActivation({
      calculation: { forward: { results: [] } },
      side: "attacker",
      skillIndex: 0,
      snapshot,
      state,
    });

    expect(result).toMatchObject({ applied: true, reason: null });
    expect(result.state.directions.forward.overrides).toMatchObject({
      attackLevelStage: 9,
      attackerSpeedFlat: 60,
    });
  });

  test("clears the previous defense reduction when another skill is used", () => {
    const snapshot = createSnapshot();
    const state = createInitialState(snapshot);
    state.sides.attacker.spiritId = "attacker";
    state.sides.defender.spiritId = "defender";
    state.sides.attacker.skills.four = ["scratch", null, null, null];
    state.directions.reverse.reduction = 0.2;

    const result = applyBattleActivation({
      calculation: { forward: { results: [] } },
      side: "attacker",
      skillIndex: 0,
      snapshot,
      state,
    });

    expect(result).toMatchObject({ applied: false, stateChanged: true });
    expect(result.state.directions.reverse.reduction).toBe(1);
  });

  test("writes fixed power and hit-count progression into shared overrides", () => {
    const snapshot = createSnapshot();
    const state = createInitialState(snapshot);
    state.sides.attacker.spiritId = "attacker";
    state.sides.defender.spiritId = "defender";
    state.sides.attacker.skills.four = [
      "opportunity",
      "warm-up",
      null,
      null,
    ];

    const powered = applyBattleActivation({
      calculation: { forward: { results: [] } },
      side: "attacker",
      skillIndex: 0,
      snapshot,
      state,
    });
    const combo = applyBattleActivation({
      calculation: { forward: { results: [] } },
      side: "attacker",
      skillIndex: 1,
      snapshot,
      state: powered.state,
    });

    expect(combo.state.directions.forward.overrides).toMatchObject({
      fixedPowerAdd: 70,
      hitCountAdd: 3,
    });
  });

  test("writes defense reduction and direct mark applications", () => {
    const snapshot = createSnapshot();
    const state = createInitialState(snapshot);
    state.sides.attacker.spiritId = "attacker";
    state.sides.defender.spiritId = "defender";
    state.sides.attacker.skills.four = [
      "test-shield",
      "mark-skill",
      null,
      null,
    ];

    const shielded = applyBattleActivation({
      calculation: { forward: { results: [] } },
      side: "attacker",
      skillIndex: 0,
      snapshot,
      state,
    });
    const marked = applyBattleActivation({
      calculation: { forward: { results: [] } },
      side: "attacker",
      skillIndex: 1,
      snapshot,
      state: shielded.state,
    });

    expect(shielded.state.directions.reverse.reduction).toBeCloseTo(0.2);
    expect(marked.state.marks.defender.negative).toEqual({
      id: "starfall",
      stacks: 2,
    });
  });

  test("applies refraction healing and starfall to the correct sides", () => {
    const snapshot = createSnapshot();
    const state = createInitialState(snapshot);
    state.sides.attacker.spiritId = "attacker";
    state.sides.defender.spiritId = "defender";
    state.sides.attacker.skills.four = [
      "refraction",
      "grass-skill",
      "illusion-skill",
      null,
    ];
    state.directions.reverse.currentHp = 50;

    const result = applyBattleActivation({
      calculation: { forward: { results: [] } },
      side: "attacker",
      skillIndex: 0,
      snapshot,
      state,
    });

    expect(result.state.directions.reverse.currentHp).toBeGreaterThan(50);
    expect(result.state.marks.defender.negative).toEqual({
      id: "starfall",
      stacks: 1,
    });
  });

  test("persists progression counters for repeat-use skills", () => {
    const snapshot = createSnapshot();
    const state = createInitialState(snapshot);
    state.sides.attacker.spiritId = "attacker";
    state.sides.defender.spiritId = "defender";
    state.sides.attacker.skills.four = [
      {
        context: { friendshipMode: "growth", skillUseCount: 0 },
        skillId: "friendship",
      },
      null,
      null,
      null,
    ];

    const result = applyBattleActivation({
      calculation: { forward: { results: [] } },
      side: "attacker",
      skillIndex: 0,
      snapshot,
      state,
    });

    expect(result.state.sides.attacker.skills.four[0].context).toMatchObject({
      friendshipMode: "growth",
      skillUseCount: 1,
    });
  });
});
