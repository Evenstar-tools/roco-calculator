import { describe, expect, test } from "vitest";
import { buildCalculatorViewModel } from "../../src/domain/calculator-view-model.js";

const ivs = {
  hp: 60,
  magicalAttack: 60,
  magicalDefense: 60,
  physicalAttack: 60,
  physicalDefense: 60,
  speed: 60,
};

const snapshot = {
  learnsets: [
    { spiritId: "fire", skillIds: ["fire-hit"] },
    { spiritId: "water", skillIds: ["water-hit"] },
  ],
  meta: { id: "s3-view", rulesVersion: "rules-v1" },
  skills: [
    {
      basePower: 80,
      category: "physical",
      id: "fire-hit",
      name: "火焰冲击",
      provenance: { basePower: { source: "fixture" } },
      ruleId: null,
      type: "火",
    },
    {
      basePower: 70,
      category: "magical",
      id: "water-hit",
      name: "水流冲击",
      provenance: { basePower: { source: "fixture" } },
      ruleId: null,
      type: "水",
    },
  ],
  spirits: [
    {
      fullName: "火灵",
      id: "fire",
      raceStats: {
        hp: 110,
        magicalAttack: 82,
        magicalDefense: 90,
        physicalAttack: 128,
        physicalDefense: 95,
        speed: 116,
      },
      traitIds: ["focus"],
      types: ["火"],
    },
    {
      fullName: "水灵",
      id: "water",
      raceStats: {
        hp: 125,
        magicalAttack: 115,
        magicalDefense: 105,
        physicalAttack: 100,
        physicalDefense: 100,
        speed: 90,
      },
      traitIds: [],
      types: ["水"],
    },
  ],
  traits: [
    {
      description: "入场首回合，获得物攻+100%。",
      id: "focus",
      name: "专注力",
    },
  ],
  typeChart: null,
};

function state() {
  const direction = {
    context: {},
    currentHp: null,
    finalDamageMultiplier: 1,
    hitCount: 1,
    overrides: {},
    reduction: 1,
    selectedSkillIndex: 0,
    starfallStacks: 0,
  };
  return {
    directions: {
      forward: { ...direction, context: {}, overrides: {} },
      reverse: { ...direction, context: {}, overrides: {} },
    },
    level: 60,
    marks: {
      attacker: {
        negative: { id: null, stacks: 0 },
        positive: { id: null, stacks: 0 },
      },
      defender: {
        negative: { id: null, stacks: 0 },
        positive: { id: null, stacks: 0 },
      },
    },
    mode: "single",
    schemaVersion: 1,
    sides: {
      attacker: {
        displayIvs: { ...ivs },
        nature: "neutral",
        skills: { four: ["fire-hit", null, null, null], single: "fire-hit" },
        spiritId: "fire",
      },
      defender: {
        displayIvs: { ...ivs },
        nature: "neutral",
        skills: { four: ["water-hit", null, null, null], single: "water-hit" },
        spiritId: "water",
      },
    },
    versions: { data: "s3-view", rules: "rules-v1" },
  };
}

describe("buildCalculatorViewModel", () => {
  test("maps direction without mutating raw state and preserves calculation output", () => {
    const input = state();
    const forward = buildCalculatorViewModel({
      activeDirection: "forward",
      completeSpiritIds: new Set(["water"]),
      favoriteSpiritIds: new Set(["fire"]),
      snapshot,
      state: input,
    });
    const reverse = buildCalculatorViewModel({
      activeDirection: "reverse",
      completeSpiritIds: new Set(["water"]),
      favoriteSpiritIds: new Set(["fire"]),
      snapshot,
      state: input,
    });

    expect(forward.configurationReady).toBe(true);
    expect(forward.active.attackSideKey).toBe("attacker");
    expect(reverse.active.attackSideKey).toBe("defender");
    expect(forward.result.attackerName).toBe("火灵");
    expect(reverse.result.attackerName).toBe("水灵");
    expect(forward.result.skillResults).toHaveLength(4);
    expect(forward.result.selectedResult.totalDamage).toBeGreaterThan(0);
    expect(forward.selectableSpirits.map((spirit) => spirit.favoriteState)).toEqual([
      "manual",
      "complete",
    ]);
    expect(forward.selectableSpirits[0]).toMatchObject({
      traitDescription: "入场首回合，获得物攻+100%。",
      traitName: "专注力",
    });
    expect(forward.sides.attacker.spirit).toMatchObject({
      traitDescription: "入场首回合，获得物攻+100%。",
      traitName: "专注力",
    });
    expect(input).toEqual(state());
  });

  test("returns an unresolved model when both spirits are not selected", () => {
    const input = state();
    input.sides.attacker.spiritId = null;

    const model = buildCalculatorViewModel({
      activeDirection: "forward",
      completeSpiritIds: new Set(),
      favoriteSpiritIds: new Set(),
      snapshot,
      state: input,
    });

    expect(model.configurationReady).toBe(false);
    expect(model.result).toBeNull();
    expect(model.calculation.forward.selectedResult).toMatchObject({
      reason: "请选择双方精灵",
      status: "unsupported",
    });
  });
});
