import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, test } from "vitest";
import snapshot from "../src/data/bundled-runtime.js";
import BattleWorkspace from "../src/components/BattleWorkspace.jsx";
import { createCalculatorStore } from "../src/state/calculator-store.js";
import { createInitialState } from "../src/shared/state/defaults.js";
import { getS5PreviewTraitInputs } from "../src/shared/domain/s5-preview-traits.js";
import { canonicalTraitControlKey } from "../src/shared/state/trait-values.js";
import { createCalculationView } from "../src/view-models/calculation.js";
import { buildCombatState } from "../src/shared/build-combat-state.js";
import { encodeSharePayload, decodeSharePayloadResult } from "../src/share/payload.js";
import { createDirectionTraitViews } from "../src/view-models/traits.js";
import { createResultActions } from "../src/view-models/result-actions.js";
import { createShareSummary } from "../src/view-models/share-summary.js";
import { pinnedWebCalculate } from "./release-source.js";
import { createPersistence, MINIAPP_STATE_KEY } from "../src/state/persistence.js";
import { getS5PreviewBattleLevelEvaluation, withS5PreviewBattleLevels } from "../src/shared/domain/battle-level.js";

function configure(name, skillName) {
  const spirit = snapshot.spirits.find(entry => entry.fullName === name);
  const state = createInitialState(snapshot);
  state.mode = "single";
  state.sides.attacker.spiritId = spirit.id;
  state.sides.attacker.traitValues = {};
  const legal = snapshot.learnsets.find(pool => pool.spiritId === spirit.id)?.skillIds ?? [];
  const skill = snapshot.skills.find(entry => entry.name === skillName && legal.includes(entry.id)) ??
    snapshot.skills.find(entry => legal.includes(entry.id) && ["physical", "magical"].includes(entry.category));
  state.sides.attacker.skills.single = skill?.id ?? null;
  state.sides.attacker.skills.four = [skill?.id ?? null, null, null, null];
  const trait = snapshot.traits.find(entry => entry.id === spirit.traitIds[0]);
  return { spirit, state, trait, skill };
}

function assign(state, trait, suffix, value) {
  const control = getS5PreviewTraitInputs(trait).find(input => input.contextKey.endsWith(suffix));
  state.sides.attacker.traitValues[canonicalTraitControlKey(control)] = value;
  return control;
}

test.each([
  ["冥古龙", 99, 10, 99],
  ["阿布", 99, 2, 99],
  ["超能阿布", 99, 1, 99],
])("%s 首页可加减和清空重输等级，最高99级", (name, initial, step, maximum) => {
  const { state } = configure(name);
  const store = createCalculatorStore(snapshot, state);
  render(<BattleWorkspace snapshot={snapshot} store={store} />);
  const input = screen.getByRole("spinbutton", { name: "攻击方等级" });
  expect(input).toHaveValue(initial);
  fireEvent.click(screen.getByRole("button", { name: `攻击方等级降低${step}级` }));
  expect(input).toHaveValue(initial - step);
  fireEvent.input(input, { target: { value: "" } });
  expect(input.value).toBe("");
  fireEvent.input(input, { target: { value: "80" } });
  fireEvent.blur(input);
  expect(input).toHaveValue(80);
  fireEvent.input(input, { target: { value: "999" } });
  fireEvent.keyDown(input, { key: "Enter" });
  expect(input).toHaveValue(maximum);
  expect(screen.getByRole("button", { name: `攻击方等级提高${step}级` })).toBeDisabled();
  fireEvent.input(input, { target: { value: "0" } });
  fireEvent.blur(input);
  expect(input).toHaveValue(1);
  expect(screen.getByRole("button", { name: `攻击方等级降低${step}级` })).toBeDisabled();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "攻击方宠物摘要" }));
  fireEvent.input(screen.getByRole("textbox", { name: "搜索攻击方宠物" }), { target: { value: name } });
  fireEvent.click(screen.getByRole("button", { name: `选择${name}` }));
  expect(screen.getByRole("spinbutton", { name: "攻击方等级" })).toHaveValue(99);
});

