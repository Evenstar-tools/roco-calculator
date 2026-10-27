import { describe, expect, test } from "vitest";
import { calculateAllPanelStats, calculatePanelStat } from "../../src/domain/stat.js";
import { calculateMatchup } from "../../src/domain/calculate.js";
import { calculateDamage } from "../../src/domain/damage.js";
import { resolveCombatant } from "../../src/domain/skill-result/loadout.js";
import { getSnapshotIndexes } from "../../src/domain/snapshot-indexes.js";

const raceStats = { hp: 100, physicalAttack: 100, magicalAttack: 100,
  physicalDefense: 100, magicalDefense: 100, speed: 100 };
const displayIvs = Object.fromEntries(Object.keys(raceStats).map(key => [key, 60]));
const snapshot = {
  meta: { id: "level-core-fixture", rulesVersion: "level-core-fixture" },
  spirits: ["a", "b"].map(id => ({ id, fullName: id, types: [], raceStats, traitIds: [] })),
  traits: [], typeChart: null,
  skills: [
    { id: "hit", name: "测试物伤", type: "普通", category: "physical", basePower: 100, cost: 2 },
    { id: "listen", name: "听桥", type: "武", category: "defense", basePower: 0, cost: 2 },
  ],
  learnsets: [],
};
function battle(mode = "single") {
  return {
    mode,
    sides: Object.fromEntries(["attacker", "defender"].map((side, index) => [side, {
      spiritId: index ? "b" : "a", displayIvs: { ...displayIvs },
      skills: { single: "hit", four: ["hit", "listen", null, null] },
    }])),
    directions: { forward: { selectedSkillIndex: 0 }, reverse: { selectedSkillIndex: 0 } },
  };
}
const panel = level => calculateAllPanelStats({ raceStats, displayIvs, level });
const coefficientInput = result => result.formulaSteps.find(step => step.label === "等级系数与攻防比").input;
const expectedDamage = (attack, defense, power, level) => calculateDamage({
  attackerStat: attack, defenderDefense: defense, displayedPower: power, level, hitCount: 1,
}).total;

