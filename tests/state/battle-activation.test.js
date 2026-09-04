import { describe, expect, test } from "vitest";
import {
  applyBalanceTraitTrigger,
  applyBattleActivation,
} from "../../src/state/battle-activation.js";
import { createInitialState } from "../../src/state/defaults.js";
import { calculatorReducer } from "../../src/state/reducer.js";
import { buildCalculatorViewModel } from "../../src/domain/calculator-view-model.js";

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
        basePower: 30,
        category: "magical",
        id: "coax",
        name: "撒娇",
        type: "萌",
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
        description:
          "下一次攻击时，额外造成100%幻系伤害，应对防御：改为额外造成300%幻系伤害。",
        id: "reassembly",
        name: "重组",
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
      {
        basePower: 0,
        category: "status",
        id: "greed",
        name: "贪婪",
        type: "恶",
      },
      {
        basePower: 0,
        category: "defense",
        description: "减伤90%，应对攻击：自己获得50%吸血。",
        id: "equivalent-exchange",
        name: "等价交换",
        type: "恶",
      },
    ],
    traits: [],
    typeChart: { matrix: [[1]], types: ["普通"] },
  };
}

describe("shared battle activation", () => {
  test("advances a choice skill twice when Moon Memory acquired a choice trait", () => {
    const snapshot = createSnapshot();
    snapshot.spirits[0].traitIds = ["moon-memory"];
    snapshot.traits = [
      { id: "moon-memory", name: "铭记于月亮" },
      { id: "single-minded", name: "一意孤行" },
    ];
    snapshot.skills = snapshot.skills.map((skill) =>
      skill.id === "friendship"
        ? {
            ...skill,
            description:
              "选择：每次使用后威力永久+20或应对状态时本次技能威力+100%。",
          }
        : skill,
    );
    const state = createInitialState(snapshot);
    state.sides.attacker.spiritId = "attacker";
    state.sides.defender.spiritId = "defender";
    state.sides.attacker.acquiredTraitIds = ["single-minded"];
    state.sides.attacker.skills.four = [{
      context: {
        choiceTraitTriggered: true,
        friendshipMode: "growth",
        skillUseCount: 0,
      },
      skillId: "friendship",
    }, null, null, null];

    const result = applyBattleActivation({
      calculation: { forward: { results: [] } },
      side: "attacker",
      skillIndex: 0,
      snapshot,
      state,
    });

    expect(result.applied).toBe(true);
    expect(result.state.sides.attacker.skills.four[0].context.skillUseCount)
      .toBe(2);
  });

  test("does not apply preview self-damage for Moon Memory", () => {
    const snapshot = createSnapshot();
    snapshot.spirits[0].traitIds = ["moon-memory"];
    snapshot.traits = [{ id: "moon-memory", name: "铭记于月亮" }];
    snapshot.skills = snapshot.skills.map((skill) =>
      skill.id === "scratch"
        ? { ...skill, description: "造成物伤，3连击。" }
        : skill,
    );
    const state = createInitialState(snapshot);
    state.mode = "four";
    state.sides.attacker.spiritId = "attacker";
    state.sides.defender.spiritId = "defender";
    state.sides.attacker.skills.four = ["scratch", null, null, null];
    state.directions.reverse.currentHp = 100;
    const view = buildCalculatorViewModel({
      activeDirection: "forward",
      snapshot,
      state,
    });
    const postAttackEffects = view.calculation.forward.results[0]
      .postAttackEffects;

    const result = applyBattleActivation({
      calculation: view.calculation,
      side: "attacker",
      skillIndex: 0,
      snapshot,
      state,
    });

    expect(view.calculation.forward.results[0].hitCount).toBe(3);
    expect(postAttackEffects?.moonMemorySelfDamage).toBeUndefined();
    expect(postAttackEffects?.selfCurrentHpAfterSettlement).toBeUndefined();
    expect(result.state.directions.reverse.currentHp).toBe(100);
  });

  test("stacks Greed lifesteal and adds one layer for each Sprout stack", () => {
    const snapshot = createSnapshot();
    const state = createInitialState(snapshot);
    state.sides.attacker.spiritId = "attacker";
    state.sides.defender.spiritId = "defender";
    state.sides.attacker.skills.four = ["greed", null, null, null];
    state.marks.attacker.positive = { id: "sprout", stacks: 1 };

    const first = applyBattleActivation({
      calculation: { forward: { results: [] } },
      side: "attacker",
      skillIndex: 0,
      snapshot,
      state,
    });
    const second = applyBattleActivation({
      calculation: { forward: { results: [] } },
      side: "attacker",
      skillIndex: 0,
      snapshot,
      state: first.state,
    });

    expect(first.state.directions.forward.overrides.lifestealPercent).toBe(110);
    expect(second.state.directions.forward.overrides.lifestealPercent).toBe(220);
  });

  test("stacks Equivalent Exchange lifesteal only after a successful response", () => {
    const snapshot = createSnapshot();
    const state = createInitialState(snapshot);
    state.sides.attacker.spiritId = "attacker";
    state.sides.defender.spiritId = "defender";
    state.sides.attacker.skills.four = [{
      context: { defenseCounterSucceeded: true },
      skillId: "equivalent-exchange",
    }, null, null, null];
    state.marks.attacker.positive = { id: "sprout", stacks: 1 };

    const first = applyBattleActivation({
      calculation: { forward: { results: [] } },
      side: "attacker",
      skillIndex: 0,
      snapshot,
      state,
    });
    const second = applyBattleActivation({
      calculation: { forward: { results: [] } },
      side: "attacker",
      skillIndex: 0,
      snapshot,
      state: first.state,
    });

    expect(first.state.directions.forward.overrides.lifestealPercent).toBe(60);
    expect(second.state.directions.forward.overrides.lifestealPercent).toBe(120);
  });

  test("applies Baron overflow healing as a post-attack ability stage", () => {
    const snapshot = createSnapshot();
    const state = createInitialState(snapshot);
    state.sides.attacker.spiritId = "attacker";
    state.sides.defender.spiritId = "defender";
    state.sides.attacker.skills.four = ["scratch", null, null, null];

    const result = applyBattleActivation({
      calculation: {
        forward: {
          results: [{
            postAttackEffects: {
              attackLevelStageAdd: 2,
              selfCurrentHpAfterSettlement: 450,
              source: "贪得无厌",
            },
          }],
        },
      },
      side: "attacker",
      skillIndex: 0,
      snapshot,
      state,
    });

    expect(result.applied).toBe(true);
    expect(result.state.directions.forward.overrides.attackLevelStage).toBe(2);
    expect(result.state.directions.reverse.currentHp).toBe(450);
  });

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

  test("applies and persists a status skill from single-skill mode", () => {
    const snapshot = createSnapshot();
    const state = createInitialState(snapshot);
    state.sides.attacker.spiritId = "attacker";
    state.sides.defender.spiritId = "defender";
    state.sides.attacker.skills.single = "steam-march";
    state.directions.forward.context = {
      applyAttackBoost: true,
      applySpeedBoost: true,
    };

    const result = applyBattleActivation({
      calculation: { forward: { results: [{ hitCount: 1 }] } },
      side: "attacker",
      skillIndex: 0,
      skillMode: "single",
      snapshot,
      state,
    });

    expect(result).toMatchObject({ applied: true, reason: null });
    expect(result.state.directions.forward.overrides).toMatchObject({
      attackLevelStage: 9,
      attackerSpeedFlat: 60,
    });
    expect(result.state.directions.forward.context).toMatchObject({
      applyAttackBoost: true,
      applySpeedBoost: true,
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

  test("撒娇把每次10点固定威力写入同侧全技能共享加成", () => {
    const snapshot = createSnapshot();
    const state = createInitialState(snapshot);
    state.sides.attacker.spiritId = "attacker";
    state.sides.defender.spiritId = "defender";
    state.sides.attacker.skills.four = ["coax", "scratch", null, null];

    const first = applyBattleActivation({
      calculation: { forward: { results: [] } },
      side: "attacker",
      skillIndex: 0,
      snapshot,
      state,
    });
    const second = applyBattleActivation({
      calculation: { forward: { results: [] } },
      side: "attacker",
      skillIndex: 0,
      snapshot,
      state: first.state,
    });

    expect(first.state.directions.forward.overrides.fixedPowerAdd).toBe(10);
    expect(second.state.directions.forward.overrides.fixedPowerAdd).toBe(20);
    expect(second.state.sides.attacker.skills.four[0]).toMatchObject({
      skillId: "coax",
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

  test("重组点击后持久化到下一招，并由应对防御分支直接替换倍率", () => {
    const snapshot = createSnapshot();
    const state = createInitialState(snapshot);
    state.sides.attacker.spiritId = "attacker";
    state.sides.defender.spiritId = "defender";
    state.sides.attacker.skills.four = [
      { context: {}, skillId: "reassembly" },
      "scratch",
      null,
      null,
    ];

    const normal = applyBattleActivation({
      calculation: { forward: { results: [] } },
      side: "attacker",
      skillIndex: 0,
      snapshot,
      state,
    });
    expect(normal.state.marks.attacker.positive).toEqual({
      id: "reassembly",
      stacks: 1,
    });

    normal.state.sides.attacker.skills.four[0].context = {
      counterDefenseSucceeded: true,
    };
    const countered = applyBattleActivation({
      calculation: { forward: { results: [] } },
      side: "attacker",
      skillIndex: 0,
      snapshot,
      state: normal.state,
    });
    expect(countered.state.marks.attacker.positive).toEqual({
      id: "reassembly",
      stacks: 3,
    });

    countered.state.sides.attacker.skills.four[0].context = {};
    const resetToNormal = applyBattleActivation({
      calculation: { forward: { results: [] } },
      side: "attacker",
      skillIndex: 0,
      snapshot,
      state: countered.state,
    });
    expect(resetToNormal.state.marks.attacker.positive).toEqual({
      id: "reassembly",
      stacks: 1,
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
