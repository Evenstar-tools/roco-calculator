import { describe, expect, test } from "vitest";
import { calculateMatchup } from "../src/shared/domain/calculate.js";
import { buildCombatState } from "../src/shared/build-combat-state.js";
import { createInitialState } from "../src/shared/state/defaults.js";
import { createCalculationView } from "../src/view-models/calculation.js";

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
    traits: [],
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

describe("createCalculationView", () => {
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
