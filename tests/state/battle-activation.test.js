import { getSkillEffectInputs } from "../../src/domain/skill-effects.js";
import { describe, expect, test } from "vitest";
import {
  applyBalanceTraitTrigger,
  applyBattleActivation,
} from "../../src/state/battle-activation.js";
import { createInitialState } from "../../src/state/defaults.js";
import { calculatorReducer } from "../../src/state/reducer.js";
import {
  decodeShareState,
  encodeShareState,
} from "../../src/state/share.js";
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
  test.each([
    ["落雨", "rain"], ["降雨", "rain"], ["惊雷", "thunder"],
    ["沙涌", "sandstorm"], ["冬至", "blizzard"],
  ])("%s切换全场天气并清除旧天气，持续8回合", async (name, weather) => {
    const snapshot = createSnapshot();
    snapshot.skills.push({ id: "weather-skill", name, category: "status", basePower: 0, type: "水" });
    const state = createInitialState(snapshot);
    state.sides.attacker.spiritId = "attacker";
    state.sides.defender.spiritId = "defender";
    state.sides.defender.skills.four = ["weather-skill", null, null, null];
    for (const direction of ["forward", "reverse"]) {
      state.directions[direction].context = { weatherRainTurns: 3, weatherThunder: true, weatherSandstorm: true, weatherBlizzard: true };
    }
    const result = applyBattleActivation({ side: "defender", skillIndex: 0, snapshot, state });
    expect(result.applied).toBe(true);
    const expected = {
      weatherRainTurns: weather === "rain" ? 8 : 0,
      weatherThunder: weather === "thunder",
      weatherSandstorm: weather === "sandstorm",
      weatherBlizzard: weather === "blizzard",
      weatherTurns: 8,
    };
    for (const direction of ["forward", "reverse"]) expect(result.state.directions[direction].context).toMatchObject(expected);
    const decoded = await decodeShareState(await encodeShareState(result.state));
    expect(decoded.directions.forward.context).toMatchObject(expected);
  });
  test("寒风吹使用后只降低敌方魔防，保留物防及另一方向并支持分享", async () => {
    const snapshot = createSnapshot();
    snapshot.skills.push({ id: "chill-wind", name: "寒风吹", category: "magical", basePower: 70, type: "冰", description: "造成魔伤，敌方获得魔防-50%。" });
    const state = createInitialState(snapshot);
    state.mode = "four";
    state.sides.attacker.spiritId = "attacker";
    state.sides.defender.spiritId = "defender";
    state.sides.attacker.skills.four = ["chill-wind", "scratch", "grass-skill", "opportunity"];
    const view = (current) => buildCalculatorViewModel({ activeDirection: "forward", snapshot, state: current }).calculation.forward.results;
    const before = view(state);
    const applied = applyBattleActivation({ side: "attacker", skillIndex: 0, snapshot, state });
    expect(applied.applied).toBe(true);
    expect(applied.state.directions.forward.overrides.magicalDefenseLevelStageAdd).toBe(-5);
    const after = view(applied.state);
    expect(after[2].totalDamage).toBeGreaterThan(before[2].totalDamage);
    expect(after[1].totalDamage).toBe(before[1].totalDamage);
    expect(after[2].combatPanel.defender.magicalDefense).toBeLessThan(before[2].combatPanel.defender.magicalDefense);
    expect(after[2].combatPanel.defender.physicalDefense).toBe(before[2].combatPanel.defender.physicalDefense);
    expect(applied.state.directions.reverse.overrides.magicalDefenseLevelStageAdd ?? 0).toBe(0);
    expect((await decodeShareState(await encodeShareState(applied.state))).directions.forward.overrides.magicalDefenseLevelStageAdd).toBe(-5);
    const stacked = applyBattleActivation({ side: "attacker", skillIndex: 0, snapshot, state: applied.state });
    expect(stacked.state.directions.forward.overrides.magicalDefenseLevelStageAdd).toBe(-10);
    state.sides.defender.skills.four = ["chill-wind", "scratch", "grass-skill", null];
    const reverse = applyBattleActivation({ side: "defender", skillIndex: 0, snapshot, state });
    expect(reverse.state.directions.reverse.overrides.magicalDefenseLevelStageAdd).toBe(-5);
    expect(reverse.state.directions.forward.overrides.magicalDefenseLevelStageAdd ?? 0).toBe(0);
  });
  test("热身的临时威力支持2倍与4倍切换，再次触发取消且不改其他方向", () => {
    const snapshot = createSnapshot();
    snapshot.skills.push({ id: "warm-up-power", name: "热身", category: "status", basePower: 0, type: "火" });
    const state = createInitialState(snapshot);
    state.sides.attacker.spiritId = "attacker";
    state.sides.defender.spiritId = "defender";
    state.sides.attacker.skills.four = [{ skillId: "warm-up-power", context: {} }, "scratch", "grass-skill", "test-shield"];
    const activate = (current, skillIndex = 0) => applyBattleActivation({ side: "attacker", skillIndex, snapshot, state: current });
    const doubled = activate(state);
    expect(doubled.applied).toBe(true);
    expect(doubled.state.directions.forward.overrides.skillPowerPercentAddsBySlot).toEqual({ 2: 1, 3: 1 });
    doubled.state.sides.attacker.skills.four[0].context.counterDefenseSucceeded = true;
    const quadrupled = activate(doubled.state);
    expect(quadrupled.state.directions.forward.overrides.skillPowerPercentAddsBySlot).toEqual({ 2: 3, 3: 3 });
    const cleared = activate(quadrupled.state);
    expect(cleared.state.directions.forward.overrides.skillPowerPercentAddsBySlot).toEqual({});
    const attack = activate(activate(cleared.state).state, 1);
    expect(attack.state.directions.forward.overrides.skillPowerPercentAddsBySlot).toEqual({});
    expect(quadrupled.state.directions.reverse.overrides.skillPowerPercentAddsBySlot ?? {}).toEqual({});
  });
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

  test("keeps a refraction activation shareable without undefined slot maps", async () => {
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

    const result = applyBattleActivation({
      calculation: { forward: { results: [] } },
      side: "attacker",
      skillIndex: 0,
      snapshot,
      state,
    });
    const decoded = await decodeShareState(
      await encodeShareState(result.state),
    );

    expect(decoded.directions.forward.overrides.fixedPowerAddsBySlot)
      .toEqual({});
    expect(decoded.directions.forward.overrides.skillPowerPercentAddsBySlot)
      .toEqual({});
  });

  test("keeps reverse status activation shareable and preserves slot maps", async () => {
    const snapshot = createSnapshot();
    const state = createInitialState(snapshot);
    state.sides.attacker.spiritId = "attacker";
    state.sides.defender.spiritId = "defender";
    state.sides.defender.skills.four = [
      "refraction",
      "grass-skill",
      "illusion-skill",
      null,
    ];
    state.directions.reverse.overrides = {
      fixedPowerAddsBySlot: { 2: 35 },
      skillPowerPercentAddsBySlot: { 3: 0.5 },
    };

    const result = applyBattleActivation({
      calculation: { reverse: { results: [] } },
      side: "defender",
      skillIndex: 0,
      snapshot,
      state,
    });
    const decoded = await decodeShareState(
      await encodeShareState(result.state),
    );

    expect(decoded.directions.reverse.overrides.fixedPowerAddsBySlot)
      .toEqual({ 2: 35 });
    expect(decoded.directions.reverse.overrides.skillPowerPercentAddsBySlot)
      .toEqual({ 3: 0.5 });
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


describe("累计使用与实际增益摘要", () => {
  function setup() {
    const snapshot = createSnapshot();
    Object.assign(snapshot.skills.find(({ id }) => id === "refraction"), { basePower: 50, category: "magical" });
    snapshot.skills.push({ id: "wing", name: "测试连击", type: "翼", category: "magical", basePower: 40, description: "造成魔伤，1连击。" });
    const state = createInitialState(snapshot);
    state.mode = "four";
    state.sides.attacker.spiritId = "attacker";
    state.sides.defender.spiritId = "defender";
    state.sides.attacker.skills.four = ["refraction", "scratch", "wing", "scratch"];
    const calculate = (current) => buildCalculatorViewModel({ activeDirection: "forward", snapshot, state: current }).calculation;
    const activate = (current) => applyBattleActivation({ calculation: calculate(current), side: "attacker", skillIndex: 0, snapshot, state: current });
    return { snapshot, state, calculate, activate };
  }

  test("摘要读取实际魔攻、速度与手动配置，记录状态不会假装参与结算", () => {
    const { snapshot, state, calculate, activate } = setup();
    snapshot.skills.push({ id: "light", name: "光技能", type: "光", category: "magical", basePower: 20 });
    snapshot.skills.push({ id: "electric", name: "电技能", type: "电", category: "magical", basePower: 20 });
    snapshot.skills.push({ id: "water", name: "水技能", type: "水", category: "magical", basePower: 20 });
    state.sides.attacker.skills.four = ["refraction", "light", "electric", "water"];
    const first = activate(state).state;
    expect(calculate(first).forward.results[0].usageSummary.currentEffects).toEqual(expect.arrayContaining(["魔攻 +3 层", "速度 +20"]));
    expect(calculate(first).forward.results[0].usageSummary.recordedEffects).toEqual(["全技能能耗-1"]);
    first.directions.forward.overrides.attackLevelStage = 5;
    first.sides.attacker.skills.four[0] = { skillId: "refraction", overrides: { powerOverride: { mode: "static", value: 80 } } };
    expect(calculate(first).forward.results[0].usageSummary.currentEffects).toEqual(expect.arrayContaining(["魔攻 +5 层", "静态威力 80（手动）"]));
    expect(calculate(first).forward.results[0].usageSummary.currentEffects).not.toContain("魔攻 +3 层");
    expect(calculate(first).forward.results[0].usageSummary.count).toBe(1);
  });

  test("零次、一次、多次按实际状态差累计，重复系别只生效一次，展示不重复计伤", async () => {
    const { state, calculate, activate } = setup();
    expect(calculate(state).forward.results[0].usageSummary).toMatchObject({ count: 0, powerGain: 0, hitCountGain: 0 });
    const first = activate(state).state;
    expect(calculate(first).forward.results[0].usageSummary).toMatchObject({ count: 1, powerGain: 10, hitCountGain: 1 });
    first.marks.attacker.positive = { id: "sprout", stacks: 1 };
    const second = activate(first).state;
    const result = calculate(second).forward.results[0];
    expect(result.usageSummary).toMatchObject({ count: 2, powerGain: 30, hitCountGain: 3 });
    expect(result.usageSummary.sources).toMatchObject([
      { sproutStacks: 0, count: 1, powerGain: 10, hitCountGain: 1 },
      { sproutStacks: 1, count: 1, powerGain: 20, hitCountGain: 2 },
    ]);
    expect(calculate(second).forward.results[2].hitCount).toBe(4);
    // 去掉展示记录不会改变公式、静态威力或任何伤害结果。
    const withoutRecord = structuredClone(second);
    delete withoutRecord.directions.forward.overrides.refractionUsage;
    const { usageSummary: _record, ...actual } = result;
    const { usageSummary: _missing, ...baseline } = calculate(withoutRecord).forward.results[0];
    expect(actual).toEqual(baseline);
    const restored = await decodeShareState(await encodeShareState(second));
    expect(calculate(restored).forward.results[0].usageSummary).toEqual(result.usageSummary);
    expect(state.directions.forward.overrides.refractionUsage).toBeUndefined();
  });

  test("携带条件变化不改写过去增益；无可触发系别不记使用", () => {
    const { state, calculate, activate } = setup();
    const first = activate(state).state;
    first.sides.attacker.skills.four = ["refraction", "wing", null, null];
    const second = activate(first).state;
    expect(calculate(second).forward.results[0].usageSummary).toMatchObject({ count: 2, powerGain: 10, hitCountGain: 2 });
    second.sides.attacker.skills.four = ["refraction", null, null, null];
    const failed = activate(second);
    expect(failed.applied).toBe(false);
    expect(calculate(failed.state).forward.results[0].usageSummary.count).toBe(2);
  });

  test("累计状态超过最终连击上限时不虚增实际连击；旧状态不倒推次数", () => {
    const { state, calculate, activate } = setup();
    state.directions.forward.overrides.hitCountAdd = 98;
    const first = activate(state).state;
    expect(calculate(first).forward.results[2].hitCount).toBe(99);
    expect(calculate(first).forward.results[0].usageSummary).toMatchObject({ count: 1, hitCountGain: 1, historyIncomplete: true });
    const second = activate(first).state;
    expect(calculate(second).forward.results[2].hitCount).toBe(99);
    expect(calculate(second).forward.results[0].usageSummary.hitCountGain).toBe(2);
  });

  test("切换技能不丢失仍在生效的状态，重置或切换精灵同时清空记录", async () => {
    const { snapshot, state, calculate, activate } = setup();
    const { selectFourSkill, selectSpirit } = await import("../../src/state/calculator-session.js");
    let current = activate(state).state;
    current = selectFourSkill(current, { side: "attacker", index: 0, skillId: "scratch", snapshot }).state;
    expect(calculate(current).forward.results[0].usageSummary).toBeUndefined();
    current = selectFourSkill(current, { side: "attacker", index: 0, skillId: "refraction", snapshot }).state;
    expect(calculate(current).forward.results[0].usageSummary.count).toBe(1);
    current = selectSpirit(current, { side: "attacker", spiritId: "defender", initialState: state, snapshot }).state;
    expect(current.directions.forward.overrides.refractionUsage).toBeUndefined();
    expect(calculate(state).forward.results[0].usageSummary.count).toBe(0);
  });

  test("手动威力不推算使用次数；次数成长的手动威力覆盖和连击上限按实际结果展示", () => {
    const { snapshot, state, calculate } = setup();
    state.sides.attacker.skills.four[0] = { skillId: "refraction", overrides: { powerOverride: { mode: "static", value: 610 } } };
    expect(calculate(state).forward.results[0].usageSummary).toMatchObject({ count: 0, powerGain: 0, hitCountGain: 0 });
    snapshot.skills.push({ id: "growth", name: "孢子爆散", type: "草", category: "magical", basePower: 40, description: "造成魔伤，2连击。" });
    state.sides.attacker.skills.four[0] = { skillId: "growth", context: { skillUseCount: 20 } };
    state.directions.forward.overrides.hitCountAdd = 96;
    const capped = calculate(state).forward.results[0];
    expect(capped.hitCount).toBe(99);
    expect(capped.usageSummary.hitCountCapped).toBe(true);
    expect(capped.usageSummary).toMatchObject({ count: 20, hitCountGain: 1 });
    snapshot.skills.find(({ id }) => id === "growth").name = "吹火";
    state.sides.attacker.skills.four[0].overrides = { powerOverride: { mode: "static", value: 610 } };
    expect(calculate(state).forward.results[0].usageSummary).toMatchObject({ count: 20, powerGain: 0 });
  });

  test.each([
    ["吹火", {}, 60, 0],
    ["迫近攻击", {}, 135, 0],
    ["乘胜追击", {}, 0, 3],
    ["孢子爆散", {}, 0, 6],
    ["试飞", { flightMode: "power" }, 30, 0],
    ["试飞", { flightMode: "hits" }, 0, 3],
    ["友谊满溢", { friendshipMode: "counter", counterTriggered: true }, 120, 0],
  ])("%s读取次数控件和当前规则分支 %j", (name, context, powerGain, hitCountGain) => {
    const { snapshot, state, calculate } = setup();
    snapshot.skills.push({ id: "growth", name, type: "火", category: "magical", basePower: 40, description: "造成魔伤，1连击。" });
    const controls = getSkillEffectInputs(snapshot.skills.find(({ id }) => id === "growth"));
    const inputContext = { ...context, skillUseCount: 3 };
    state.sides.attacker.skills.four[0] = {
      skillId: "growth",
      context: Object.fromEntries(controls.filter((control) => Object.hasOwn(inputContext, control.contextKey)).map((control) => [control.id, inputContext[control.contextKey]])),
    };
    const result = calculate(state).forward.results[0];
    expect(result.usageSummary).toMatchObject({ count: 3, powerGain, hitCountGain });
  });
});