test.each(["阿布", "超能阿布", "冥古龙"])("%s 默认99用于真实计算，已有等级60经保存、重开和分享保留", name => {
  const { state, trait } = configure(name);
  const fresh = createCalculatorStore(snapshot, state).getState();
  const evaluation = getS5PreviewBattleLevelEvaluation(snapshot, buildCombatState(fresh, snapshot), "attacker");
  expect(evaluation.currentLevel).toBe(99);
  if (name === "超能阿布") expect(evaluation.levelGain).toBe(39);
  expect(createCalculationView(snapshot, fresh, "forward").selectedResult.totalDamage)
    .toBe(pinnedWebCalculate(snapshot, withS5PreviewBattleLevels(snapshot, buildCombatState(fresh, snapshot))).forward.selectedResult.totalDamage);
  const control = assign(state, trait, "BattleLevel", 60);
  const key = canonicalTraitControlKey(control);
  const records = new Map();
  const persistence = createPersistence({ storage: {
    get: key => records.get(key), set: (key, value) => records.set(key, value), remove: key => records.delete(key),
  } });
  persistence.save(createCalculatorStore(snapshot, state).getState());
  const reopened = createCalculatorStore(snapshot, persistence.load(snapshot)).getState();
  expect(reopened.sides.attacker.traitValues[key]).toBe(60);
  const shared = decodeSharePayloadResult(encodeSharePayload(reopened), snapshot);
  expect(createCalculatorStore(snapshot, shared.state).getState().sides.attacker.traitValues[key]).toBe(60);
  // Older saves kept a raw direction value instead of a canonical trait value.
  const legacy = configure(name).state;
  legacy.directions.forward.context[control.contextKey] = 60;
  records.set(MINIAPP_STATE_KEY, { schemaVersion: 2, state: legacy });
  expect(createCalculatorStore(snapshot, persistence.load(snapshot)).getState().sides.attacker.traitValues[key]).toBe(60);
  for (const remembered of [false, true]) {
    const oldSkill = configure(name).state;
    const context = { attackerTraitS5CurrentLevel: 60 };
    oldSkill.sides.attacker.skills.single = {
      skillId: oldSkill.sides.attacker.skills.single,
      ...(remembered ? { memoryBySkill: { previous: { context } } } : { context }),
    };
    records.set(MINIAPP_STATE_KEY, { schemaVersion: 2, state: oldSkill });
    expect(createCalculatorStore(snapshot, persistence.load(snapshot)).getState().sides.attacker.traitValues[key]).toBe(60);
  }
});

