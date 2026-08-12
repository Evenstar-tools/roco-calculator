import { describe, expect, test } from "vitest";
import { calculateMatchup } from "../src/shared/domain/calculate.js";
import { getTraitView } from "../src/shared/domain/calculator-view-model.js";
import { buildCombatState } from "../src/shared/build-combat-state.js";
import { createInitialState } from "../src/shared/state/defaults.js";
import { canonicalTraitControlKey } from "../src/shared/state/trait-values.js";
import {
  createCalculationView,
  decoratePowerResult,
} from "../src/view-models/calculation.js";

const neutralChart = {
  matrix: [
    [1, 1],
    [1, 1],
  ],
  types: ["火", "水"],
};

function createSnapshot() {
  return {
    meta: { id: "data-v1", rulesVersion: "rules-v1" },
    spirits: [
      {
        id: "spirit-a",
        fullName: "烈焰兽",
        raceStats: {
          hp: 120,
          magicalAttack: 100,
          magicalDefense: 100,
          physicalAttack: 140,
          physicalDefense: 100,
          speed: 100,
        },
        traitIds: ["trait-flexible-tempo"],
        types: ["火"],
      },
      {
        id: "spirit-b",
        fullName: "潮汐兽",
        raceStats: {
          hp: 150,
          magicalAttack: 115,
          magicalDefense: 120,
          physicalAttack: 100,
          physicalDefense: 125,
          speed: 90,
        },
        traitIds: ["trait-guardian-heart"],
        types: ["水"],
      },
    ],
    skills: [
      {
        basePower: 80,
        category: "physical",
        id: "skill-a",
        name: "烈焰冲击",
        type: "火",
      },
      {
        basePower: 50,
        category: "physical",
        id: "skill-b",
        name: "连环火花",
        type: "火",
      },
      {
        basePower: 70,
        category: "magical",
        id: "skill-c",
        name: "潮汐冲击",
        type: "水",
      },
      {
        basePower: 60,
        category: "physical",
        id: "skill-d",
        name: "未知招式",
        ruleId: "future_rule",
        type: "火",
      },
      {
        basePower: 40,
        category: "physical",
        id: "skill-condition",
        name: "闪燃",
        type: "火",
      },
    ],
    traits: [
      {
        description: "周末获得双攻，平日获得双防。",
        id: "trait-flexible-tempo",
        name: "张弛有度",
      },
      {
        description: "每种不同增益提高物防。",
        id: "trait-guardian-heart",
        name: "守护之心",
      },
    ],
    typeChart: neutralChart,
  };
}

function createState(snapshot) {
  const state = createInitialState(snapshot);
  state.sides.attacker.skills = {
    four: ["skill-a", "skill-b", "skill-condition", "skill-d"],
    single: "skill-a",
  };
  state.sides.defender.skills = {
    four: ["skill-c", null, null, null],
    single: "skill-c",
  };
  return state;
}

function dynamicResult(skillName, source, label, input, before, after) {
  return {
    effectivePower: after,
    formulaSteps: [
      { after, before, input, label, source },
      {
        after,
        before: after,
        input: after,
        label: "基础威力",
        source: "skill",
      },
    ],
    skillName,
    status: "exact",
  };
}

