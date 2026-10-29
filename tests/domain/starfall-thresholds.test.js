import { afterEach, expect, test, vi } from "vitest";
import runtime from "../../public/data/runtime.json";
import globalRuntime from "../../public/data/global-runtime.json";
import * as core from "../../src/domain/calculate.js";
import { asResultRailModel, buildCalculatorViewModel, buildCombatState } from "../../src/domain/calculator-view-model.js";
import { createInitialState } from "../../src/state/defaults.js";
import { createUndoHistory } from "../../src/state/undo-history.js";
import { applyStarfallThreshold } from "../../src/state/starfall-thresholds.js";
import { withWebPreview } from "../../src/features/s5-preview/with-web-preview.js";
import { getS5PreviewTraitInputs } from "../../src/domain/s5-preview-traits.js";
import { STARFALL_TEMPLATES, buildStarfallTemplateState, createStarfallThresholdRanking,
  evaluateStarfallAt, findStarfallThreshold, getCurrentStarfallStacks, getStarfallSelection, withStarfallStacks } from "../../src/domain/starfall-thresholds.js";

const raceStats = { hp: 100, physicalAttack: 100, magicalAttack: 100, physicalDefense: 100, magicalDefense: 100, speed: 100 };
const skills = [
  { id: "weak", name: "轻击", type: "普通", category: "physical", basePower: 5, cost: 1 },
  { id: "wing", name: "翼击", type: "翼", category: "physical", basePower: 50, cost: 3 },
  { id: "multi", name: "多维击打", type: "幻", category: "physical", basePower: 15, cost: 4 },
  { id: "missing", name: "待核验技能", type: "普通", category: "physical", basePower: 20, ruleId: "unknown-test-rule" },
];
function fixture() {
  const snapshot = { meta: { id: "starfall-test", rulesVersion: "2026-07-23" }, skills, traits: [],
    spirits: [
      { id: "source", fullName: "攻击测试", stage: "三阶", types: ["翼"], raceStats: { ...raceStats }, traitIds: [] },
      { id: "target", fullName: "目标测试", stage: "首领", sourceCategory: "首领形态", types: ["水"], raceStats: { ...raceStats }, traitIds: [] },
      { id: "growth", fullName: "成长测试", stage: "一阶", types: ["草"], raceStats: { ...raceStats }, traitIds: [] },
    ], learnsets: ["source", "target", "growth"].map((spiritId) => ({ spiritId, skillIds: skills.map((skill) => skill.id) })),
    typeChart: { 翼: { 水: 1, 草: 1, 翼: 1 }, 幻: { 水: 1, 草: 1, 翼: 1 }, 普通: { 水: 1, 草: 1, 翼: 1 } } };
  const state = createInitialState(snapshot);
  state.mode = "four";
  for (const side of Object.values(state.sides)) side.skills = { single: "wing", four: skills.map((skill) => skill.id) };
  state.directions.forward.selectedSkillIndex = 1;
  state.directions.reverse.selectedSkillIndex = 2;
  return { snapshot, state };
}
function mockDamageAt(damageAt, warningsAt = () => []) {
  vi.spyOn(core, "calculateMatchup").mockImplementation((_snapshot, input) => {
    const stacks = input.marks.defender.negative.stacks;
    const damage = damageAt(stacks);
    const result = { status: "exact", totalDamage: damage, hpPercent: damage / 500 * 100, hitCount: 1,
      skillId: "wing", skillName: "翼击", warnings: warningsAt(stacks) };
    const direction = { results: [result, result, result, result], selectedResult: result };
    return { forward: direction, reverse: direction };
  });
}
afterEach(() => vi.restoreAllMocks());

test("当前对位从主UI同源状态计算，保留实际HP、减伤、槽位与反向方向", () => {
  const { snapshot, state } = fixture();
  state.directions.reverse.currentHp = 185;
  state.directions.reverse.reduction = .4;
  state.directions.reverse.context.weatherRain = true;
  const before = structuredClone(state);
  const actual = evaluateStarfallAt({ snapshot, state, direction: "reverse", selectedSkillIndex: 1, stacks: 7 });
  const input = withStarfallStacks(state, "reverse", 7, 1);
  const vm = buildCalculatorViewModel({ snapshot, state: input, activeDirection: "reverse" });
  expect(actual.status).toBe("exact");
  expect(actual.damage).toBe(vm.result.selectedResult.totalDamage);
  expect(actual.targetHp).toBe(185);
  expect(actual.lethal).toBe(actual.damage >= 185);
  expect(state).toEqual(before);
  const selection = getStarfallSelection(snapshot, state, "reverse", 1);
  expect(selection).toMatchObject({ sourceSide: "defender", targetSide: "attacker", index: 1, selected: { index: 1, skill: { name: "翼击" } } });
});