test("首页双方等级独立，逆向、抽屉、伤害与分享同步；修改可撤回", () => {
  const { state } = configure("冥古龙");
  state.sides.defender = configure("阿布").state.sides.attacker;
  const store = createCalculatorStore(snapshot, state);
  render(<BattleWorkspace snapshot={snapshot} store={store} quickUndoEnabled />);
  const high = createCalculationView(snapshot, store.getState(), "reverse");
  const attackInput = screen.getByRole("spinbutton", { name: "攻击方等级" });
  fireEvent.input(attackInput, { target: { value: "79" } });
  const low = createCalculationView(snapshot, store.getState(), "reverse");
  expect(low.defenderMaxHp).toBeLessThan(high.defenderMaxHp);
  expect(low.selectedResult.totalDamage).not.toBe(high.selectedResult.totalDamage);
  fireEvent.click(screen.getByRole("button", { name: /撤回/ }));
  expect(attackInput).toHaveValue(99);
  fireEvent.input(attackInput, { target: { value: "79" } });
  fireEvent.input(screen.getByRole("spinbutton", { name: "防守方等级" }), { target: { value: "150" } });
  fireEvent.blur(screen.getByRole("spinbutton", { name: "防守方等级" }));
  fireEvent.click(screen.getByRole("button", { name: "切换计算方向" }));
  expect(screen.getByRole("spinbutton", { name: "攻击方等级" })).toHaveValue(79);
  expect(screen.getByRole("spinbutton", { name: "防守方等级" })).toHaveValue(99);
  fireEvent.click(screen.getByRole("button", { name: "防守方等级降低2级" }));
  expect(screen.getByRole("spinbutton", { name: "攻击方等级" })).toHaveValue(79);
  expect(screen.getByRole("spinbutton", { name: "防守方等级" })).toHaveValue(97);
  fireEvent.click(screen.getByRole("button", { name: "展开伤害结果" }));
  fireEvent.click(screen.getByRole("button", { name: "增减" }));
  const dialog = within(screen.getByRole("dialog", { name: "伤害结果" }));
  const levels = dialog.getAllByRole("spinbutton", { name: "当前等级" });
  expect(levels.map(input => Number(input.value))).toContain(97);
  const defenderLevel = levels.find(input => Number(input.value) === 97);
  expect(defenderLevel).toHaveAttribute("max", "99");
  fireEvent.input(defenderLevel, { target: { value: "150" } });
  fireEvent.blur(defenderLevel);
  expect(defenderLevel).toHaveValue(99);
  expect(screen.getByRole("spinbutton", { name: "防守方等级" })).toHaveValue(99);
  expect(store.getState().sides.attacker.level).toBeUndefined();
  const restored = decodeSharePayloadResult(encodeSharePayload(store.getState()), snapshot);
  expect(restored.status).toBe("valid");
  expect(createCalculationView(snapshot, restored.state, "reverse").selectedResult.totalDamage)
    .toBe(createCalculationView(snapshot, store.getState(), "reverse").selectedResult.totalDamage);
});

test.each(["阿布", "超能阿布"])("%s 旧存档150、分享150及后续动作都限制到99，保留原控件标识", name => {
  const { state, trait } = configure(name);
  const control = assign(state, trait, "BattleLevel", 150);
  const key = canonicalTraitControlKey(control);
  const store = createCalculatorStore(snapshot, state);
  expect(store.getState().sides.attacker.traitValues[key]).toBe(99);
  const view = createDirectionTraitViews(snapshot, store.getState(), "forward").attacker;
  expect(view.controls.find(input => input.id === control.id)).toMatchObject({ canonicalKey: key, max: 99 });
  const decoded = decodeSharePayloadResult(encodeSharePayload(state), snapshot);
  expect(decoded.status).toBe("valid");
  expect(decoded.state.sides.attacker.traitValues[key]).toBe(99);
  const records = new Map([[MINIAPP_STATE_KEY, { schemaVersion: 2, state }]]);
  const persistence = createPersistence({ storage: {
    get: key => records.get(key), set: (key, value) => records.set(key, value), remove: key => records.delete(key),
  } });
  expect(persistence.load(snapshot).sides.attacker.traitValues[key]).toBe(99);
  store.dispatch({ type: "side/set-trait-value", side: "attacker", key, value: 101 });
  expect(store.getState().sides.attacker.traitValues[key]).toBe(99);
  const expected = configure(name);
  assign(expected.state, expected.trait, "BattleLevel", 99);
  expect(createCalculationView(snapshot, store.getState(), "forward").selectedResult.totalDamage)
    .toBe(createCalculationView(snapshot, expected.state, "forward").selectedResult.totalDamage);
});

test("普通精灵和吞噬等级特性的狼王不出现首页等级控件", () => {
  const wolf = configure("银月狼王");
  const ming = configure("冥古龙");
  wolf.state.sides.attacker.acquiredTraitIds = [ming.trait.id];
  render(<BattleWorkspace snapshot={snapshot} store={createCalculatorStore(snapshot, wolf.state)} />);
  expect(screen.queryByRole("spinbutton", { name: /^(攻击方|防守方)等级$/ })).not.toBeInTheDocument();
});

