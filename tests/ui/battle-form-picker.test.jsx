import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import snapshot from "../../public/data/runtime.json";
import { SpiritPicker } from "../../src/components/SpiritPicker.jsx";
import { FORM_CONFIG_PREFERENCES_STORAGE_KEY } from "../../src/state/form-config-preferences.js";

const selected = snapshot.spirits.find((spirit) => spirit.fullName === "梦想三三");

beforeEach(() => localStorage.removeItem(FORM_CONFIG_PREFERENCES_STORAGE_KEY));
afterEach(() => localStorage.removeItem(FORM_CONFIG_PREFERENCES_STORAGE_KEY));

function setup(extra = {}) {
  const onSelect = vi.fn(), onFormSelect = vi.fn();
  render(<SpiritPicker label="攻击方" side="attack" spirits={snapshot.spirits} selected={selected}
    formSide={{ spiritId: selected.id }} onSelect={onSelect} onFormSelect={onFormSelect} {...extra} />);
  return { onSelect, onFormSelect };
}

test("再次打开直接显示同族，鼠标切形态不走普通载入", () => {
  const actions = setup();
  fireEvent.focus(screen.getByRole("combobox", { name: "攻击方精灵" }));
  expect(screen.getByText("萌化 · 配置保留")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("option", { name: /气球猫/ }));
  expect(actions.onFormSelect).toHaveBeenCalledWith(snapshot.spirits.find((spirit) => spirit.fullName === "气球猫").id);
  expect(actions.onSelect).not.toHaveBeenCalled();
});

test("完整名称展示不妨碍全选删除和取消恢复", async () => {
  const user = userEvent.setup();
  const actions = setup();
  const input = screen.getByRole("combobox", { name: "攻击方精灵" });
  const presentation = () => document.querySelector(".spirit-picker__selected-name");
  expect(presentation()).toHaveTextContent("梦想三三");
  expect(presentation()).toHaveAttribute("aria-hidden", "true");
  await user.click(input);
  expect(presentation()).toBeNull();
  expect(input.selectionStart).toBe(0);
  expect(input.selectionEnd).toBe(selected.fullName.length);
  await user.keyboard("{Backspace}");
  expect(input).toHaveValue("");
  expect(screen.getAllByRole("option").length).toBeGreaterThan(1);
  await user.keyboard("{Escape}");
  expect(presentation()).toHaveTextContent("梦想三三");
  expect(input).toHaveValue("梦想三三");
  expect(actions.onSelect).not.toHaveBeenCalled();
});

test("明确搜索走普通换宠，形态预设重载入口也不混用", () => {
  const actions = setup();
  const input = screen.getByRole("combobox", { name: "攻击方精灵" });
  fireEvent.focus(input);
  fireEvent.click(screen.getByRole("button", { name: "重新载入当前形态预设" }));
  expect(actions.onSelect).toHaveBeenCalledWith(selected.id);
  actions.onSelect.mockClear();
  fireEvent.change(input, { target: { value: "迪莫" } });
  fireEvent.click(screen.getByRole("option", { name: /^迪莫 / }));
  expect(actions.onSelect).toHaveBeenCalledWith(snapshot.spirits.find((spirit) => spirit.fullName === "迪莫").id);
  expect(actions.onFormSelect).not.toHaveBeenCalled();
});

test("键盘选择同族形态沿用专用入口", () => {
  const actions = setup();
  const input = screen.getByRole("combobox", { name: "攻击方精灵" });
  fireEvent.keyDown(input, { key: "ArrowDown" });
  fireEvent.keyDown(input, { key: "ArrowDown" });
  fireEvent.keyDown(input, { key: "Enter" });
  expect(actions.onFormSelect).toHaveBeenCalledTimes(1);
  expect(actions.onSelect).not.toHaveBeenCalled();
});

test("Escape 取消不重置配置，其他选择器不启用此功能", () => {
  const actions = setup({ onFormSelect: undefined });
  fireEvent.focus(screen.getByRole("combobox", { name: "攻击方精灵" }));
  expect(screen.queryByText("萌化 · 配置保留")).not.toBeInTheDocument();
  expect(screen.queryByRole("switch")).toBeNull();
  fireEvent.keyDown(screen.getByRole("combobox"), { key: "Escape" });
  expect(actions.onSelect).not.toHaveBeenCalled();
});