test.each([
  [
    "闪击",
    "reviewed-rule:speed-defense-difference-v1",
    "速度差威力",
    { attacker: 500, defender: 430 },
    70,
    160,
    "速度 500 − 430 = 70 → 威力 160",
  ],
  [
    "鸣沙陷阱",
    "reviewed-rule:speed-defense-difference-v1",
    "物防差威力",
    { attacker: 480, defender: 420 },
    60,
    150,
    "物防 480 − 420 = 60 → 威力 150",
  ],
  [
    "魔能爆",
    "reviewed-rule:mana-burst-v1",
    "能量威力",
    8,
    100,
    180,
    "8 能量 → 威力 180",
  ],
  [
    "冰锋横扫",
    "reviewed-rule:enemy-total-skill-cost-power-v1",
    "敌方总能耗威力",
    12,
    90,
    150,
    "90 + 60 = 150",
  ],
  [
    "怨力打击",
    "reviewed-rule:enemy-skill-power-multiplier-v1",
    "敌方技能威力倍率",
    120,
    1,
    360,
    "120 × 3 = 360",
  ],
])(
  "shows the shared %s power explanation",
  (skillName, source, label, input, before, after, expected) => {
    const row = decoratePowerResult(
      dynamicResult(skillName, source, label, input, before, after),
    );

    expect(row.displayedPower).toEqual(expect.any(Number));
    expect(row.powerSummary).toBe(expected);
  },
);

test("does not add noise to fixed-power skills", () => {
  expect(decoratePowerResult({
    effectivePower: 100,
    formulaSteps: [
      {
        after: 100,
        before: 100,
        label: "基础威力",
        source: "skill",
      },
    ],
    skillName: "固定技能",
    status: "exact",
  }).powerSummary).toBeNull();
});

test("uses shared power layers without reapplying later multipliers", () => {
  expect(decoratePowerResult({
    effectivePower: 271,
    formulaSteps: [],
    resolvedPower: 135,
    skillPower: 203,
  }).displayedPower).toBe(135);
  expect(decoratePowerResult({
    effectivePower: 271,
    formulaSteps: [],
    skillPower: 203,
  }).displayedPower).toBe(203);
  expect(decoratePowerResult({
    effectivePower: 271,
    formulaSteps: [],
  }).displayedPower).toBe(271);
});

test("keeps manual power explanations out of reviewed-rule summaries", () => {
  const row = decoratePowerResult({
    effectivePower: 222,
    formulaSteps: [
      {
        after: 222,
        before: 80,
        input: 222,
        label: "手动覆盖基础威力",
        source: "manual-override",
      },
      {
        after: 222,
        before: 80,
        input: 80,
        label: "基础威力",
        source: "skill",
      },
    ],
    resolvedPower: 222,
    skillName: "势如破竹",
    status: "exact",
  });

  expect(row.displayedPower).toBe(222);
  expect(row.powerSummary).toBeNull();
});

test.each([
  ["reviewed-rule:boolean-damage-multiplier-v1", "条件伤害倍率", true, 1, 1.5],
  ["reviewed-rule:hit-count-scaled-v1", "条件连击数", 2, 1, 3],
  ["reviewed-rule:boolean-hit-count-v1", "条件连击数", true, 1, 2],
  ["reviewed-rule:threshold-hit-count-v1", "阈值连击数", 5, 1, 3],
])(
  "ignores non-power step %s",
  (source, label, input, before, after) => {
    expect(decoratePowerResult({
      effectivePower: 80,
      formulaSteps: [
        { after, before, input, label, source },
        {
          after: 80,
          before: 80,
          label: "基础威力",
          source: "skill",
        },
      ],
      skillName: "非威力规则技能",
      status: "exact",
    }).powerSummary).toBeNull();
  },
);

test("stops at a prefixed base-power step in multi-stage results", () => {
  expect(decoratePowerResult({
    formulaSteps: [
      {
        after: 90,
        before: 90,
        label: "第一段 · 基础威力",
        source: "skill",
      },
      {
        after: 160,
        before: 70,
        input: { attacker: 500, defender: 430 },
        label: "第二段 · 速度差威力",
        source: "reviewed-rule:speed-defense-difference-v1",
      },
      {
        after: 12,
        before: 10,
        label: "星陨追加伤害",
        source: "reviewed-rule:starfall-v1",
      },
    ],
    resolvedPower: 90,
    skillName: "风雨召唤",
    status: "exact",
  }).powerSummary).toBeNull();
});

