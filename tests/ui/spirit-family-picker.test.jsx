import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import snapshot from "../../public/data/runtime.json";
import { SpiritPicker } from "../../src/components/SpiritPicker.jsx";

const find = name => snapshot.spirits.find(spirit => spirit.fullName === name);
function setup(name, extra = {}) {
  const selected = find(name), onSelect = vi.fn(), onFormSelect = vi.fn();
  render(<SpiritPicker label="攻击方" side="attack" spirits={snapshot.spirits} selected={selected}
    formSide={{ spiritId: selected.id }} onSelect={onSelect} onFormSelect={onFormSelect} {...extra} />);
  fireEvent.focus(screen.getByRole("combobox", { name: "攻击方精灵" }));
  return { onSelect, onFormSelect };
}

test.each([
  ["抹茶布丁", "椰浆布丁", 4],
  ["水泡壳", "水泡壳（蜕皮时的样子）", 6],
  ["卡瓦重（草地附近的样子）", "卡瓦重（雪山附近的样子）", 12],
  ["海枝枝（碧蓝珊瑚）", "海枝枝（杏黄百合）", 4],
])("已选%s后直接展开关联形态", (name, sibling, count) => {
  const actions = setup(name);
  expect(screen.getAllByRole("option")).toHaveLength(count);
  const option = screen.getAllByRole("option").find(node => node.textContent.includes(sibling));
  expect(option).toBeVisible();
  fireEvent.click(option);
  expect(actions.onSelect).toHaveBeenCalledWith(find(sibling).id);
  expect(actions.onFormSelect).not.toHaveBeenCalled();
});

test.each(["鼠标", "键盘"])("开启保留后%s选择旁支仍载入目标预设", method => {
  const actions = setup("抹茶布丁");
  fireEvent.click(screen.getByRole("switch"));
  if (method === "鼠标") fireEvent.click(screen.getByRole("option", { name: /椰浆布丁.*关联形态.*载入预设/ }));
  else {
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "ArrowDown" });
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Enter" });
  }
  expect(actions.onSelect).toHaveBeenCalledWith(find("椰浆布丁").id);
  expect(actions.onFormSelect).not.toHaveBeenCalled();
});

test("普通选择器和精确搜索也能找到关联家族", () => {
  setup("海枝枝（碧蓝珊瑚）", { onFormSelect: undefined });
  expect(screen.queryByRole("switch")).toBeNull();
  expect(screen.getAllByRole("option")).toHaveLength(4);
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "抹茶布丁" } });
  expect(screen.getAllByRole("option")).toHaveLength(4);
  expect(screen.getByRole("option", { name: /熔岩布丁/ })).toBeVisible();
});