test("真实 S5 滴廿豚骰点与网页同算，分享还原数值及效果说明", () => {
  expect(snapshot.meta.seasonId).toBe("S5");
  const { state, trait } = configure("滴廿豚");
  assign(state, trait, "DiceRolled", true);
  assign(state, trait, "DiceFace", 2);
  const mini = createCalculationView(snapshot, state, "forward");
  const web = pinnedWebCalculate(snapshot, buildCombatState(state, snapshot)).forward.selectedResult;
  expect(mini.selectedResult.totalDamage).toBe(web.totalDamage);
  const decoded = decodeSharePayloadResult(encodeSharePayload(state), snapshot);
  expect(decoded.status).toBe("valid");
  expect(decoded.state.sides.attacker.traitValues).toEqual(state.sides.attacker.traitValues);
  expect(createCalculationView(snapshot, decoded.state, "forward").selectedResult.totalDamage).toBe(mini.selectedResult.totalDamage);
  const actions = createResultActions({ snapshot, state, direction: "forward", calculation: mini,
    traitViews: createDirectionTraitViews(snapshot, state, "forward") });
  const summary = createShareSummary({ actions, snapshot, state });
  expect(JSON.stringify(summary)).toContain("双方技能威力+20");
  assign(state, trait, "DiceFace", 3);
  expect(createCalculationView(snapshot, state, "forward")).toMatchObject({ status: "unresolved", message: expect.stringContaining("行动后结算尚未接入") });
});

test("真实 S5 骰点选择控件自动触发且保存所属方", () => {
  const { state, trait } = configure("滴廿豚");
  const store = createCalculatorStore(snapshot, state);
  render(<BattleWorkspace snapshot={snapshot} store={store} />);
  fireEvent.click(screen.getByRole("button", { name: "展开伤害结果" }));
  fireEvent.click(screen.getByRole("button", { name: "增减" }));
  fireEvent.change(screen.getByRole("combobox", { name: "骰点" }), { target: { value: "1" } });
  const controls = getS5PreviewTraitInputs(trait);
  expect(store.getState().sides.attacker.traitValues[canonicalTraitControlKey(controls.find(input => input.contextKey.endsWith("DiceRolled")))]).toBe(true);
  expect(store.getState().sides.attacker.traitValues[canonicalTraitControlKey(controls.find(input => input.contextKey.endsWith("DiceFace")))]).toBe(2);
  expect(createCalculationView(snapshot, store.getState(), "forward").status).toBe("exact");
});