test("国际服星陨沿用S3服务器环境，与主计算双向结果一致", () => {
  const skill = globalRuntime.skills.find((entry) => entry.name === "撕咬");
  const state = createInitialState(globalRuntime);
  state.mode = "four";
  for (const side of Object.values(state.sides)) {
    side.skills = { single: skill.id, four: [skill.id, null, null, null] };
  }
  for (const direction of ["forward", "reverse"]) {
    const input = withStarfallStacks(state, direction, 7, 0);
    const vm = buildCalculatorViewModel({ snapshot: globalRuntime, state: input, activeDirection: direction });
    const actual = evaluateStarfallAt({ snapshot: globalRuntime, state, direction, selectedSkillIndex: 0, stacks: 7 });
    expect(actual.status).toBe("exact");
    expect(actual.damage).toBe(vm.result.selectedResult.totalDamage);
    expect(actual.maxHp).toBe(vm.result.defenderMaxHp);
  }
});

test.each([99, 79])("S5冥古龙%s级星陨复算投影当前等级面板，双向与主界面一致且不改存档", (level) => {
  const snapshot = withWebPreview(runtime);
  const spirit = snapshot.spirits.find((entry) => entry.previewIdentity?.key === "minggulong");
  const target = snapshot.spirits.find((entry) => entry.fullName === "迪莫");
  const skill = snapshot.skills.find((entry) => entry.name === "撕咬");
  const trait = snapshot.traits.find((entry) => spirit.traitIds.includes(entry.id));
  const state = createInitialState(snapshot);
  state.mode = "four";
  state.sides.attacker.spiritId = spirit.id;
  state.sides.defender.spiritId = target.id;
  for (const side of Object.values(state.sides)) {
    side.skills = { single: skill.id, four: [skill.id, null, null, null] };
  }
  for (const [direction, role] of [["forward", "attacker"], ["reverse", "defender"]]) {
    const control = getS5PreviewTraitInputs(trait, role).find((entry) => entry.contextKey.endsWith("BattleLevel"));
    state.directions[direction].context[control.id] = level;
  }
  const before = structuredClone(state);
  for (const direction of ["forward", "reverse"]) {
    const input = withStarfallStacks(state, direction, 7, 0);
    const vm = buildCalculatorViewModel({ snapshot, state: input, activeDirection: direction });
    const actual = evaluateStarfallAt({ snapshot, state, direction, selectedSkillIndex: 0, stacks: 7 });
    expect(vm.sides.attacker.combatLevel).toBe(level);
    expect(actual.status).toBe("exact");
    expect(actual.damage).toBe(vm.result.selectedResult.totalDamage);
    expect(actual.maxHp).toBe(vm.result.defenderMaxHp);
    expect(actual.targetHp).toBe(vm.result.defenderHp);
  }
  expect(state).toEqual(before);
});

test("显式0层覆盖legacy回退，0层即可击倒返回0且99层合法", () => {
  const { snapshot, state } = fixture();
  delete state.marks;
  state.directions.forward.starfallStacks = 50;
  expect(getCurrentStarfallStacks(state)).toBe(50);
  const zero = evaluateStarfallAt({ snapshot, state, stacks: 0 });
  const plain = fixture();
  expect(zero.damage).toBe(evaluateStarfallAt({ ...plain, stacks: 0 }).damage);
  state.directions.forward.currentHp = 1;
  const found = findStarfallThreshold({ snapshot, state, stacks: 99 });
  expect(found.status).toBe("found");
  expect(found.minimum).toBe(0);
  expect(found.threshold.stacks).toBe(0);
  expect(evaluateStarfallAt({ snapshot, state, stacks: 100 }).status).toBe("invalid");
});

