import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import snapshot from "../../public/data/runtime.json";
import { SpiritPicker } from "../../src/components/SpiritPicker.jsx";

const selected = snapshot.spirits.find((spirit) => spirit.fullName === "梦想三三");
function setup(extra = {}) {
  const onSelect = vi.fn(), onFormSelect = vi.fn();
  render(<SpiritPicker label="攻击方" side="attack" spirits={snapshot.spirits} selected={selected}
    formSide={{ spiritId: selected.id }} onSelect={onSelect} onFormSelect={onFormSelect} {...extra} />);
  return { onSelect, onFormSelect };
}

test("再次打开直接显示同族，鼠标切形态不走普通载入", () => {
  const actions = setup();
  fireEvent.focus(screen.getByRole("combobox", { name: "攻击方精灵" }));
  expect(screen.getByText("保留本场配置")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("option", { name: /气球猫/ }));
  expect(actions.onFormSelect).toHaveBeenCalledWith(snapshot.spirits.find((spirit) => spirit.fullName === "气球猫").id);
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
  expect(screen.queryByText("保留本场配置")).not.toBeInTheDocument();
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