test.each([["气球猫", 1], ["逗逗", 2], ["梦想三三", 0], ["奇梦咪", 0]])(
  "切到%s仅显示萌化图标与数字%i，不把特性层数当萌化层数",
  (name, layers) => {
    const form = snapshot.spirits.find((spirit) => spirit.fullName === name);
    setup({ selected: form, formSide: { spiritId: selected.id, battleForm: { spiritId: form.id, branchId: selected.id } } });
    const badge = screen.getByLabelText(`萌化 ${layers} 层`);
    expect(badge).toHaveTextContent(String(layers));
    expect(badge.querySelector("img")).toHaveAttribute("src", "/assets/elements/cute.png");
    expect(badge.closest(".spirit-card__form-note")).toHaveTextContent(`${layers} · 配置已保留`);
    expect(screen.queryByText(/本场形态/)).not.toBeInTheDocument();
  },
);

test("普通载入不显示萌化提示", () => {
  setup();
  expect(document.querySelector(".spirit-card__form-note")).toBeNull();
});

test.each([true, false])("已有精灵点击全选、一次删除，搜索词编辑不强制全选（同族入口 %s）", async (withForms) => {
  const user = userEvent.setup();
  const actions = setup(withForms ? {} : { onFormSelect: undefined });
  const input = screen.getByRole("combobox", { name: "攻击方精灵" });
  await user.click(input);
  expect(input).toHaveValue(selected.fullName);
  expect(input.selectionStart).toBe(0);
  expect(input.selectionEnd).toBe(selected.fullName.length);
  await user.keyboard("{Backspace}");
  expect(input).toHaveValue("");
  expect(screen.queryByRole("switch")).toBeNull();
  expect(screen.getByRole("option", { name: /^迪莫 / })).toBeVisible();
  await user.keyboard("迪莫");
  expect(input).toHaveValue("迪莫");
  input.setSelectionRange(1, 1);
  fireEvent.click(input);
  expect(input.selectionStart).toBe(1);
  expect(input.selectionEnd).toBe(1);
  await user.keyboard("{Escape}");
  expect(input).toHaveValue(selected.fullName);
  await user.click(input);
  expect(screen.getByRole("listbox")).toBeVisible();
  expect(input.selectionStart).toBe(0);
  expect(input.selectionEnd).toBe(selected.fullName.length);
  await user.keyboard("迪莫");
  expect(input).toHaveValue("迪莫");
  expect(actions.onSelect).not.toHaveBeenCalled();
  expect(actions.onFormSelect).not.toHaveBeenCalled();
});

test.each(["鼠标", "键盘"])("关闭保留开关后，%s选择同族形态走普通预设载入；开关本身不改配置", (method) => {
  const actions = setup();
  const input = screen.getByRole("combobox", { name: "攻击方精灵" });
  fireEvent.focus(input);
  const toggle = screen.getByRole("switch", { name: "攻击方同族切换保留本场配置" });
  expect(toggle).toBeChecked();
  fireEvent.click(toggle);
  expect(toggle).not.toBeChecked();
  expect(actions.onSelect).not.toHaveBeenCalled();
  expect(actions.onFormSelect).not.toHaveBeenCalled();
  fireEvent.keyDown(toggle, { key: "Escape" });
  expect(screen.queryByRole("listbox")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "展开攻击方精灵列表" }));
  expect(screen.getByRole("switch")).not.toBeChecked();
  if (method === "鼠标") fireEvent.click(screen.getByRole("option", { name: /气球猫/ }));
  else {
    fireEvent.keyDown(input, { key: "ArrowUp" });
    fireEvent.keyDown(input, { key: "Enter" });
  }
  expect(actions.onSelect).toHaveBeenCalledWith(snapshot.spirits.find(spirit => spirit.fullName === "气球猫").id);
  expect(actions.onFormSelect).not.toHaveBeenCalled();
  fireEvent.focus(input);
  fireEvent.click(screen.getByRole("switch"));
  fireEvent.click(screen.getByRole("option", { name: /气球猫/ }));
  expect(actions.onFormSelect).toHaveBeenCalledOnce();
});

test("双方保留开关独立", () => {
  setup();
  render(<SpiritPicker label="防御方" side="defense" spirits={snapshot.spirits} selected={selected}
    formSide={{ spiritId: selected.id }} onSelect={vi.fn()} onFormSelect={vi.fn()} />);
  fireEvent.focus(screen.getByRole("combobox", { name: "攻击方精灵" }));
  fireEvent.click(screen.getByRole("switch", { name: "攻击方同族切换保留本场配置" }));
  fireEvent.focus(screen.getByRole("combobox", { name: "防御方精灵" }));
  expect(screen.getByRole("switch", { name: "防御方同族切换保留本场配置" })).toBeChecked();
});