test("从0至99按层枚举，不用单调假设；高层预览不确定不阻止较早确定KO", () => {
  const { snapshot, state } = fixture();
  mockDamageAt((stacks) => stacks === 4 || stacks === 9 ? 99999 : 0,
    (stacks) => stacks === 99 ? ["未计入特性：高层条件"] : []);
  const found = findStarfallThreshold({ snapshot, state, stacks: 99 });
  expect(found.current.status).toBe("uncertain");
  expect(found.status).toBe("found");
  expect(found.minimum).toBe(4);
  expect(found.reason).toBeNull();
  expect(core.calculateMatchup.mock.calls.map(([, input]) => input.marks.defender.negative.stacks)).toEqual([99, 0, 1, 2, 3, 4]);
});

test("99层边界、不可达、前置不确定与无效输入分别返回准确状态", () => {
  const { snapshot, state } = fixture();
  mockDamageAt((stacks) => stacks === 99 ? 99999 : 0);
  expect(findStarfallThreshold({ snapshot, state, stacks: 0 })).toMatchObject({ status: "found", minimum: 99 });
  vi.restoreAllMocks();
  mockDamageAt(() => 0);
  expect(findStarfallThreshold({ snapshot, state })).toMatchObject({ status: "unreachable", minimum: null });
  vi.restoreAllMocks();
  mockDamageAt((stacks) => stacks === 3 ? 99999 : 0, (stacks) => stacks === 1 ? ["未计入特性：存活条件"] : []);
  expect(findStarfallThreshold({ snapshot, state })).toMatchObject({ status: "uncertain", minimum: null });
  expect(evaluateStarfallAt({ snapshot, state, stacks: -1 }).status).toBe("invalid");
  expect(evaluateStarfallAt({ snapshot, state, selectedSkillIndex: 9 }).status).toBe("invalid");
});

test.each(["burn", "poison", "parasitism", "electrified"])("既有%s不会作为回合末扣血降低最低星陨层数", (status) => {
  const { snapshot, state } = fixture();
  state.calculationOptions.includeNegativeStatusSettlement = true;
  const baseline = findStarfallThreshold({ snapshot, state, stacks: 0 });
  state.negativeStatuses.defender[status] = 99;
  const affected = findStarfallThreshold({ snapshot, state, stacks: 0 });
  const directInput = withStarfallStacks(state, "forward", 0, 1);
  const mainResult = asResultRailModel({ snapshot, state: directInput, direction: "forward",
    calculation: core.calculateMatchup(snapshot, buildCombatState(directInput)), includeTurnPreview: false });
  expect(mainResult.selectedResult.negativeStatusSettlement.actualStatusDamage).toBeGreaterThan(0);
  expect(affected.status).toBe("found");
  expect(affected.minimum).toBe(baseline.minimum);
  expect(affected.current).toMatchObject({ damage: baseline.current.damage, statusDamage: 0, remainingHp: baseline.current.remainingHp });
});

test("冻结单独判断KO，未击倒时不伪造成伤害；免疫和关闭选项保留", () => {
  const { snapshot, state } = fixture();
  state.calculationOptions.includeNegativeStatusSettlement = true;
  state.directions.forward.currentHp = 160;
  const noFreeze = evaluateStarfallAt({ snapshot, state, stacks: 0 });
  state.negativeStatuses.defender.freeze = 10;
  const frozen = evaluateStarfallAt({ snapshot, state, stacks: 0 });
  expect(noFreeze.lethal).toBe(false);
  expect(frozen).toMatchObject({ damage: noFreeze.damage, lethal: true, freezeLethal: true, statusDamage: 0 });
  const iceSnapshot = { ...snapshot, spirits: snapshot.spirits.map((spirit) => spirit.id === "target" ? { ...spirit, types: ["冰"] } : spirit) };
  expect(evaluateStarfallAt({ snapshot: iceSnapshot, state, stacks: 0 })).toMatchObject({ freezeLethal: false, freezePercent: 0 });
  state.calculationOptions.includeNegativeStatusSettlement = false;
  expect(evaluateStarfallAt({ snapshot, state, stacks: 0 })).toMatchObject({ lethal: false, freezeThresholdHp: 0 });
});

test.each(["native", "borrowed", "acquired"])("未建模存活特性经%s来源进入时不能宣称确定斩杀", (source) => {
  const { snapshot, state } = fixture();
  snapshot.traits = [{ id: "survive", name: "不死鸟", description: "受到致命伤害时保留1血" }, { id: "moon", name: "铭记于月亮" }];
  if (source === "native") snapshot.spirits[1].traitIds = ["survive"];
  if (source === "borrowed") state.sides.defender.traits = [snapshot.traits[0]];
  if (source === "acquired") { snapshot.spirits[1].traitIds = ["moon"]; state.sides.defender.acquiredTraitIds = ["survive"]; }
  const result = findStarfallThreshold({ snapshot, state });
  expect(result.status).toBe("uncertain");
  expect(result.minimum).toBeNull();
  expect(result.limitations).toContain("不死鸟");
  state.sides.defender.ignoreTraits = true;
  expect(evaluateStarfallAt({ snapshot, state, stacks: 99 }).status).toBe("exact");
});

