import { expect, test } from "vitest";
import { createInitialState } from "../../src/state/defaults.js";
import { importDamageComparisonCandidate } from "../../src/state/damage-comparison.js";
import { buildCalculatorViewModel } from "../../src/domain/calculator-view-model.js";
import { getS5PreviewTraitInputs } from "../../src/domain/s5-preview-traits.js";
import { calculateAllPanelStats } from "../../src/domain/stat.js";
import { getNatureMultipliers } from "../../src/domain/natures.js";
import { buildDamageComparisonInput, createSkillDamageRanking, damageComparisonIssue } from "../../src/domain/skill-damage-ranking.js";

const raceStats = { hp: 100, physicalAttack: 100, magicalAttack: 100,
  physicalDefense: 100, magicalDefense: 100, speed: 100 };
function fixture(key, direction) {
  const mechanicKey = key === "minggulong" ? key : "abu";
  const identity = { catalogId: "s5-ranking-test", key, mechanicKey };
  const trait = { id: "level-trait", name: "前瞻特性", previewIdentity: identity };
  const snapshot = {
    meta: { id: "s5-ranking-test" }, typeChart: null,
    spirits: [
      { id: "source", fullName: "source", previewIdentity: identity, traitIds: [trait.id] },
      { id: "target", fullName: "target", traitIds: [] },
    ].map(spirit => ({ ...spirit, types: [], stage: "首领", sourceCategory: "首领形态", raceStats })),
    traits: [trait], learnsets: [],
    skills: [{ id: "hit", name: "测试物伤", type: "普通", category: "physical", basePower: 80, cost: 2 }],
  };
  const state = createInitialState(snapshot);
  const sourceSide = direction === "forward" ? "attacker" : "defender";
  const targetSide = sourceSide === "attacker" ? "defender" : "attacker";
  state.sides[sourceSide].spiritId = "source";
  state.sides[targetSide].spiritId = "target";
  const levelInput = getS5PreviewTraitInputs(trait).find(control => control.contextKey.endsWith("CurrentLevel"));
  state.directions[direction].context[levelInput.id] = 99;
  return { snapshot, state, direction, sourceSide, targetSide, templateId: "standard-hp-v1" };
}

test.each(["forward", "reverse"])("%s S5 source level matches main VM and does not alter target templates or stored imports", async direction => {
  for (const key of ["abu", "boss-abu", "super-abu", "minggulong"]) {
    const options = fixture(key, direction);
    const { snapshot, state, sourceSide, targetSide } = options;
    state.sides[sourceSide].panelStats = { ...calculateAllPanelStats({ raceStats }), physicalAttack: 9999 };
    const before = structuredClone({ snapshot, state });
    const target = snapshot.spirits.find(spirit => spirit.id === "target");
    const rawInput = buildDamageComparisonInput({ ...options, spirit: target });
    expect(rawInput.sides[sourceSide]).not.toHaveProperty("level");
    expect(rawInput.sides[targetSide]).not.toHaveProperty("level");
    const ranking = await createSkillDamageRanking(options);
    const row = ranking.rows.find(entry => entry.spirit.id === "target");
    expect(row, key).toBeTruthy();
    const step = row.result.formulaSteps.find(entry => entry.label === "等级系数与攻防比");
    expect(step.input.level).toBe(99);
    expect(step.input.attackerStat).toBe(254);
    expect(row.panelStats).toEqual(calculateAllPanelStats({ raceStats,
      displayIvs: row.template.displayIvs, natureMultipliers: getNatureMultipliers(row.template.natureId), level: 60 }));
    const imported = importDamageComparisonCandidate({ ...options, spirit: target });
    expect(imported.sides[sourceSide]).not.toHaveProperty("level");
    expect(imported.sides[targetSide]).not.toHaveProperty("level");
    const main = buildCalculatorViewModel({ snapshot, state: imported, activeDirection: direction });
    expect(main.calculation[direction].selectedResult.totalDamage).toBe(row.damage);
    expect({ snapshot, state }).toEqual(before);
  }
});

test("ordinary source stays60 despite forged S5 context, with its explicit manual panel intact", async () => {
  const options = fixture("abu", "forward");
  const { snapshot, state } = options;
  const ordinary = { ...snapshot, spirits: snapshot.spirits.map(spirit => spirit.id === "source"
    ? { ...spirit, previewIdentity: undefined, traitIds: [] } : spirit) };
  state.sides.attacker.level = 99;
  state.sides.attacker.panelStats = { ...calculateAllPanelStats({ raceStats }), physicalAttack: 333 };
  const ranking = await createSkillDamageRanking({ ...options, snapshot: ordinary });
  const row = ranking.rows.find(entry => entry.spirit.id === "target");
  const step = row.result.formulaSteps.find(entry => entry.label === "等级系数与攻防比");
  expect(step.input).toMatchObject({ level: 60, attackerStat: 333 });
  expect(state.sides.attacker.level).toBe(99);
  expect(state.sides.attacker.panelStats.physicalAttack).toBe(333);
});

test.each(["forward", "reverse"])("%s invalid Minggulong level blocks ranking instead of falling back to60", async direction => {
  const options = fixture("minggulong", direction);
  const { snapshot, state } = options;
  const count = getS5PreviewTraitInputs(snapshot.traits[0]).find(control => control.contextKey.endsWith("LevelEventCount"));
  state.directions[direction].context[count.id] = 10;
  const original = structuredClone(state);
  expect(damageComparisonIssue(snapshot, state, direction)).toContain("下降下限");
  const result = await createSkillDamageRanking(options);
  expect(result).toMatchObject({ rows: [], issue: expect.stringContaining("下降下限") });
  expect(state).toEqual(original);
});

test("Minggulong target stays a60-level no-trait template; importing enables its actual99 level without fabricated context", async () => {
  const options = fixture("minggulong", "forward");
  const { snapshot, state } = options;
  state.sides.attacker.spiritId = "target";
  state.sides.defender.spiritId = "source";
  state.directions.forward.context = {};
  const ming = snapshot.spirits.find(spirit => spirit.id === "source");
  const input = buildDamageComparisonInput({ ...options, spirit: ming });
  expect(input.sides.defender.ignoreTraits).toBe(true);
  expect(input.sides.defender).not.toHaveProperty("level");
  const ranking = await createSkillDamageRanking(options);
  const row = ranking.rows.find(entry => entry.spirit.id === ming.id);
  expect(row.result.traitContributions ?? []).toEqual([]);
  expect(row.panelStats.hp).toBe(calculateAllPanelStats({ raceStats,
    displayIvs: row.template.displayIvs, natureMultipliers: getNatureMultipliers(row.template.natureId), level: 60 }).hp);
  const imported = importDamageComparisonCandidate({ ...options, spirit: ming });
  expect(imported.sides.defender).not.toHaveProperty("ignoreTraits");
  expect(imported.sides.defender).not.toHaveProperty("level");
  expect(imported.directions.forward.context).toEqual(input.directions.forward.context);
  expect(imported.directions.reverse.context).toEqual(input.directions.reverse.context);
  const main = buildCalculatorViewModel({ snapshot, state: imported, activeDirection: "forward" });
  expect(main.sides.defender.combatLevel).toBe(99);
  expect(main.sides.defender.panelStats.hp).toBeGreaterThan(row.panelStats.hp);
  expect(main.calculation.forward.selectedResult.totalDamage).toBeLessThan(row.damage);
});
