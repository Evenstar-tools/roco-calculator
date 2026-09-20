import { useState } from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { NatureSelect } from "../../src/components/NatureSelect.jsx";
import { NATURES, STAT_LABELS } from "../../src/domain/natures.js";

function Harness({ onChange = () => {} }) {
  const [value, setValue] = useState("timid");
  return <><NatureSelect ariaLabel="测试性格" value={value} onChange={id => { setValue(id); onChange(id); }} /><button>外部</button></>;
}
const trigger = () => screen.getByRole("combobox", { name: "测试性格" });
const group = name => screen.getByRole("treeitem", { name: `${name}增益 +20%` });

test("窄选择栏展开保持可读宽度，并在小窗口边缘限位", () => {
  const width = vi.spyOn(window, "innerWidth", "get").mockReturnValue(320);
  const height = vi.spyOn(window, "innerHeight", "get").mockReturnValue(420);
  try {
    render(<Harness />);
    vi.spyOn(trigger(), "getBoundingClientRect").mockReturnValue({ left: 150, top: 290, bottom: 328, width: 185 });
    fireEvent.click(trigger());
    const menu = screen.getByRole("tree");
    expect(menu.style.width).toBe("260px");
    expect(menu.style.left).toBe("52px");
    expect(menu.style.top).toBe("8px");
  } finally { width.mockRestore(); height.mockRestore(); }
});

test("首开七行，点击展开后最多十二行，再次打开收起且保留已选", async () => {
  const user = userEvent.setup();
  render(<Harness />);
  await user.click(trigger());
  expect(screen.getAllByRole("treeitem")).toHaveLength(7);
  await user.click(group("速度"));
  expect(screen.getAllByRole("treeitem")).toHaveLength(12);
  expect(screen.getByRole("treeitem", { name: "胆小（+速度 -物攻）" })).toHaveAttribute("aria-selected", "true");
  await user.click(group("速度"));
  expect(screen.getAllByRole("treeitem")).toHaveLength(12);
  await user.click(screen.getByRole("treeitem", { name: "开朗（+速度 -魔攻）" }));
  expect(trigger()).toHaveValue("cheerful");
  expect(trigger()).toHaveFocus();
  expect(screen.queryByRole("tree")).not.toBeInTheDocument();
  await user.click(trigger());
  expect(screen.getAllByRole("treeitem")).toHaveLength(7);
});

test("六组各五项均可选择且共用原性格映射，普通可直接选择", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  render(<Harness onChange={onChange} />);
  for (const nature of NATURES.filter(n => n.upStat)) {
    await user.click(trigger());
    await user.click(group(STAT_LABELS[nature.upStat]));
    expect(screen.getAllByRole("treeitem")).toHaveLength(12);
    expect(within(screen.getByRole("group")).getAllByRole("treeitem")).toHaveLength(5);
    await user.click(screen.getByRole("treeitem", { name: `${nature.name}（+${STAT_LABELS[nature.upStat]} -${STAT_LABELS[nature.downStat]}）` }));
    expect(trigger()).toHaveValue(nature.id);
  }
  await user.click(trigger());
  await user.click(screen.getByRole("treeitem", { name: "普通（无修正）" }));
  expect(trigger()).toHaveValue("neutral");
  expect(onChange).toHaveBeenCalledTimes(31);
});

test("悬停延迟展开，不提交；跨组替换，离开标题进入子项不收起，卸载清定时器", () => {
  vi.useFakeTimers();
  try {
    const onChange = vi.fn();
    const view = render(<Harness onChange={onChange} />);
    fireEvent.click(trigger());
    fireEvent.pointerEnter(group("速度"), { pointerType: "mouse" });
    act(() => vi.advanceTimersByTime(149));
    expect(screen.getAllByRole("treeitem")).toHaveLength(7);
    act(() => vi.advanceTimersByTime(1));
    fireEvent.pointerLeave(group("速度"));
    expect(screen.getAllByRole("treeitem")).toHaveLength(12);
    fireEvent.pointerEnter(group("生命"), { pointerType: "mouse" });
    act(() => vi.advanceTimersByTime(150));
    expect(screen.queryByRole("treeitem", { name: "胆小（+速度 -物攻）" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("treeitem")).toHaveLength(12);
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.pointerEnter(group("魔攻"));
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
  } finally { vi.useRealTimers(); }
});

test("方向键展开与选择，Escape 取消不向外穿透，外部点击关闭", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  render(<Harness onChange={onChange} />);
  trigger().focus();
  await user.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}{ArrowRight}{ArrowDown}{Enter}");
  expect(trigger()).toHaveValue("silent");
  await user.click(trigger());
  await user.click(group("速度"));
  await user.keyboard("{ArrowDown}{ArrowLeft}");
  expect(group("速度")).toHaveFocus();
  expect(screen.getAllByRole("treeitem")).toHaveLength(7);
  const bubble = vi.fn();
  window.addEventListener("keydown", bubble);
  await user.keyboard("{Escape}");
  window.removeEventListener("keydown", bubble);
  expect(bubble).not.toHaveBeenCalled();
  expect(trigger()).toHaveFocus();
  expect(onChange).toHaveBeenCalledTimes(1);
  await user.click(trigger());
  await user.click(screen.getByRole("button", { name: "外部" }));
  expect(screen.queryByRole("tree")).not.toBeInTheDocument();
  await user.click(trigger());
  await user.click(group("速度"));
  window.addEventListener("keydown", bubble);
  await user.keyboard("{Tab}");
  window.removeEventListener("keydown", bubble);
  expect(bubble).not.toHaveBeenCalled();
  expect(screen.queryByRole("tree")).not.toBeInTheDocument();
});