test("真实 S5 银龙攻击结算后换矿物置换真正触发，主页与后续伤害同步", () => {
  const { state, trait, skill } = configure("地绡银龙", "扬尘");
  assign(state, trait, "EnergySpent", 0);
  assign(state, trait, "SettledEnergySpent", 0);
  const store = createCalculatorStore(snapshot, state);
  const cost = createCalculationView(snapshot, state, "forward").selectedResult.skillCost;
  render(<BattleWorkspace snapshot={snapshot} store={store} />);
  fireEvent.click(screen.getByRole("button", { name: "展开伤害结果" }));
  fireEvent.click(screen.getByRole("button", { name: "增减" }));
  fireEvent.click(screen.getByRole("button", { name: `使用${skill.name}` }));
  const controls = getS5PreviewTraitInputs(trait);
  const countKey = canonicalTraitControlKey(controls.find(input => input.contextKey.endsWith("EnergySpent") && !input.hidden));
  const settledKey = canonicalTraitControlKey(controls.find(input => input.contextKey.endsWith("SettledEnergySpent")));
  expect(store.getState().sides.attacker.traitValues[countKey]).toBe(cost);
  fireEvent.click(within(screen.getByRole("dialog", { name: "伤害结果" })).getByRole("button", { name: "回合结束" }));
  expect(store.getState().sides.attacker.traitValues[settledKey]).toBe(cost);
  fireEvent.click(within(screen.getByRole("dialog", { name: "伤害结果" })).getByRole("button", { name: "回合结束" }));
  expect(store.getState().sides.attacker.traitValues[settledKey]).toBe(cost);
  fireEvent.click(within(screen.getByRole("dialog", { name: "伤害结果" })).getByRole("button", { name: "关闭伤害结果" }));
  fireEvent.click(screen.getByRole("button", { name: "选择攻击方单技能" }));
  fireEvent.click(screen.getByRole("button", { name: /^矿物置换 / }));
  fireEvent.click(screen.getByRole("button", { name: "展开伤害结果" }));
  expect(store.getState().directions.forward.overrides.magicalAttackLevelStageAdd).toBe(12);
  fireEvent.click(within(screen.getByRole("dialog", { name: "伤害结果" })).getByRole("button", { name: "关闭伤害结果" }));
  expect(screen.getByLabelText("分类能力等级合计")).toHaveTextContent("攻击合计：物攻 0% · 魔攻 +120%");
  fireEvent.click(screen.getByRole("button", { name: "选择攻击方单技能" }));
  fireEvent.click(screen.getByRole("button", { name: /^扬尘 / }));
  const boostedState = store.getState();
  const boosted = createCalculationView(snapshot, boostedState, "forward");
  const unboosted = createCalculationView(snapshot, {
    ...boostedState,
    directions: { ...boostedState.directions, forward: { ...boostedState.directions.forward,
      overrides: { ...boostedState.directions.forward.overrides, magicalAttackLevelStageAdd: 0 },
    } },
  }, "forward");
  expect(boosted.status).toBe("exact");
  expect(boosted.selectedResult.totalDamage).toBeGreaterThan(unboosted.selectedResult.totalDamage);
  expect(boosted.selectedResult.totalDamage).toBe(pinnedWebCalculate(snapshot, buildCombatState(boostedState, snapshot)).forward.selectedResult.totalDamage);
  expect(boostedState.sides.attacker.traitValues[settledKey]).toBe(cost);
});