describe("explicit owner battle levels", () => {
  test("level60 retains all measured panel values and omitted-level compatibility", () => {
    expect(calculateAllPanelStats({ raceStats, displayIvs })).toEqual(panel(60));
    expect(panel(60)).toEqual({ hp: 391, physicalAttack: 203, magicalAttack: 203,
      physicalDefense: 203, magicalDefense: 203, speed: 203 });
    expect(calculatePanelStat({ kind: "physicalDefense", race: 105, displayIv: 0, level: 60 })).toBe(175);
    expect(calculatePanelStat({ kind: "speed", race: 85, displayIv: 0, level: 60 })).toBe(154);
  });

  test.each([[1, 179, 126], [79, 459, 228], [80, 463, 229], [99, 531, 254]])(
    "candidate level%s recomputes inner HP offset and every scaled stat", (level, hp, other) => {
      expect(panel(level)).toEqual({ hp, physicalAttack: other, magicalAttack: other,
        physicalDefense: other, magicalDefense: other, speed: other });
    },
  );

  test("nature remains after inner scaling and before the constant tail", () => {
    expect(calculatePanelStat({ kind: "hp", race: 100, displayIv: 60, natureMultiplier: 1.2, level: 99 })).toBe(617);
    expect(calculatePanelStat({ kind: "physicalAttack", race: 100, displayIv: 60, natureMultiplier: 1.2, level: 99 })).toBe(295);
    expect(panel(99).hp).not.toBe(Math.round(panel(60).hp * 99 / 60));
  });

  test.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])("invalid explicit panel level %s fails instead of silently falling back", (level) => {
    expect(() => panel(level)).toThrow("level must be a positive integer");
  });

  test("loadout returns explicit owner level and panel without mutating input or overriding manual panels", () => {
    const input = battle();
    input.sides.attacker.level = 99;
    const original = structuredClone(input);
    const resolved = resolveCombatant(snapshot, input.sides.attacker, "single", getSnapshotIndexes(snapshot));
    expect(resolved).toMatchObject({ level: 99, panelStats: panel(99) });
    const manualPanel = { ...panel(60), physicalAttack: 777 };
    const manual = resolveCombatant(snapshot, { ...input.sides.attacker, panelStats: manualPanel }, "single", getSnapshotIndexes(snapshot));
    expect(manual.level).toBe(99);
    expect(manual.panelStats).toBe(manualPanel);
    expect(input).toEqual(original);
  });

  test("single results use each owner's level for panel, HP and directional coefficient", () => {
    const input = battle();
    input.level = 40;
    input.sides.attacker.level = 99;
    input.sides.defender.level = 79;
    const original = structuredClone({ input, snapshot });
    const { forward, reverse } = calculateMatchup(snapshot, input);
    expect(coefficientInput(forward.selectedResult)).toMatchObject({ level: 99, attackerStat: 254, defenderDefense: 228 });
    expect(coefficientInput(reverse.selectedResult)).toMatchObject({ level: 79, attackerStat: 228, defenderDefense: 254 });
    expect(forward.selectedResult.totalDamage).toBe(expectedDamage(254, 228, 100, 99));
    expect(reverse.selectedResult.totalDamage).toBe(expectedDamage(228, 254, 100, 79));
    expect(forward.selectedResult.hpPercent).toBeCloseTo(forward.selectedResult.totalDamage / 459 * 100, 8);
    expect(reverse.selectedResult.hpPercent).toBeCloseTo(reverse.selectedResult.totalDamage / 531 * 100, 8);
    expect({ input, snapshot }).toEqual(original);
  });

  test("legacy global level changes only the coefficient; mixed explicit sides override it independently", () => {
    const input = battle();
    input.level = 99;
    const legacy = calculateMatchup(snapshot, input);
    for (const direction of ["forward", "reverse"]) {
      expect(coefficientInput(legacy[direction].selectedResult)).toMatchObject({ level: 99, attackerStat: 203, defenderDefense: 203 });
    }
    input.sides.attacker.level = 79;
    const mixed = calculateMatchup(snapshot, input);
    expect(coefficientInput(mixed.forward.selectedResult)).toMatchObject({ level: 79, attackerStat: 228, defenderDefense: 203 });
    expect(coefficientInput(mixed.reverse.selectedResult)).toMatchObject({ level: 99, attackerStat: 203, defenderDefense: 228 });
  });

  test("four-skill reflected Listen Bridge uses its current owner level in either direction", () => {
    const input = battle("four");
    input.sides.attacker.level = 99;
    input.sides.defender.level = 79;
    const { forward, reverse } = calculateMatchup(snapshot, input);
    expect(forward.results[1]).toMatchObject({ skillName: "听桥", reflectedPower: 100, status: "exact" });
    expect(reverse.results[1]).toMatchObject({ skillName: "听桥", reflectedPower: 100, status: "exact" });
    expect(coefficientInput(forward.results[1]).level).toBe(99);
    expect(coefficientInput(reverse.results[1]).level).toBe(79);
    expect(forward.results[1].totalDamage).toBe(expectedDamage(254, 228, 100, 99));
    expect(reverse.results[1].totalDamage).toBe(expectedDamage(228, 254, 100, 79));
  });

  test("starfall additions and direct trait damage share each owner's explicit level", () => {
    const input = battle("four");
    input.sides.attacker.level = 99;
    input.sides.defender.level = 79;
    input.directions.forward.starfallStacks = 2;
    input.directions.reverse.starfallStacks = 2;
    const directSnapshot = { ...snapshot,
      spirits: snapshot.spirits.map(spirit => ({ ...spirit, traitIds: ["spikes"] })),
      traits: [{ id: "spikes", name: "刺肤" }],
    };
    const { forward, reverse } = calculateMatchup(directSnapshot, input);
    expect(forward.selectedResult.additionalDamage).toBe(expectedDamage(254, 228, 28, 99));
    expect(reverse.selectedResult.additionalDamage).toBe(expectedDamage(228, 254, 28, 79));
    expect(forward.traitResult.totalDamage).toBe(expectedDamage(254, 228, 50, 99));
    expect(reverse.traitResult.totalDamage).toBe(expectedDamage(228, 254, 50, 79));
  });
});
