import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { buildCalculatorViewModel } from "../../src/domain/calculator-view-model.js";
import { damagePresentation } from "../../src/domain/result-presentation.js";
import { getS5PreviewTraitInputs } from "../../src/domain/s5-preview-traits.js";
import { createInitialState } from "../../src/state/defaults.js";
import { updateMirroredTraitContext } from "../../src/state/calculator-session.js";
import { applyBattleActivation, canApplyBattleActivation, canToggleNegativeStatusActivation } from "../../src/state/battle-activation.js";
import { applyS5PreviewDreamTurnEnd, synchronizeS5PreviewConfirmationFromUse, synchronizeS5PreviewSkillUse, withS5PreviewSettlements } from "../../src/features/s5-preview/settlement.js";

const current = JSON.parse(readFileSync("public/data/runtime.json", "utf8"));
const stats = { hp: 100, physicalAttack: 100, magicalAttack: 100, physicalDefense: 100, magicalDefense: 100, speed: 100, total: 600 };
const sourceId = "s5-settlement-source";
const targetId = "s5-settlement-target";

function fixture(key, names = ["撕咬"], { sourceSide = "attacker", mode = "four" } = {}) {
  const trait = { id: "s5-settlement-trait", name: "前瞻特性", description: "测试已确认当前状态",
    previewIdentity: { catalogId: "s5-settlement-fixture", mechanicKey: key, key } };
  const selected = names.map(name => current.skills.find(skill => skill.name === name));
  const snapshot = { ...current,
    spirits: [...current.spirits,
      { id: sourceId, fullName: "特性持有者", types: [], raceStats: { ...stats }, traitIds: [trait.id] },
      { id: targetId, fullName: "本次目标", types: [], raceStats: { ...stats }, traitIds: [] }],
    traits: [...current.traits, trait],
    learnsets: [...current.learnsets, ...[sourceId, targetId].map(spiritId => ({ spiritId, skillIds: selected.map(skill => skill.id) }))],
  };
  const state = createInitialState(snapshot);
  state.mode = mode;
  state.calculationOptions = { ...state.calculationOptions, includeNegativeStatusSettlement: true };
  for (const [side, value] of Object.entries(state.sides)) {
    value.spiritId = side === sourceSide ? sourceId : targetId;
    value.skills = { single: selected[0].id, four: [...selected.map(skill => skill.id), null, null, null].slice(0, 4) };
  }
  const direction = sourceSide === "attacker" ? "forward" : "reverse";
  function set(suffix, value) {
    const input = getS5PreviewTraitInputs(trait).find(control => control.contextKey === `attackerTraitS5${suffix}`);
    if (!input) throw new Error(`Missing fixture control: ${suffix}`);
    if (["SnowActive", "SnowTriggered", "SnowTurnsRemaining"].includes(suffix)) {
      Object.assign(state, updateMirroredTraitContext(state, { direction, key: input.id, value }).state);
    } else state.directions[direction].context[input.id] = value;
    return input;
  }
  const raw = () => buildCalculatorViewModel({ snapshot, state, activeDirection: direction });
  return { snapshot, state, trait, set, raw, direction, targetSide: sourceSide === "attacker" ? "defender" : "attacker" };
}