test.each(["逗逗", "气球猫", "梦想三三", "奇梦咪", "武斗酷猫", "波普鹿"])("%s：仅三三家族默认保留配置", (name) => {
  const spirit = snapshot.spirits.find(entry => entry.fullName === name);
  const actions = setup({ selected: spirit, formSide: { spiritId: spirit.id } });
  fireEvent.focus(screen.getByRole("combobox", { name: "攻击方精灵" }));
  const enabled = ["逗逗", "气球猫", "梦想三三", "奇梦咪"].includes(name);
  expect(screen.getByRole("switch").checked).toBe(enabled);
  fireEvent.click(screen.getAllByRole("option")[0]);
  expect(enabled ? actions.onFormSelect : actions.onSelect).toHaveBeenCalledOnce();
  expect(enabled ? actions.onSelect : actions.onFormSelect).not.toHaveBeenCalled();
});

test("首次选宠及跨家族切换使用各自默认值，手动选择仅在对应家族内保留", () => {
  const props = { label: "攻击方", side: "attack", spirits: snapshot.spirits, onSelect: vi.fn(), onFormSelect: vi.fn() };
  const { rerender } = render(<SpiritPicker {...props} />);
  function show(name) {
    const spirit = snapshot.spirits.find(entry => entry.fullName === name);
    rerender(<SpiritPicker {...props} selected={spirit} formSide={{ spiritId: spirit.id }} />);
    fireEvent.focus(screen.getByRole("combobox"));
    return screen.getByRole("switch");
  }
  expect(show("梦想三三")).toBeChecked();
  fireEvent.click(screen.getByRole("switch"));
  expect(show("气球猫")).not.toBeChecked();
  expect(show("武斗酷猫")).not.toBeChecked();
  fireEvent.click(screen.getByRole("switch"));
  expect(show("梦想三三")).not.toBeChecked();
  expect(show("武斗酷猫")).toBeChecked();
  expect(show("波普鹿")).not.toBeChecked();
  expect(props.onSelect).not.toHaveBeenCalled();
  expect(props.onFormSelect).not.toHaveBeenCalled();
});

test("三三家族显式关闭萌化配置保留后，组件卸载重挂载仍保持关闭", () => {
  const props = { label: "攻击方", side: "attack", spirits: snapshot.spirits, selected,
    formSide: { spiritId: selected.id }, onSelect: vi.fn(), onFormSelect: vi.fn() };
  const firstMount = render(<SpiritPicker {...props} />);
  fireEvent.focus(screen.getByRole("combobox", { name: "攻击方精灵" }));
  const toggle = screen.getByRole("switch", { name: "攻击方同族切换保留本场配置" });
  expect(toggle).toBeChecked();
  fireEvent.click(toggle);
  expect(toggle).not.toBeChecked();
  expect(localStorage.getItem(FORM_CONFIG_PREFERENCES_STORAGE_KEY)).not.toBeNull();
  firstMount.unmount();

  render(<SpiritPicker {...props} />);
  fireEvent.focus(screen.getByRole("combobox", { name: "攻击方精灵" }));
  expect(screen.getByRole("switch", { name: "攻击方同族切换保留本场配置" })).not.toBeChecked();
  fireEvent.click(screen.getByRole("option", { name: /气球猫/ }));
  expect(props.onSelect).toHaveBeenCalledWith(snapshot.spirits.find((spirit) => spirit.fullName === "气球猫").id);
  expect(props.onFormSelect).not.toHaveBeenCalled();
});

test("萌化配置保留的记忆按攻防方与家族隔离，重挂载后恢复各自显式选择", () => {
  function mount(side, name) {
    const spirit = snapshot.spirits.find((entry) => entry.fullName === name);
    const label = side === "attack" ? "攻击方" : "防御方";
    const view = render(<SpiritPicker label={label} side={side} spirits={snapshot.spirits}
      selected={spirit} formSide={{ spiritId: spirit.id }} onSelect={vi.fn()} onFormSelect={vi.fn()} />);
    fireEvent.focus(screen.getByRole("combobox", { name: `${label}精灵` }));
    return { view, toggle: screen.getByRole("switch", { name: `${label}同族切换保留本场配置` }) };
  }

  let current = mount("attack", "梦想三三");
  fireEvent.click(current.toggle);
  expect(current.toggle).not.toBeChecked();
  current.view.unmount();

  current = mount("defense", "梦想三三");
  expect(current.toggle).toBeChecked();
  current.view.unmount();

  current = mount("attack", "武斗酷猫");
  expect(current.toggle).not.toBeChecked();
  fireEvent.click(current.toggle);
  expect(current.toggle).toBeChecked();
  current.view.unmount();

  current = mount("attack", "梦想三三");
  expect(current.toggle).not.toBeChecked();
  current.view.unmount();

  current = mount("attack", "武斗酷猫");
  expect(current.toggle).toBeChecked();
  current.view.unmount();

  current = mount("defense", "梦想三三");
  expect(current.toggle).toBeChecked();
});
