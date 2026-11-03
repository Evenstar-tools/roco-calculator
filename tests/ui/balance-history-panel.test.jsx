import { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import BalanceHistoryPanel from "../../src/features/balance-history/BalanceHistoryPanel.jsx";
import * as historyIndex from "../../src/features/balance-history/history-index.js";

const s4 = { id: "s4-2026-09-10", seasonId: "S4", label: "S4 月涌狂想", date: "2026.09.10", sourceUrl: "https://example.com/s4" };
const s5 = { id: "s5-2026-10-31", seasonId: "S5", label: "S5 圣龙宝藏", date: "2026.10.31", displayDate: "2026.11.05", sourceUrl: "urn:local:history" };
const hp = { kind: "stat", field: "hp", label: "生命", before: 122, after: 132 };
const power = { kind: "stat", field: "basePower", label: "四维降解·威力", before: 100, after: 110 };
function fixture() {
  return { meta: { serverId: "cn" }, spirits: [
    { id: "flower", fullName: "花衣蝶", dexNo: "101", aliases: ["蝴蝶"], changeInfo: { patch: s5, items: [{ ...hp, before: 132, after: 135 }], history: [
      { patch: s4, items: [hp, power, { kind: "learnset", label: "新增可学习技能", after: "振翅" }, { kind: "trait", label: "花精灵", before: "旧特性", after: "新特性" }] },
    ] } },
    { id: "forest", fullName: "森巨人", dexNo: "386", changeInfo: { patch: s5, items: [{ ...hp, before: 144, after: 164 }] } },
    { id: "quiet", fullName: "静静", dexNo: "999" },
  ], skills: [{ id: "power", name: "四维降解", changeInfo: { patch: s4, items: [{ ...power, label: "威力" }] } }] };
}
function Harness({ snapshot = fixture() }) {
  const [open, setOpen] = useState(true);
  return <><button type="button" onClick={() => setOpen(true)}>打开回顾</button><BalanceHistoryPanel snapshot={snapshot} open={open} onClose={() => setOpen(false)} /></>;
}

test("四维降解的威力归技能段，精灵六维、学习面与特性分别展示和筛选", async () => {
  const user = userEvent.setup();
  render(<BalanceHistoryPanel snapshot={fixture()} open onClose={vi.fn()} />);
  const panel = screen.getByRole("dialog");
  const stats = within(panel).getAllByRole("region", { name: "种族值" });
  expect(stats).toHaveLength(2);
  for (const region of stats) expect(region).not.toHaveTextContent("四维降解");
  expect(within(panel).getByRole("region", { name: "技能调整" })).toHaveTextContent("四维降解·威力100 → 110+10");
  expect(within(panel).getByRole("region", { name: "学习面调整" })).toHaveTextContent("振翅");
  expect(within(panel).getByRole("region", { name: "特性调整" })).toHaveTextContent("旧特性");
  await user.click(within(panel).getByRole("button", { name: "种族值", exact: true }));
  expect(within(panel).queryByRole("region", { name: "技能调整" })).not.toBeInTheDocument();
  expect(within(panel).getByText("122 → 132")).toBeVisible();
  await user.click(within(panel).getByRole("button", { name: "技能调整", exact: true }));
  expect(within(panel).queryByRole("region", { name: "种族值" })).not.toBeInTheDocument();
  expect(within(panel).getByText("四维降解·威力")).toBeVisible();
});

test("搜索支持别名与无历史实体，未命中时清空旧详情，清除后可恢复", async () => {
  const user = userEvent.setup();
  render(<BalanceHistoryPanel snapshot={fixture()} open onClose={vi.fn()} />);
  const search = screen.getByRole("textbox", { name: "名称、别名或图鉴号" });
  await user.type(search, "蝴蝶");
  expect(screen.getByRole("heading", { name: /花衣蝶/ })).toBeVisible();
  await user.clear(search);
  await user.type(search, "静静");
  expect(screen.getByRole("status")).toHaveTextContent("尚未收录静静的平衡调整记录");
  await user.clear(search);
  await user.type(search, "不存在");
  expect(screen.getByRole("status")).toHaveTextContent("没有匹配的精灵");
  expect(screen.queryByRole("heading", { name: /静静|花衣蝶/ })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "清空名称、别名或图鉴号" }));
  expect(screen.getByRole("heading", { name: /花衣蝶/ })).toBeVisible();
});

test("互跳定位同一批次和精灵，返回恢复之前筛选与滚动位置", async () => {
  const user = userEvent.setup();
  const { container } = render(<BalanceHistoryPanel snapshot={fixture()} open onClose={vi.fn()} />);
  const search = screen.getByRole("textbox", { name: "名称、别名或图鉴号" });
  await user.type(search, "蝴蝶");
  await user.selectOptions(screen.getByRole("combobox", { name: "筛选赛季" }), "S4");
  const scroll = document.querySelector(".bh-scroll");
  scroll.scrollTop = 127;
  await user.click(screen.getByRole("button", { name: "查看本次全部调整" }));
  expect(screen.getByRole("tab", { name: "按更新浏览" })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByRole("heading", { name: "S4 月涌狂想" })).toBeVisible();
  expect(screen.getByRole("button", { name: /花衣蝶.*收起/ })).toHaveAttribute("aria-expanded", "true");
  await user.click(screen.getByRole("button", { name: "返回按精灵回查" }));
  expect(screen.getByRole("combobox", { name: "筛选赛季" })).toHaveValue("S4");
  expect(screen.getByRole("textbox", { name: "名称、别名或图鉴号" })).toHaveValue("蝴蝶");
  expect(document.querySelector(".bh-scroll").scrollTop).toBe(127);
  await user.click(screen.getByRole("tab", { name: "按更新浏览" }));
  await user.click(screen.getByRole("button", { name: "查看花衣蝶历次调整" }));
  expect(screen.getByRole("tab", { name: "按精灵回查" })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByRole("heading", { name: /花衣蝶/ })).toBeVisible();
  expect(screen.getByRole("textbox", { name: "名称、别名或图鉴号" })).toHaveValue("花衣蝶");
  expect(container).toBeEmptyDOMElement();
});