describe("Web S5 current-use applications and independent status settlement", () => {
  test.each(["attacker", "defender"].flatMap(sourceSide => ["four", "single"].map(mode => ({ sourceSide, mode }))))
  ("水母读取明确印记输入，$sourceSide/$mode只结算一次，不把状态叠进技能伤害", options => {
    const f = fixture("boss-glass-jellyfish", ["撕咬"], options);
    f.set("SkillUsed", true); f.set("PoisonMarkStacks", 3);
    f.state.negativeStatuses[f.targetSide] = { poison: 1 };
    f.state.marks[f.targetSide].negative = { id: "poison", stacks: 90 };
    const beforeState = structuredClone(f.state);
    const raw = f.raw();
    const direct = raw.result.selectedResult.totalDamage;
    const result = withS5PreviewSettlements(raw, f.snapshot, f.state);
    const row = result.result.selectedResult;
    expect(row.totalDamage).toBe(direct);
    expect(row.negativeStatusApplications.stacks.poison).toBe(6);
    expect(row.negativeStatusSettlement).toMatchObject({ directDamage: direct, stacks: { poison: 7 } });
    expect(row.negativeStatusSettlement.statusDamage).toBeGreaterThan(raw.result.selectedResult.negativeStatusSettlement.statusDamage);
    expect(damagePresentation(row).damage).toBe(direct + row.negativeStatusSettlement.actualStatusDamage);
    expect(result.skillResultsByDirection[f.direction][0].negativeStatusSettlement.stacks.poison).toBe(7);
    expect(result.calculation[f.direction].selectedResult.negativeStatusApplications.stacks.poison).toBe(6);
    expect(f.state).toEqual(beforeState);
    const twice = withS5PreviewSettlements(result, f.snapshot, f.state);
    expect(twice.result.selectedResult.negativeStatusApplications.stacks.poison).toBe(6);
    expect(twice.result.selectedResult.negativeStatusSettlement).toEqual(row.negativeStatusSettlement);
    expect(twice.result.selectedResult.totalDamage).toBe(direct);
  });

  test("关闭状态开关或未确认使用时，保持原视图与原计算", () => {
    const f = fixture("boss-glass-jellyfish");
    f.set("PoisonMarkStacks", 5);
    const unused = f.raw();
    expect(withS5PreviewSettlements(unused, f.snapshot, f.state)).toBe(unused);
    f.set("SkillUsed", true);
    f.state.calculationOptions.includeNegativeStatusSettlement = false;
    const disabled = f.raw();
    expect(withS5PreviewSettlements(disabled, f.snapshot, f.state)).toBe(disabled);
  });

  test("明确使用非伤害技能后，状态损失独立可算；直接伤害保持零", () => {
    const f = fixture("boss-glass-jellyfish", ["防御"]);
    f.set("SkillUsed", true); f.set("PoisonMarkStacks", 2);
    const result = withS5PreviewSettlements(f.raw(), f.snapshot, f.state).result.selectedResult;
    expect(result).toMatchObject({ status: "exact", statusOnly: true, totalDamage: 0, hpPercent: 0 });
    expect(result.negativeStatusSettlement).toMatchObject({ directDamage: 0, stacks: { poison: 4 } });
    expect(damagePresentation(result).damage).toBe(result.negativeStatusSettlement.actualStatusDamage);
    expect(result.negativeStatusCanApply).toBe(f.raw().result.selectedResult.negativeStatusCanApply);
  });

  test.each(["attacker", "defender"].flatMap(sourceSide => ["four", "single"].map(mode => ({ sourceSide, mode }))))
  ("$sourceSide/$mode原生状态技能确认、取消、重用共用本槽计数，取消优先于旧S5确认", options => {
    const f = fixture("boss-glass-jellyfish", ["霜降"], options);
    const key = options.mode === "four" ? "1" : "single";
    f.state.directions[f.direction].context.negativeStatusUseCountsBySlot = { [key]: 0, untouched: 3 };
    f.set("PoisonMarkStacks", 2);
    const initial = f.raw();
    expect(withS5PreviewSettlements(initial, f.snapshot, f.state)).toBe(initial);
    expect(initial.result.selectedResult.negativeStatusApplications.stacks.freeze ?? 0).toBe(0);

    const control = f.set("SkillUsed", true);
    const confirmed = synchronizeS5PreviewSkillUse(f.state, { side: options.sourceSide, control, value: true, snapshot: f.snapshot });
    expect(confirmed).not.toBe(f.state);
    expect(f.state.directions[f.direction].context.negativeStatusUseCountsBySlot[key]).toBe(0);
    Object.assign(f.state, confirmed);
    expect(f.state.directions[f.direction].context.negativeStatusUseCountsBySlot).toEqual({ [key]: 1, untouched: 3 });
    let view = withS5PreviewSettlements(f.raw(), f.snapshot, f.state);
    expect(view.result.selectedResult.negativeStatusApplications.stacks).toMatchObject({ freeze: 4, poison: 4 });
    const skill = f.snapshot.skills.find(item => item.name === "霜降");
    expect(canToggleNegativeStatusActivation(skill, {}, { negativeStatusEnabled: true })).toBe(true);

    const cancel = applyBattleActivation({ calculation: view.calculation, side: options.sourceSide,
      skillIndex: 0, skillMode: options.mode, snapshot: f.snapshot, state: f.state });
    expect(cancel.applied).toBe(true);
    Object.assign(f.state, cancel.state);
    expect(f.state.directions[f.direction].context[control.id]).toBe(true);
    view = withS5PreviewSettlements(f.raw(), f.snapshot, f.state);
    expect(view.result.selectedResult.negativeStatusApplications.stacks.freeze ?? 0).toBe(0);
    expect(view.result.selectedResult.negativeStatusApplications.stacks.poison ?? 0).toBe(0);
    expect(f.state.directions[f.direction].context.negativeStatusUseCountsBySlot[key]).toBe(0);

    const reuse = applyBattleActivation({ calculation: view.calculation, side: options.sourceSide,
      skillIndex: 0, skillMode: options.mode, snapshot: f.snapshot, state: f.state });
    expect(reuse.applied).toBe(true);
    Object.assign(f.state, reuse.state);
    view = withS5PreviewSettlements(f.raw(), f.snapshot, f.state);
    expect(view.result.selectedResult.negativeStatusApplications.stacks).toMatchObject({ freeze: 4, poison: 4 });
    expect(view.result.selectedResult.totalDamage).toBe(0);

    // A native use alone does not manufacture the separate S5 confirmation.
    f.set("SkillUsed", false);
    const nativeOnly = f.raw();
    expect(withS5PreviewSettlements(nativeOnly, f.snapshot, f.state)).toBe(nativeOnly);
    expect(nativeOnly.result.selectedResult.negativeStatusApplications.stacks).toMatchObject({ freeze: 4, poison: 0 });
    Object.assign(f.state, synchronizeS5PreviewSkillUse(f.state, { side: options.sourceSide, control, value: false, snapshot: f.snapshot }));
    expect(f.state.directions[f.direction].context.negativeStatusUseCountsBySlot[key]).toBe(0);
  });

  test("同步仅影响持有方当前选中槽，系别不符/未确认回零，无关输入和非原生应用保持原引用", () => {
    const f = fixture("watermelon-bug", ["撕咬", "霜降"], { sourceSide: "defender" });
    f.state.directions.reverse.selectedSkillIndex = 1;
    f.state.directions.reverse.context.negativeStatusUseCountsBySlot = { 1: 2, 2: 1 };
    const control = f.set("UsedSkillType", "none");
    const before = structuredClone(f.state);
    const next = synchronizeS5PreviewSkillUse(f.state, { side: "defender", control, value: "bug", snapshot: f.snapshot });
    expect(next.directions.reverse.context.negativeStatusUseCountsBySlot).toEqual({ 1: 2, 2: 0 });
    expect(next.directions.forward).toBe(f.state.directions.forward);
    expect(next.sides).toBe(f.state.sides);
    expect(f.state).toEqual(before);
    expect(synchronizeS5PreviewSkillUse(next, { side: "defender", control, value: "none", snapshot: f.snapshot })).toBe(next);
    expect(synchronizeS5PreviewSkillUse(f.state, { side: "defender", control: { contextKey: "attackerTraitS5SnowActive" }, value: true, snapshot: f.snapshot })).toBe(f.state);

    const pure = fixture("watermelon-bug", ["贮藏"]);
    const pureControl = pure.set("UsedSkillType", "bug");
    expect(synchronizeS5PreviewSkillUse(pure.state, { side: "attacker", control: pureControl, value: "bug", snapshot: pure.snapshot })).toBe(pure.state);
    const raw = pure.raw();
    const projected = withS5PreviewSettlements(raw, pure.snapshot, pure.state);
    const row = projected.result.selectedResult;
    expect(row.negativeStatusApplications.stacks.parasitism).toBe(1);
    expect(row.negativeStatusCanApply).toBe(raw.result.selectedResult.negativeStatusCanApply);
    const skill = pure.snapshot.skills.find(item => item.name === "贮藏");
    const context = pure.state.directions.forward.context;
    const options = { negativeStatusEnabled: true, negativeStatusCanApply: row.negativeStatusCanApply };
    expect(canApplyBattleActivation(skill, context, options)).toBe(canApplyBattleActivation(skill, context, { negativeStatusEnabled: true }));
    expect(canToggleNegativeStatusActivation(skill, context, options)).toBe(false);
  });

  test.each(["attacker", "defender"])("%s原生取消/重用同步两向S5确认，不清手动印记或其他特性", sourceSide => {
    const f = fixture("boss-glass-jellyfish", ["霜降"], { sourceSide });
    f.set("SkillUsed", true); f.set("PoisonMarkStacks", 3);
    const outgoing = getS5PreviewTraitInputs(f.trait).find(input => input.contextKey === "attackerTraitS5SkillUsed");
    const incoming = getS5PreviewTraitInputs(f.trait, "defender").find(input => input.contextKey === "defenderTraitS5SkillUsed");
    const otherDirection = f.direction === "forward" ? "reverse" : "forward";
    f.state.directions[otherDirection].context[incoming.id] = true;
    f.state.directions[otherDirection].context.unrelatedTrait = 42;
    const before = structuredClone(f.state);
    const cancelled = synchronizeS5PreviewConfirmationFromUse(f.state, { side: sourceSide, snapshot: f.snapshot, used: false });
    expect(cancelled.directions[f.direction].context[outgoing.id]).toBe(false);
    expect(cancelled.directions[otherDirection].context[incoming.id]).toBe(false);
    expect(cancelled.directions[otherDirection].context.unrelatedTrait).toBe(42);
    const mark = getS5PreviewTraitInputs(f.trait).find(input => input.contextKey === "attackerTraitS5PoisonMarkStacks");
    expect(cancelled.directions[f.direction].context[mark.id]).toBe(3);
    expect(cancelled.sides).toBe(f.state.sides);
    expect(f.state).toEqual(before);
    expect(synchronizeS5PreviewConfirmationFromUse(cancelled, { side: sourceSide, snapshot: f.snapshot, used: false })).toBe(cancelled);
    const reused = synchronizeS5PreviewConfirmationFromUse(cancelled, { side: sourceSide, snapshot: f.snapshot, used: true });
    expect(reused.directions[f.direction].context[outgoing.id]).toBe(true);
    expect(reused.directions[otherDirection].context[incoming.id]).toBe(true);
    f.snapshot.spirits.find(spirit => spirit.id === sourceId).traitIds = [];
    expect(synchronizeS5PreviewConfirmationFromUse(cancelled, { side: sourceSide, snapshot: f.snapshot, used: true })).toBe(cancelled);
  });

  test("捆缚实际虫系状态施加与西瓜虫确认共用当前槽，取消/重用同步系别及寄生", () => {
    const f = fixture("watermelon-bug", ["撕咬", "捆缚"], { sourceSide: "defender" });
    f.state.directions.reverse.selectedSkillIndex = 1;
    const control = f.set("UsedSkillType", "bug");
    Object.assign(f.state, synchronizeS5PreviewSkillUse(f.state, { side: "defender", control, value: "bug", snapshot: f.snapshot }));
    expect(f.state.directions.reverse.context.negativeStatusUseCountsBySlot).toEqual({ 2: 1 });
    let view = withS5PreviewSettlements(f.raw(), f.snapshot, f.state);
    expect(view.result.selectedResult.negativeStatusApplications.stacks).toMatchObject({ poison: 4, parasitism: 1 });
    const invoke = () => applyBattleActivation({ calculation: view.calculation, side: "defender", skillIndex: 1,
      skillMode: "four", snapshot: f.snapshot, state: f.state });
    Object.assign(f.state, invoke().state);
    Object.assign(f.state, synchronizeS5PreviewConfirmationFromUse(f.state, { side: "defender", snapshot: f.snapshot, used: false }));
    expect(f.state.directions.reverse.context[control.id]).toBe("none");
    view = withS5PreviewSettlements(f.raw(), f.snapshot, f.state);
    expect(view.result.selectedResult.negativeStatusApplications.stacks.parasitism ?? 0).toBe(0);
    Object.assign(f.state, invoke().state);
    Object.assign(f.state, synchronizeS5PreviewConfirmationFromUse(f.state, { side: "defender", snapshot: f.snapshot, used: true }));
    expect(f.state.directions.reverse.context[control.id]).toBe("bug");
    const mirrored = getS5PreviewTraitInputs(f.trait, "defender").find(input => input.contextKey === "defenderTraitS5UsedSkillType");
    expect(f.state.directions.forward.context[mirrored.id]).toBe("bug");
    view = withS5PreviewSettlements(f.raw(), f.snapshot, f.state);
    expect(view.result.selectedResult.negativeStatusApplications.stacks).toMatchObject({ poison: 4, parasitism: 1 });
    expect(view.result.results[0].negativeStatusApplications.stacks.parasitism ?? 0).toBe(0);
  });

  test("复用既有99层上限与类型免疫，不自行制造更高层数或毒伤", () => {
    const f = fixture("boss-glass-jellyfish");
    f.set("SkillUsed", true); f.set("PoisonMarkStacks", 99);
    f.state.negativeStatuses[f.targetSide] = { poison: 98 };
    f.snapshot.spirits.find(spirit => spirit.id === targetId).types = ["毒"];
    const result = withS5PreviewSettlements(f.raw(), f.snapshot, f.state).result.selectedResult;
    expect(result.negativeStatusApplications.stacks.poison).toBe(99);
    expect(result.negativeStatusSettlement.stacks.poison).toBe(99);
    expect(result.negativeStatusSettlement.breakdown.find(entry => entry.id === "poison"))
      .toMatchObject({ immune: true, damage: 0 });
  });

  test("鲸羽回合末尚待适配，当前技能冻结/已有冻结/本次伤害均保持原生结果", () => {
    const f = fixture("jingyu", ["滚雪球"]);
    f.set("SnowActive", true);
    f.state.negativeStatuses[f.targetSide] = { freeze: 4 };
    f.state.marks[f.targetSide].negative = { id: "starfall", stacks: 2 };
    const original = structuredClone(f.state);
    const raw = f.raw();
    expect(raw.result.selectedResult.negativeStatusApplications.stacks.freeze).toBe(2);
    const result = withS5PreviewSettlements(raw, f.snapshot, f.state).result.selectedResult;
    expect(result.negativeStatusApplications.stacks.freeze).toBe(2);
    expect(result.negativeStatusSettlement.freeze.stacks).toBe(6);
    expect(result.totalDamage).toBe(raw.result.selectedResult.totalDamage);
    expect(result.additionalDamage).toBe(raw.result.selectedResult.additionalDamage);
    expect(result.s5Effects ?? []).toEqual([]);
    expect(result).toBe(raw.result.selectedResult);
    expect(f.state).toEqual(original);
  });

  test("鲸羽不把既有冻结或其他特性来源冒充本次技能冻结", () => {
    const f = fixture("jingyu", ["撕咬"]);
    f.set("SnowActive", true);
    f.state.negativeStatuses[f.targetSide] = { freeze: 9 };
    const raw = f.raw();
    expect(withS5PreviewSettlements(raw, f.snapshot, f.state)).toBe(raw);
    const fireSkill = f.snapshot.skills.find(skill => skill.type === "火" && skill.category === "physical");
    f.state.sides.attacker.skills.four[0] = fireSkill.id;
    f.snapshot.traits.push({ id: "extra-freeze", name: "灵魂灼伤", description: "已有规则来源" });
    f.snapshot.spirits.find(spirit => spirit.id === sourceId).traitIds.push("extra-freeze");
    const inherited = f.raw();
    expect(inherited.result.selectedResult.negativeStatusApplications.sources).toContainEqual(expect.objectContaining({ kind: "trait", stacks: { freeze: 2 } }));
    expect(withS5PreviewSettlements(inherited, f.snapshot, f.state)).toBe(inherited);
  });

  test.each(["attacker", "defender"].flatMap(sourceSide => ["four", "single"].map(mode => ({ sourceSide, mode }))))
  ("鲸羽$sourceSide/$mode状态技能使用与取消保持冻结，不用旧确认提前触发回合末", ({ sourceSide, mode }) => {
    const f = fixture("jingyu", ["霜降"], { sourceSide, mode });
    f.set("SnowActive", true);
    const context = f.state.directions[f.direction].context;
    context.negativeStatusUseCountsBySlot = { [mode === "four" ? "1" : "single"]: 0 };
    context.attackerTraitS5FreezeApplicationConfirmed = true;
    let view = withS5PreviewSettlements(f.raw(), f.snapshot, f.state);
    expect(view.result.selectedResult.s5Effects ?? []).toEqual([]);
    const use = () => applyBattleActivation({ calculation: view.calculation, side: sourceSide,
      skillIndex: 0, skillMode: mode, snapshot: f.snapshot, state: f.state });
    const applied = use();
    expect(applied.applied).toBe(true);
    Object.assign(f.state, applied.state);
    f.state.directions[f.direction].context.attackerTraitS5FreezeApplicationConfirmed = false;
    view = withS5PreviewSettlements(f.raw(), f.snapshot, f.state);
    expect(view.result.selectedResult.negativeStatusApplications.stacks.freeze).toBe(4);
    expect(view.result.selectedResult.s5Effects ?? []).toEqual([]);
    const cancelled = use();
    expect(cancelled.applied).toBe(true);
    Object.assign(f.state, cancelled.state);
    view = withS5PreviewSettlements(f.raw(), f.snapshot, f.state);
    expect(view.result.selectedResult.s5Effects ?? []).toEqual([]);
    expect(view.result.selectedResult.negativeStatusApplications.stacks.freeze ?? 0).toBe(0);
  });

  test("西瓜虫依实际本槽系别施加1层寄生，不把四槽累计到同一次计算", () => {
    const f = fixture("watermelon-bug", ["虫鸣", "撕咬"]);
    f.set("UsedSkillType", "bug");
    f.state.negativeStatuses[f.targetSide] = { parasitism: 2 };
    const raw = f.raw();
    const result = withS5PreviewSettlements(raw, f.snapshot, f.state);
    expect(result.result.results[0].negativeStatusApplications.stacks.parasitism).toBe(1);
    expect(result.result.results[0].negativeStatusSettlement.stacks.parasitism).toBe(3);
    expect(result.result.results[1]).toBe(raw.result.results[1]);
    expect(result.result.selectedResult.totalDamage).toBe(raw.result.selectedResult.totalDamage);
    expect(result.skillResultsByDirection.forward[0].negativeStatusApplications.stacks.parasitism).toBe(1);
  });

  test.each([
    ["doulie", [["SnowTriggered", true], ["SnowTurnsRemaining", 3]], "剩余3回合"],
    ["crab-coconut", [["GrassDiscountReady", true]], "下次行动草系技能能耗-3待生效"],
  ])("%s结算注记不重复扣血或再次减费", (key, controls, text) => {
    const f = fixture(key);
    for (const [suffix, value] of controls) f.set(suffix, value);
    const original = structuredClone(f.state);
    const raw = f.raw();
    const result = withS5PreviewSettlements(raw, f.snapshot, f.state).result.selectedResult;
    expect(result.traitSettlements.some(entry => entry.text.includes(text))).toBe(true);
    expect(result.totalDamage).toBe(raw.result.selectedResult.totalDamage);
    expect(result.skillCost).toBe(raw.result.selectedResult.skillCost);
    expect(result.negativeStatusSettlement).toBe(raw.result.selectedResult.negativeStatusSettlement);
    expect(result.negativeStatusApplications).toBe(raw.result.selectedResult.negativeStatusApplications);
    expect(f.state).toEqual(original);
  });

  test("同一结果的别名仍指向同一投影对象，不修改原结果", () => {
    const f = fixture("boss-glass-jellyfish"); f.set("SkillUsed", true); f.set("PoisonMarkStacks", 2);
    const raw = f.raw();
    const alias = raw.result.results[0];
    raw.calculation.forward.results[0] = alias;
    raw.calculation.forward.selectedResult = alias;
    raw.result.selectedResult = alias;
    raw.skillResultsByDirection.forward[0] = alias;
    const original = structuredClone(alias);
    const result = withS5PreviewSettlements(raw, f.snapshot, f.state);
    expect(result.result.selectedResult).toBe(result.result.results[0]);
    expect(result.result.selectedResult).toBe(result.calculation.forward.results[0]);
    expect(result.result.selectedResult).toBe(result.calculation.forward.selectedResult);
    expect(result.result.selectedResult).toBe(result.skillResultsByDirection.forward[0]);
    expect(alias).toEqual(original);
  });

  test("未选具体伤害来源的旧配置仍沿用技能默认；原生精灵视图不产生变化", () => {
    const f = fixture("boss-glass-jellyfish"); f.set("SkillUsed", true); f.set("PoisonMarkStacks", 2);
    f.state.directions.forward.selectedDamageSource = null;
    const raw = f.raw();
    expect(withS5PreviewSettlements(raw, f.snapshot, f.state).result.selectedResult.negativeStatusApplications.stacks.poison).toBe(4);
    f.snapshot.spirits.find(spirit => spirit.id === sourceId).traitIds = [];
    const ordinary = f.raw();
    expect(withS5PreviewSettlements(ordinary, f.snapshot, f.state)).toBe(ordinary);
  });
});