test("培养模板全部其余个体0，批量清理目标残血减伤异常并渐进优先当前目标", async () => {
  const { snapshot, state } = fixture();
  state.directions.forward.currentHp = 3;
  state.directions.forward.reduction = .1;
  state.negativeStatuses.defender.freeze = 8;
  expect(STARFALL_TEMPLATES).toMatchObject([
    { id: "hp", nature: "neutral", displayIvs: { hp: 60, physicalDefense: 0, magicalDefense: 0, physicalAttack: 0, magicalAttack: 0, speed: 0 } },
    { id: "defense", nature: "neutral", displayIvs: { hp: 60, physicalDefense: 60, magicalDefense: 60, physicalAttack: 0, magicalAttack: 0, speed: 0 } },
    { id: "tank", nature: "grounded", displayIvs: { hp: 60, physicalDefense: 60, magicalDefense: 60, physicalAttack: 0, magicalAttack: 0, speed: 0 } },
  ]);
  const prepared = buildStarfallTemplateState({ snapshot, state, spiritId: "target", templateId: "hp" });
  expect(prepared.directions.forward).toMatchObject({ reduction: 1, selectedSkillIndex: 1 });
  expect(prepared.directions.forward.currentHp).toBe(prepared.sides.defender.panelStats.hp);
  expect(prepared.sides.defender.ignoreTraits).toBe(true);
  expect(prepared.negativeStatuses.defender.freeze).toBe(0);
  const progress = vi.fn();
  const all = await createStarfallThresholdRanking({ snapshot, state, scope: "all", onProgress: progress });
  expect(all.rows.map((row) => row.spirit.id)).toEqual(["target", "source", "growth"]);
  expect(progress.mock.calls[0][0]).toMatchObject({ completed: 1, rows: [{ spirit: { id: "target" }, templates: expect.any(Array) }] });
  expect(progress.mock.calls[0][0].rows).toHaveLength(1);
  expect(all.rows.every((row) => row.templates.length === 3)).toBe(true);
  const final = await createStarfallThresholdRanking({ snapshot, state });
  expect(final.rows.map((row) => row.spirit.id)).toEqual(["target"]);
});

test("批量层间可取消，取消不返回过期整表", async () => {
  const { snapshot, state } = fixture();
  const controller = new AbortController();
  let time = 0;
  vi.spyOn(performance, "now").mockImplementation(() => time += 13);
  setTimeout(() => controller.abort(), 0);
  expect(await createStarfallThresholdRanking({ snapshot, state, scope: "all", signal: controller.signal })).toBeNull();
});

test("代入培养恢复特性、保持四技能及所选方向槽位，不写入最低层数，单事务可撤回", () => {
  const { snapshot, state } = fixture();
  snapshot.spirits[1].traitIds = ["survive"];
  snapshot.traits = [{ id: "survive", name: "不死鸟" }];
  const original = structuredClone(state);
  const history = createUndoHistory();
  const imported = applyStarfallThreshold({ snapshot, state, spiritId: "target", templateId: "tank" });
  expect(imported.persistence.rememberSide).toBeNull();
  expect(imported.state).toMatchObject({ mode: "four", sides: { defender: { ignoreTraits: false, nature: "grounded" } }, directions: { forward: { selectedSkillIndex: 1, starfallStacks: 0 } } });
  expect(imported.state.sides.attacker.skills.four).toEqual(state.sides.attacker.skills.four);
  expect(findStarfallThreshold({ snapshot, state: imported.state }).status).toBe("uncertain");
  const applied = applyStarfallThreshold({ snapshot, state, direction: "reverse", selectedSkillIndex: 2, stacks: 0 });
  expect(applied.state.directions.reverse.selectedSkillIndex).toBe(2);
  expect(applied.state.marks.attacker.negative).toEqual({ id: "starfall", stacks: 0 });
  history.record(state);
  expect(history.undo(applied.state).state).toEqual(original);
  expect(state).toEqual(original);
});
