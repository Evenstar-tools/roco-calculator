import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { Toolbox } from "../../src/components/Toolbox.jsx";

test("加载阶段不开放会在就绪时消失的工具菜单", () => {
  const { rerender } = render(<Toolbox />);
  expect(screen.getByRole("button", { name: "工具箱" })).toBeDisabled();
  rerender(<Toolbox actions={{ types: vi.fn() }} />);
  expect(screen.getByRole("button", { name: "工具箱" })).toBeEnabled();
});

test("六项工具按分组打开，先收起并还原焦点再执行入口", () => {
  const ids = ["types", "skills", "deer", "transmission", "speed", "durability"];
  const actions = Object.fromEntries(ids.map(id => [id, vi.fn(() => {
    expect(screen.getByRole("button", {name:"工具箱"})).toHaveFocus();
  })]));
  render(<Toolbox actions={actions} />);
  for (const [index,id] of ids.entries()) {
    fireEvent.click(screen.getByRole("button", {name:"工具箱"}));
    const panel=screen.getByRole("navigation", {name:"工具箱"});
    expect(within(panel).getAllByRole("button")).toHaveLength(6);
    fireEvent.click(within(panel).getAllByRole("button")[index]);
    expect(actions[id]).toHaveBeenCalledOnce();
    expect(screen.queryByRole("navigation", {name:"工具箱"})).toBeNull();
  }
});

test("重复点击、外部点击、Esc 关闭，键盘循环焦点", () => {
  const actions=Object.fromEntries(["types","skills","deer","transmission","speed","durability"].map(id=>[id,vi.fn()]));
  render(<Toolbox actions={actions} />);
  const trigger=screen.getByRole("button",{name:"工具箱"});
  fireEvent.click(trigger);
  const buttons=within(screen.getByRole("navigation")).getAllByRole("button");
  expect(buttons[0]).toHaveFocus();
  fireEvent.keyDown(document,{key:"Tab",shiftKey:true});
  expect(buttons[5]).toHaveFocus();
  fireEvent.keyDown(document,{key:"Tab"});
  expect(buttons[0]).toHaveFocus();
  fireEvent.keyDown(document,{key:"Escape"});
  expect(trigger).toHaveFocus();
  expect(trigger).toHaveAttribute("aria-expanded","false");
  fireEvent.click(trigger); fireEvent.click(trigger);
  expect(screen.queryByRole("navigation")).toBeNull();
  fireEvent.click(trigger); fireEvent.pointerDown(document.body);
  expect(screen.queryByRole("navigation")).toBeNull();
});