describe("S5萌系天气的明确回合末寄生动作", () => {
  function dream(f) {
    for (const direction of Object.values(f.state.directions)) direction.context.weatherDream = true;
  }

  test.each(["attacker", "defender"].flatMap(sourceSide => ["铃兰", "铃兰夫人"].map(name => ({ sourceSide, name }))))
  ("$name/$sourceSide按有效特性施加3层，不依赖名称、技能或异常结算开关", ({ sourceSide, name }) => {
    const f = fixture("lily-of-valley", ["撕咬"], { sourceSide });
    f.snapshot.spirits.find(spirit => spirit.id === sourceId).fullName = name;
    f.state.sides[sourceSide].skills = { single: null, four: [null, null, null, null] };
    f.state.calculationOptions.includeNegativeStatusSettlement = false;
    f.state.negativeStatuses[f.targetSide] = { poison: 4, parasitism: 2 };
    dream(f);
    const before = structuredClone(f.state);
    const result = applyS5PreviewDreamTurnEnd(f.state, { side: sourceSide, snapshot: f.snapshot });
    expect(result).toMatchObject({ applied: true, added: 3, total: 5 });
    expect(result.state.negativeStatuses[f.targetSide]).toMatchObject({ parasitism: 5, poison: 4 });
    expect(result.state.negativeStatuses[sourceSide]).toBe(f.state.negativeStatuses[sourceSide]);
    expect(result.state.sides).toBe(f.state.sides);
    expect(result.state.directions).toBe(f.state.directions);
    expect(result.state.calculationOptions).toBe(f.state.calculationOptions);
    expect(f.state).toEqual(before);
    const nextTurn = applyS5PreviewDreamTurnEnd(result.state, { side: sourceSide, snapshot: f.snapshot });
    expect(nextTurn).toMatchObject({ applied: true, added: 3, total: 8 });
    expect(result.state.negativeStatuses[f.targetSide].parasitism).toBe(5);
  });

  test("没有萌系天气时拒绝；旧独立梦境与回合末确认不能绕过全场天气", () => {
    const f = fixture("lily-of-valley");
    f.state.directions.forward.context = { attackerTraitS5DreamActive: true, attackerTraitS5TurnEndConfirmed: true };
    const result = applyS5PreviewDreamTurnEnd(f.state, { side: "attacker", snapshot: f.snapshot });
    expect(result).toMatchObject({ applied: false, added: 0, total: 0, reason: expect.stringContaining("天气") });
    expect(result.state).toBe(f.state);
  });

  test("禁用特性、普通特性和仅同名精灵不能施加", () => {
    const f = fixture("lily-of-valley");
    dream(f);
    f.state.sides.attacker.ignoreTraits = true;
    expect(applyS5PreviewDreamTurnEnd(f.state, { side: "attacker", snapshot: f.snapshot }))
      .toMatchObject({ state: f.state, applied: false, added: 0 });
    f.state.sides.attacker.ignoreTraits = false;
    const holder = f.snapshot.spirits.find(spirit => spirit.id === sourceId);
    holder.fullName = "铃兰夫人";
    holder.traitIds = [];
    expect(applyS5PreviewDreamTurnEnd(f.state, { side: "attacker", snapshot: f.snapshot }).state).toBe(f.state);
    holder.traitIds = [f.trait.id];
    f.trait.previewIdentity.mechanicKey = "watermelon-bug";
    expect(applyS5PreviewDreamTurnEnd(f.state, { side: "attacker", snapshot: f.snapshot }).applied).toBe(false);
  });

  test("沿用99层上限，记录实际新增；满层时保持原状态且给出原因", () => {
    const f = fixture("lily-of-valley");
    dream(f);
    f.state.negativeStatuses.defender.parasitism = 98.9;
    const capped = applyS5PreviewDreamTurnEnd(f.state, { side: "attacker", snapshot: f.snapshot });
    expect(capped).toMatchObject({ applied: true, added: 1, total: 99 });
    const full = applyS5PreviewDreamTurnEnd(capped.state, { side: "attacker", snapshot: f.snapshot });
    expect(full).toMatchObject({ applied: false, added: 0, total: 99, reason: expect.stringContaining("99层") });
    expect(full.state).toBe(capped.state);
    expect(f.state.negativeStatuses.defender.parasitism).toBe(98.9);
  });

  test("旧确认和重渲染不再自动追加或制造寄生说明，只有明确动作更改状态", () => {
    const f = fixture("lily-of-valley");
    dream(f);
    f.state.directions.forward.context.attackerTraitS5DreamActive = true;
    f.state.directions.forward.context.attackerTraitS5TurnEndConfirmed = true;
    const before = structuredClone(f.state);
    const raw = f.raw();
    expect(withS5PreviewSettlements(raw, f.snapshot, f.state)).toBe(raw);
    expect(withS5PreviewSettlements(raw, f.snapshot, f.state)).toBe(raw);
    expect(raw.result.selectedResult.traitSettlements ?? []).not.toContainEqual(expect.objectContaining({ timing: "turn-end" }));
    expect(f.state).toEqual(before);
    const applied = applyS5PreviewDreamTurnEnd(f.state, { side: "attacker", snapshot: f.snapshot });
    const afterState = structuredClone(applied.state);
    const afterView = buildCalculatorViewModel({ snapshot: f.snapshot, state: applied.state, activeDirection: f.direction });
    expect(withS5PreviewSettlements(afterView, f.snapshot, applied.state)).toBe(afterView);
    expect(applied.state).toEqual(afterState);
    expect(applied.state.negativeStatuses.defender.parasitism).toBe(3);
  });
});


test("显式点击非当前槽时按被点击技能回填，不借用另一个槽的系别", () => {
  const f = fixture("watermelon-bug", ["撕咬", "捆缚"]);
  f.state.directions.forward.selectedSkillIndex = 0;
  const next = synchronizeS5PreviewConfirmationFromUse(f.state, { side: "attacker", snapshot: f.snapshot, used: true, skillIndex: 1 });
  const control = getS5PreviewTraitInputs(f.trait).find(input => input.contextKey.endsWith("UsedSkillType"));
  expect(next.directions.forward.context[control.id]).toBe("bug");
  expect(next.directions.forward.selectedSkillIndex).toBe(0);
});