test("按更新的技能搜索使用技能名，保留独立技能身份和安全来源", async () => {
  const user = userEvent.setup();
  render(<BalanceHistoryPanel snapshot={fixture()} open onClose={vi.fn()} />);
  expect(screen.getByText("资料展示日期 · 历史记录日期 2026.10.31")).toBeVisible();
  expect(screen.getByRole("link", { name: "资料来源" })).toHaveAttribute("href", "https://example.com/s4");
  expect(screen.getByText("资料来源未提供在线链接")).toBeVisible();
  await user.click(screen.getByRole("tab", { name: "按更新浏览" }));
  await user.click(screen.getByRole("button", { name: /2026.09.10.*S4 月涌狂想/ }));
  await user.click(screen.getByRole("button", { name: "种族值", exact: true }));
  await user.click(within(screen.getByRole("group", { name: "更新对象" })).getByRole("button", { name: "技能调整" }));
  const search = screen.getByRole("textbox", { name: "在本次更新中查找技能" });
  await user.type(search, "四维降解");
  expect(screen.getByText("四维降解·威力")).toBeVisible();
  await user.clear(search);
  await user.type(search, "不存在");
  expect(screen.getByRole("status")).toHaveTextContent("本次更新没有符合条件的技能调整记录");
  expect(screen.queryByText("四维降解·威力")).not.toBeInTheDocument();
});

test("初次关闭不构造索引，Esc关闭再打开保留筛选及滚动", async () => {
  const user = userEvent.setup();
  const snapshot = fixture();
  const getIndex = vi.spyOn(historyIndex, "getBalanceHistoryIndex");
  const unopened = render(<BalanceHistoryPanel snapshot={snapshot} open={false} onClose={vi.fn()} />);
  expect(getIndex).not.toHaveBeenCalled();
  unopened.unmount();
  render(<Harness snapshot={snapshot} />);
  await user.selectOptions(screen.getByRole("combobox", { name: "筛选赛季" }), "S4");
  const scroll = document.querySelector(".bh-scroll");
  scroll.scrollTop = 93;
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(document.body.style.overflow).not.toBe("hidden");
  await user.click(screen.getByRole("button", { name: "打开回顾" }));
  expect(screen.getByRole("combobox", { name: "筛选赛季" })).toHaveValue("S4");
  expect(document.querySelector(".bh-scroll").scrollTop).toBe(93);
  expect(getIndex).toHaveBeenCalledTimes(1);
  getIndex.mockRestore();
});

test("候选与批次只分批渲染，完整数据搜索能命中首批外精灵", async () => {
  const user = userEvent.setup();
  const snapshot = fixture();
  snapshot.spirits.push(...Array.from({ length: 70 }, (_, index) => ({ id: `extra-${index}`, fullName: `候补${index}`, dexNo: `${1000 + index}`, changeInfo: { patch: s4, items: [hp] } })));
  render(<BalanceHistoryPanel snapshot={snapshot} open onClose={vi.fn()} />);
  expect(document.querySelectorAll(".bh-entity")).toHaveLength(24);
  document.querySelector(".bh-side").scrollTop = 82;
  document.querySelector(".bh-scroll").scrollTop = 64;
  await user.click(screen.getByRole("button", { name: "显示更多精灵" }));
  expect(document.querySelectorAll(".bh-entity")).toHaveLength(48);
  expect(document.querySelector(".bh-side").scrollTop).toBe(82);
  expect(document.querySelector(".bh-scroll").scrollTop).toBe(64);
  fireEvent.change(screen.getByRole("textbox", { name: "名称、别名或图鉴号" }), { target: { value: "候补69" } });
  expect(screen.getByRole("heading", { name: /候补69/ })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "查看本次全部调整" }));
  expect(document.querySelectorAll(".bh-owner-head")).toHaveLength(24);
  expect(screen.getByRole("button", { name: /候补69.*收起/ })).toHaveAttribute("aria-expanded", "true");
  document.querySelector(".bh-scroll").scrollTop = 145;
  await user.click(screen.getByRole("button", { name: /显示更多调整/ }));
  expect(document.querySelectorAll(".bh-owner-head")).toHaveLength(48);
  expect(document.querySelector(".bh-scroll").scrollTop).toBe(145);
  fireEvent.change(screen.getByRole("textbox", { name: "在本次更新中查找精灵" }), { target: { value: "候补68" } });
  expect(document.querySelectorAll(".bh-owner-head")).toHaveLength(1);
  expect(screen.getByRole("button", { name: /候补68/ })).toBeVisible();
});