test.each(["single", "four"])("%s 槽位状态技能互切保留已生效增益，新技能可触发和取消", (mode) => {
  const { state } = configure("地绡银龙", "矿物置换");
  state.mode = mode;
  const store = createCalculatorStore(snapshot, state);
  render(<BattleWorkspace snapshot={snapshot} store={store} />);
  const close = () => fireEvent.click(within(screen.getByRole("dialog", { name: "伤害结果" })).getByRole("button", { name: "关闭伤害结果" }));
  const select = (name, index = 0) => {
    fireEvent.click(screen.getByRole("button", { name: mode === "single" ? "选择攻击方单技能" : `选择攻击方技能 ${index + 1}` }));
    fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${name} `) }));
    fireEvent.click(screen.getByRole("button", { name: "展开伤害结果" }));
  };
  fireEvent.click(screen.getByRole("button", { name: "展开伤害结果" }));
  expect(store.getState().directions.forward.overrides.magicalAttackLevelStageAdd).toBe(12);
  close();
  select("魔法增效");
  expect(store.getState().directions.forward.overrides.magicalAttackLevelStageAdd).toBe(19);
  expect(screen.getByRole("button", { name: "取消状态触发" })).toHaveTextContent("已触发");
  close();
  select("魔法增效");
  expect(store.getState().directions.forward.overrides.magicalAttackLevelStageAdd).toBe(19);
  fireEvent.click(screen.getByRole("button", { name: "取消状态触发" }));
  expect(store.getState().directions.forward.overrides.magicalAttackLevelStageAdd).toBe(12);
  close();
  select("矿物置换");
  expect(store.getState().directions.forward.overrides.magicalAttackLevelStageAdd).toBe(24);
  if (mode === "four") {
    close();
    select("魔法增效", 1);
    expect(store.getState().directions.forward.overrides.magicalAttackLevelStageAdd).toBe(31);
    close();
    select("矿物置换", 0);
    expect(store.getState().directions.forward.overrides.magicalAttackLevelStageAdd).toBe(31);
    expect(screen.getByRole("button", { name: "取消状态触发" })).toHaveTextContent("已触发");
  }
});

test("未开放精灵和未接随机状态保持不可计算，不产生伪精确结果", () => {
  const hidden = configure("呼拉猫");
  expect(hidden.spirit.calculationStatus).toBe("pending-race-stats");
  expect(createCalculationView(snapshot, hidden.state, "forward")).toMatchObject({ status: "unresolved", rows: [], message: "种族值待确认" });
  const pending = configure("滴廿豚", "混合态");
  const view = createCalculationView(snapshot, pending.state, "forward");
  expect(view.status).toBe("unresolved");
  expect(view.message).toContain("随机减益结果尚未接入");
  const actions = createResultActions({ snapshot, state: pending.state, direction: "forward", calculation: view,
    traitViews: createDirectionTraitViews(snapshot, pending.state, "forward") });
  expect([...actions.defense, ...actions.modifiers].some(action => action.kind === "skill" && action.name === "混合态")).toBe(false);
});

test("真实矿物置换仅增加魔攻，续杯按骰子减费后的实际能耗结算", () => {
  const mineral = configure("地绡银龙", "矿物置换");
  const mineralStore = createCalculatorStore(snapshot, mineral.state);
  const first = render(<BattleWorkspace snapshot={snapshot} store={mineralStore} />);
  fireEvent.click(screen.getByRole("button", { name: "展开伤害结果" }));
  expect(mineralStore.getState().directions.forward.overrides).toMatchObject({
    attackLevelStage: 0, physicalAttackLevelStageAdd: 0, magicalAttackLevelStageAdd: 12,
  });
  expect(screen.getByLabelText("分类能力等级合计")).toHaveTextContent("攻击合计：物攻 0% · 魔攻 +120%");
  expect(screen.queryByRole("spinbutton", { name: "静态威力" })).not.toBeInTheDocument();
  first.unmount();

  const refill = configure("乐乐鲨", "续杯");
  const dice = configure("滴廿豚");
  assign(dice.state, dice.trait, "DiceRolled", true);
  assign(dice.state, dice.trait, "DiceFace", 4);
  refill.state.sides.defender = dice.state.sides.attacker;
  expect(createCalculationView(snapshot, refill.state, "forward").rows[0].skillCost).toBe(1);
  const refillStore = createCalculatorStore(snapshot, refill.state);
  render(<BattleWorkspace snapshot={snapshot} store={refillStore} />);
  fireEvent.click(screen.getByRole("button", { name: "展开伤害结果" }));
  expect(refillStore.getState().directions.forward.overrides.attackLevelStage).toBe(10);
});

test("狼王吞噬 S5 银龙特性后累计与回合结束也使用独立控件值", () => {
  const wolf = configure("银月狼王");
  const silver = configure("地绡银龙");
  const controls = getS5PreviewTraitInputs(silver.trait);
  const counter = controls.find(control => control.contextKey.endsWith("EnergySpent") && !control.hidden);
  const settled = controls.find(control => control.contextKey.endsWith("SettledEnergySpent"));
  wolf.state.sides.attacker.acquiredTraitIds = [silver.trait.id];
  wolf.state.sides.attacker.acquiredTraitValues = { [silver.trait.id]: {
    [canonicalTraitControlKey(counter)]: 0, [canonicalTraitControlKey(settled)]: 0,
  } };
  const store = createCalculatorStore(snapshot, wolf.state);
  render(<BattleWorkspace snapshot={snapshot} store={store} />);
  fireEvent.input(screen.getByRole("spinbutton", { name: "累计消耗能量" }), { target: { value: "3" } });
  fireEvent.click(screen.getByRole("button", { name: "回合结束" }));
  expect(store.getState().sides.attacker.acquiredTraitValues[silver.trait.id]).toMatchObject({
    [canonicalTraitControlKey(counter)]: 3, [canonicalTraitControlKey(settled)]: 3,
  });
});
