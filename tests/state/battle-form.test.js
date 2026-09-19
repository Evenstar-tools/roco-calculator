import { expect, test } from "vitest";
import snapshot from "../../public/data/runtime.json";
import { getSpirit, getPanelView } from "../../src/domain/calculator-view-model.js";
import { assertSnapshotReferences, createProductInitialState, reduceSessionAction, selectSpirit, switchBattleForm } from "../../src/state/calculator-session.js";
import { getBattleFormChoices } from "../../src/domain/battle-form.js";
import { getEffectiveTraits } from "../../src/domain/effective-traits.js";
import { getTraitEffectInputs } from "../../src/domain/trait-effects.js";
import { calculateMatchup } from "../../src/domain/calculate.js";
import { encodeShareState, decodeShareState } from "../../src/state/share.js";
import { createUndoHistory } from "../../src/state/undo-history.js";

const spirit = (name) => snapshot.spirits.find((entry) => entry.fullName === name);

function configured(name, side = "attacker") {
  const initialState = createProductInitialState(snapshot);
  return selectSpirit(initialState, { initialState, side, snapshot, spiritId: spirit(name).id }).state;
}

test("三三切同族形态保留双方全部输入，只重算该侧基础面板", () => {
  const before = configured("梦想三三");
  before.directions.forward.overrides = { attackLevelStage: 2, fixedPowerAdd: 20 };
  before.directions.forward.context = { attackerTraitStacks: 3, weatherRainTurns: 4 };
  before.directions.reverse.context = { defenderTraitStacks: 3, currentHpPercent: 49 };
  before.marks.defender.negative = { id: "starfall", stacks: 4 };
  before.negativeStatuses.defender.freeze = 3;
  const original = structuredClone(before);
  const result = switchBattleForm(before, { side: "attacker", snapshot, spiritId: spirit("气球猫").id });
  expect(result.persistence.rememberSide).toBeNull();
  expect(result.state.sides.attacker.spiritId).toBe(before.sides.attacker.spiritId);
  expect(result.state.sides.attacker.skills).toEqual(before.sides.attacker.skills);
  expect(result.state.sides.defender).toEqual(before.sides.defender);
  expect(result.state.directions).toEqual(before.directions);
  expect(result.state.marks).toEqual(before.marks);
  expect(result.state.negativeStatuses).toEqual(before.negativeStatuses);
  const form = getSpirit(snapshot, result.state.sides.attacker);
  expect(form.id).toBe(spirit("气球猫").id);
  expect(form.traitName).toBe("鼓气");
  expect(getPanelView(form, result.state.sides.attacker)).not.toEqual(getPanelView(spirit("梦想三三"), before.sides.attacker));
  expect(before).toEqual(original);
});

test.each(["attacker", "defender"])("%s 切形态后实际攻守计算使用目标种族值及原特性", (side) => {
  let before = configured("波普鹿", side);
  const opponent = side === "attacker" ? "defender" : "attacker";
  before = selectSpirit(before, { initialState: createProductInitialState(snapshot), side: opponent, snapshot, spiritId: spirit("迪莫").id }).state;
  const trait = snapshot.traits.find((entry) => entry.name === "超级电池");
  const control = getTraitEffectInputs(trait).find((input) => input.contextKey === "attackerTraitStacks");
  before.directions[side === "attacker" ? "forward" : "reverse"].context[control.id] = 2;
  const after = switchBattleForm(before, { side, snapshot, spiritId: spirit("奔乐鹿").id }).state;
  const derived = getSpirit(snapshot, after.sides[side]);
  expect(derived.traitName).toBe("超级电池");
  expect(derived.battleFormTraitRetained).toBe(true);
  const expectedSnapshot = { ...snapshot, spirits: snapshot.spirits.map((entry) => entry.id === spirit("波普鹿").id ? { ...entry, raceStats: spirit("奔乐鹿").raceStats } : entry) };
  const result = calculateMatchup(snapshot, after);
  const expected = calculateMatchup(expectedSnapshot, before);
  for (const direction of ["forward", "reverse"]) {
    expect(result[direction].selectedResult.totalDamage).toBe(expected[direction].selectedResult.totalDamage);
    expect(result[direction].selectedResult.combatPanel).toEqual(expected[direction].selectedResult.combatPanel);
  }
});

test("三三四形态互切使用同一组层数，不区分永久且不重复叠加", () => {
  let state = configured("梦想三三");
  state.directions.forward.context.attackerTraitStacks = 3;
  for (const name of ["奇梦咪", "逗逗", "气球猫", "梦想三三"]) {
    state = switchBattleForm(state, { side: "attacker", snapshot, spiritId: spirit(name).id }).state;
    const form = getSpirit(snapshot, state.sides.attacker);
    expect(form.traitName).toBe(name === "奇梦咪" ? "三鼓作气" : "鼓气");
    expect(form.battleFormTraitRetained).toBe(false);
    expect(getEffectiveTraits(snapshot, { ...state.sides.attacker, spirit: form })).toHaveLength(1);
    expect(state.directions.forward.context.attackerTraitStacks).toBe(3);
  }
});

