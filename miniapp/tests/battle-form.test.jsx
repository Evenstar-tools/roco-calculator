import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import snapshot from "../../public/data/runtime.json";
import SpiritPicker from "../src/components/SpiritPicker.jsx";
import BattleWorkspace from "../src/components/BattleWorkspace.jsx";
import { createCalculatorStore } from "../src/state/calculator-store.js";
import { createProductInitialState, selectSpirit, switchBattleForm } from "../src/shared/state/calculator-session.js";
import { createCombatantView } from "../src/view-models/combatant.js";
import { createDirectionTraitViews } from "../src/view-models/traits.js";
import { encodeSharePayload, decodeSharePayload } from "../src/share/payload.js";
import { createPersistence } from "../src/state/persistence.js";

const spirit = (name) => snapshot.spirits.find((entry) => entry.fullName === name);
function formState() {
  const initialState = createProductInitialState(snapshot);
  let state = selectSpirit(initialState, { initialState, side: "attacker", snapshot, spiritId: spirit("梦想三三").id }).state;
  state = selectSpirit(state, { initialState, side: "defender", snapshot, spiritId: spirit("迪莫").id }).state;
  return switchBattleForm(state, { side: "attacker", snapshot, spiritId: spirit("奇梦咪").id }).state;
}

test("小程序再次打开显示同族，切形态与普通搜索独立", () => {
  const onChange = vi.fn(), onFormChange = vi.fn();
  render(<SpiritPicker side="attacker" spirits={snapshot.spirits} value={spirit("梦想三三").id}
    formSide={{ spiritId: spirit("梦想三三").id }} onChange={onChange} onFormChange={onFormChange} open />);
  expect(screen.getByText("保留本场配置")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "切换形态气球猫" }));
  expect(onFormChange).toHaveBeenCalledWith(spirit("气球猫").id);
  expect(onChange).not.toHaveBeenCalled();
  fireEvent.input(screen.getByLabelText("搜索攻击方宠物"), { target: { value: "迪莫" } });
  fireEvent.click(screen.getByRole("button", { name: "选择迪莫", exact: true }));
  expect(onChange).toHaveBeenCalledWith(spirit("迪莫").id);
});

test("小程序面板和特性取同一形态，分享往返保留形态覆盖", () => {
  const state = formState();
  expect(createCombatantView(snapshot, state.sides.attacker).spirit.fullName).toBe("奇梦咪");
  expect(createDirectionTraitViews(snapshot, state, "forward").attacker.name).toBe("三鼓作气");
  const restored = decodeSharePayload(encodeSharePayload(state), snapshot);
  expect(restored.sides.attacker.battleForm).toEqual(state.sides.attacker.battleForm);
});

test("小程序本场形态持久化恢复，不丢原配置身份", () => {
  const values = new Map();
  const persistence = createPersistence({ storage: { get: (key) => values.get(key), set: (key, value) => values.set(key, value), remove: (key) => values.delete(key) } });
  const state = formState();
  persistence.save(state);
  const restored = persistence.load(snapshot);
  expect(restored.sides.attacker.battleForm).toEqual(state.sides.attacker.battleForm);
  expect(restored.sides.attacker.spiritId).toBe(spirit("梦想三三").id);
});

test("真实工作区入口切形态保留状态且可撤回，不写预设", () => {
  const initial = formState();
  const store = createCalculatorStore(snapshot, initial);
  const onPresetAllocationChange = vi.fn();
  render(<BattleWorkspace snapshot={snapshot} store={store} quickUndoEnabled onPresetAllocationChange={onPresetAllocationChange} />);
  fireEvent.click(screen.getByRole("button", { name: "攻击方宠物摘要" }));
  fireEvent.click(screen.getByRole("button", { name: "切换形态气球猫" }));
  expect(store.getState().sides.attacker.battleForm.spiritId).toBe(spirit("气球猫").id);
  expect(store.getState().directions).toEqual(initial.directions);
  expect(onPresetAllocationChange).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: /撤回上一步/ }));
  expect(store.getState().sides.attacker.battleForm).toEqual(initial.sides.attacker.battleForm);
});