test("keeps a prefixed first-stage defense metric explicit", () => {
  expect(decoratePowerResult({
    formulaSteps: [
      {
        after: 150,
        before: 60,
        input: { attacker: 480, defender: 420 },
        label: "第一段 · 物防差威力",
        source: "reviewed-rule:speed-defense-difference-v1",
      },
      {
        after: 150,
        before: 60,
        label: "第一段 · 基础威力",
        source: "skill",
      },
    ],
    resolvedPower: 150,
    skillName: "多段物防技能",
    status: "exact",
  }).powerSummary).toBe("物防 480 − 420 = 60 → 威力 150");
});

test.each([
  [
    "寄生种子",
    {
      formulaSteps: [
        {
          after: 80,
          before: 80,
          label: "持续伤害威力",
          source: "reviewed-rule:seed-v1",
        },
      ],
      resolvedPower: 80,
    },
  ],
  [
    "风雨召唤",
    {
      formulaSteps: [
        {
          after: 90,
          before: 90,
          label: "第一段 · 基础威力",
          source: "skill",
        },
        {
          after: 70,
          before: 70,
          label: "第二段 · 基础威力",
          source: "skill",
        },
      ],
      skillPower: 90,
    },
  ],
  [
    "岿然不动",
    {
      effectivePower: 0,
      formulaSteps: [
        {
          after: 0,
          before: 0,
          label: "基础威力",
          source: "skill",
        },
      ],
    },
  ],
])(
  "does not infer a %s explanation without a changed reviewed step",
  (skillName, result) => {
    expect(decoratePowerResult({
      ...result,
      skillName,
      status: "exact",
    }).powerSummary).toBeNull();
  },
);