test("蒸汽革命降阶保留 25 层及物防，不按低阶 20 层封顶", () => {
  const before = configured("烈焰狂战士");
  const trait = snapshot.traits.find((entry) => entry.name === "蒸汽革命");
  const control = getTraitEffectInputs(trait).find((input) => input.contextKey === "attackerTraitStacks");
  before.directions.forward.context[control.id] = 25;
  const after = switchBattleForm(before, { side: "attacker", snapshot, spiritId: spirit("火尾瓦特").id }).state;
  expect(after.directions.forward.context[control.id]).toBe(25);
  const form = getSpirit(snapshot, after.sides.attacker);
  expect(getEffectiveTraits(snapshot, { spirit: form }).map((entry) => entry.name)).toEqual(["蒸汽革命"]);
  expect(getTraitEffectInputs(trait, "defender").some((entry) => entry.defaultValue === 5)).toBe(true);
});

test("分支身份不会因降到共享低阶丢失，渗透继承只计算一次", () => {
  const before = configured("棋契陛下（白棋棋绮后分支）");
  const after = switchBattleForm(before, { side: "attacker", snapshot, spiritId: spirit("棋棋（白子）").id }).state;
  expect(getBattleFormChoices(snapshot.spirits, after.sides.attacker).some((entry) => entry.fullName === "棋祈督（白子）")).toBe(false);
  expect(() => switchBattleForm(after, { side: "attacker", snapshot, spiritId: spirit("棋祈督（白子）").id })).toThrow();
  const form = getSpirit(snapshot, after.sides.attacker);
  expect(getEffectiveTraits(snapshot, { spirit: form }).filter((entry) => entry.name === "渗透")).toHaveLength(1);
});

test("当前形态无操作，不相关精灵拒绝，原预设载入仍清除临时形态", () => {
  const before = configured("梦想三三");
  expect(switchBattleForm(before, { side: "attacker", snapshot, spiritId: spirit("梦想三三").id }).state).toBe(before);
  expect(() => switchBattleForm(before, { side: "attacker", snapshot, spiritId: spirit("迪莫").id })).toThrow();
  const after = switchBattleForm(before, { side: "attacker", snapshot, spiritId: spirit("气球猫").id }).state;
  const reset = selectSpirit(after, { initialState: createProductInitialState(snapshot), side: "attacker", snapshot, spiritId: spirit("气球猫").id }).state;
  expect(reset.sides.attacker.battleForm).toBeUndefined();
  expect(reset.sides.attacker.spiritId).toBe(spirit("气球猫").id);
});

test("形态期间改个体不自动记入个人预设，撤回完整恢复", () => {
  const before = configured("梦想三三");
  const history = createUndoHistory();
  history.record(before);
  const after = switchBattleForm(before, { side: "attacker", snapshot, spiritId: spirit("气球猫").id }).state;
  const updated = reduceSessionAction(after, { type: "side/set-iv", side: "attacker", stat: "speed", value: 0 });
  expect(updated.persistence.rememberSide).toBeNull();
  expect(history.undo().state).toEqual(before);
});

test("显式生命超过新上限时约束，满血与比例输入口径不改", () => {
  const before = configured("梦想三三");
  before.directions.reverse.currentHp = 9999;
  const after = switchBattleForm(before, { side: "attacker", snapshot, spiritId: spirit("逗逗").id }).state;
  expect(after.directions.reverse.currentHp).toBe(getPanelView(getSpirit(snapshot, after.sides.attacker), after.sides.attacker).find((entry) => entry.key === "hp").panel);
});

test("分享往返保留本场形态，错误跨家族引用被拒绝", async () => {
  let before = configured("梦想三三");
  before = selectSpirit(before, { initialState: createProductInitialState(snapshot), side: "defender", snapshot, spiritId: spirit("迪莫").id }).state;
  const after = switchBattleForm(before, { side: "attacker", snapshot, spiritId: spirit("气球猫").id }).state;
  const decoded = await decodeShareState(await encodeShareState(after));
  expect(decoded.sides.attacker.battleForm).toEqual(after.sides.attacker.battleForm);
  expect(() => assertSnapshotReferences(decoded, snapshot)).not.toThrow();
  decoded.sides.attacker.battleForm.spiritId = spirit("迪莫").id;
  expect(() => assertSnapshotReferences(decoded, snapshot)).toThrow(/形态/);
});