describe("createCalculationView", () => {
  test("defaults an unset target HP to the defender maximum", () => {
    const snapshot = createSnapshot();
    const state = createState(snapshot);
    state.directions.forward.currentHp = null;

    const view = createCalculationView(snapshot, state, "forward");

    expect(view.defenderHp).toBe(view.defenderMaxHp);
    expect(view.defenderHpPercent).toBe(100);
  });

  test("uses the editable target HP for remaining life while retaining max HP", () => {
    const snapshot = createSnapshot();
    const state = createState(snapshot);
    state.directions.forward.currentHp = 100;

    const view = createCalculationView(snapshot, state, "forward");

    expect(view.defenderHp).toBe(100);
    expect(view.defenderMaxHp).toBeGreaterThan(100);
    expect(view.defenderHpPercent).toBeCloseTo(
      100 / view.defenderMaxHp * 100,
      5,
    );
    expect(view.selectedResult.remainingHp).toBe(
      Math.max(0, 100 - view.selectedResult.totalDamage),
    );
    expect(view.selectedResult.remainingHpPercent).toBeCloseTo(
      view.selectedResult.remainingHp / view.defenderMaxHp * 100,
      5,
    );
  });

  test("keeps shared trait, mark, warning and formula audit fields", () => {
    const snapshot = createSnapshot();
    const state = createState(snapshot);

    const view = createCalculationView(snapshot, state, "forward");

    expect(view).toHaveProperty("traitResult");
    expect(view.selectedResult.formulaSteps).toEqual(expect.any(Array));
    expect(view.selectedResult.markSettlements).toEqual(expect.any(Array));
    expect(view.selectedResult.traitSettlements).toEqual(expect.any(Array));
    expect(view.selectedResult.warnings).toEqual(expect.any(Array));
  });

  test("formats the real enemy-skill-power multiplier step", () => {
    const snapshot = createSnapshot();
    const state = createState(snapshot);
    snapshot.skills[0] = {
      ...snapshot.skills[0],
      basePower: 1,
      name: "怨力打击",
      ruleId: "enemy_skill_power_multiplier",
      ruleParams: {
        contextKey: "enemySkillPower",
        multiplier: 3,
      },
    };
    state.directions.forward.context = { enemySkillPower: 120 };

    const view = createCalculationView(snapshot, state, "forward");
    const step = view.selectedResult.formulaSteps.find(
      ({ source }) =>
        source ===
        "reviewed-rule:enemy-skill-power-multiplier-v1",
    );

    expect(step).toMatchObject({ after: 360, before: 1, input: 120 });
    expect(view.selectedResult.powerSummary).toBe("120 × 3 = 360");
  });

  test("keeps 硬门 as an exact embedded 90-power attack", () => {
    const snapshot = createSnapshot();
    const state = createState(snapshot);
    snapshot.skills[0] = {
      ...snapshot.skills[0],
      basePower: 0,
      category: "status",
      name: "硬门",
    };
    state.sides.attacker.skills.single = snapshot.skills[0].id;

    const view = createCalculationView(snapshot, state, "forward");

    expect(view.selectedResult.displayedPower).toBe(90);
    expect(view.selectedResult.powerSummary).toBeNull();
  });

  test("materializes owning-side traits for both combat directions", () => {
    const snapshot = createSnapshot();
    const state = createState(snapshot);
    const forwardAttackerControl = getTraitView(
      snapshot,
      snapshot.spirits[0],
      "attacker",
    ).inputs.find((input) => input.contextKey === "traitActivated");
    const reverseDefenderControl = getTraitView(
      snapshot,
      snapshot.spirits[0],
      "defender",
    ).inputs.find((input) => input.contextKey === "traitActivated");
    const forwardDefenderControl = getTraitView(
      snapshot,
      snapshot.spirits[1],
      "defender",
    ).inputs.find(
      (input) => input.contextKey === "defenderTraitStacks",
    );
    const reverseAttackerControl = getTraitView(
      snapshot,
      snapshot.spirits[1],
      "attacker",
    ).inputs.find(
      (input) => input.contextKey === "attackerTraitStacks",
    );
    state.sides.attacker.traitValues = {
      [canonicalTraitControlKey(forwardAttackerControl)]: true,
    };
    state.sides.defender.traitValues = {
      [canonicalTraitControlKey(forwardDefenderControl)]: 3,
    };
    state.directions.forward.context = {
      [forwardAttackerControl.id]: false,
      [forwardDefenderControl.id]: 99,
      skillOnly: "preserved",
    };
    state.directions.reverse.context = {
      [reverseAttackerControl.id]: 99,
      [reverseDefenderControl.id]: false,
      reverseSkillOnly: 4,
    };

    const combatState = buildCombatState(state, snapshot);

    expect(combatState.directions.forward.context).toMatchObject({
      [forwardAttackerControl.id]: true,
      [forwardDefenderControl.id]: 3,
      skillOnly: "preserved",
    });
    expect(combatState.directions.reverse.context).toMatchObject({
      [reverseAttackerControl.id]: 3,
      [reverseDefenderControl.id]: true,
      reverseSkillOnly: 4,
    });

    const direct = calculateMatchup(snapshot, combatState);
    for (const direction of ["forward", "reverse"]) {
      const view = createCalculationView(snapshot, state, direction);
      expect(view.selectedResult.totalDamage).toBe(
        direct[direction].selectedResult.totalDamage,
      );
    }
  });

  test.each([
    ["forward", "skill-a"],
    ["reverse", "skill-c"],
  ])(
    "decorates the selected shared dynamic result for %s direction",
    (direction, skillId) => {
      const snapshot = createSnapshot();
      const state = createState(snapshot);
      const skill = snapshot.skills.find((entry) => entry.id === skillId);
      Object.assign(skill, {
        basePower: 60,
        category: "physical",
        name: "闪击",
        ruleId: "speed_difference",
      });
      const shared = calculateMatchup(
        snapshot,
        buildCombatState(state, snapshot),
      )[direction].selectedResult;
      const step = shared.formulaSteps.find(({ source }) =>
        String(source).includes("speed-defense-difference")
      );

      const view = createCalculationView(snapshot, state, direction);

      expect(view.selectedResult.displayedPower).toBe(
        shared.resolvedPower,
      );
      expect(view.selectedResult.powerSummary).toContain(
        `速度 ${step.input.attacker} − ${step.input.defender}`,
      );
    },
  );

  test.each(["forward", "reverse"])(
    "matches the synchronized Web calculation for %s direction",
    (direction) => {
      const snapshot = createSnapshot();
      const state = createState(snapshot);
      const mini = createCalculationView(snapshot, state, direction);
      const web = calculateMatchup(snapshot, buildCombatState(state));

      expect(mini.status).toBe("exact");
      expect(mini.selectedResult.totalDamage).toBe(
        web[direction].selectedResult.totalDamage,
      );
      expect(mini.selectedResult.hpPercent).toBe(
        web[direction].selectedResult.hpPercent,
      );
      for (const [field, value] of Object.entries(
        web[direction].selectedResult,
      )) {
        expect(mini.selectedResult[field]).toEqual(value);
      }
    },
  );

  test("matches four-skill selection, hit count, and manual power overrides", () => {
    const snapshot = createSnapshot();
    const state = createState(snapshot);
    state.mode = "four";
    state.sides.attacker.skills.four[1] = {
      hitCount: 3,
      overrides: { basePower: 95 },
      skillId: "skill-b",
    };
    state.directions.forward = {
      ...state.directions.forward,
      selectedSkillIndex: 1,
    };

    const mini = createCalculationView(snapshot, state, "forward");
    const web = calculateMatchup(snapshot, buildCombatState(state));

    expect(mini.rows).toHaveLength(4);
    for (const [field, value] of Object.entries(
      web.forward.selectedResult,
    )) {
      expect(mini.selectedResult[field]).toEqual(value);
    }
    expect(mini.selectedResult).toMatchObject({
      hitCount: 3,
      skillId: "skill-b",
      totalDamage: web.forward.selectedResult.totalDamage,
    });
  });

  test("keeps an unmet boolean condition deterministic", () => {
    const snapshot = createSnapshot();
    const state = createState(snapshot);
    state.sides.attacker.skills.single = "skill-condition";

    const normal = createCalculationView(snapshot, state, "forward");
    state.directions.forward.context = { counterTriggered: true };
    const triggered = createCalculationView(
      snapshot,
      state,
      "forward",
    );

    expect(normal.status).toBe("exact");
    expect(triggered.status).toBe("exact");
    expect(triggered.selectedResult.totalDamage).toBeGreaterThan(
      normal.selectedResult.totalDamage,
    );
  });

  test("uses unresolved state instead of presenting zero damage for uncovered rules", () => {
    const snapshot = createSnapshot();
    const state = createState(snapshot);
    state.sides.attacker.skills.single = "skill-d";

    const view = createCalculationView(snapshot, state, "forward");

    expect(view).toMatchObject({
      message: "当前规则暂未收录",
      selectedResult: null,
      status: "unresolved",
    });
    expect(view.rows[0]).toMatchObject({
      status: "unresolved",
      totalDamage: null,
    });
  });

  test("normalizes a missing combatant as a recoverable configuration error", () => {
    const snapshot = createSnapshot();
    const state = createState(snapshot);
    state.sides.attacker.spiritId = "missing-spirit";

    expect(
      createCalculationView(snapshot, state, "forward"),
    ).toMatchObject({
      message: "当前配置无法完成计算，请重新选择宠物和技能",
      rows: [],
      selectedResult: null,
      status: "unresolved",
    });
  });

  test("rethrows an unexpected core or data invariant failure unchanged", () => {
    const snapshot = createSnapshot();
    const state = createState(snapshot);
    const invariantError = new Error("snapshot skill index invariant");
    Object.defineProperty(snapshot, "skills", {
      get() {
        throw invariantError;
      },
    });

    expect(() =>
      createCalculationView(snapshot, state, "forward"),
    ).toThrow(invariantError);
  });
});
