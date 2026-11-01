import { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import snapshot from "../../data/snapshots/current.json";
import TypeQueryPanel from "../../src/features/type-query/TypeQueryPanel.jsx";

function Harness({ initial = [], onClose = vi.fn(), chart = snapshot.typeChart, ...props }) {
  const [types, setTypes] = useState(initial);
  return <TypeQueryPanel typeChart={chart} spirits={snapshot.spirits} spiritFilterRevision={snapshot.meta?.revisions?.spiritFilter} selectedTypes={types} onTypesChange={setTypes} onClose={onClose} {...props} />;
}
const choices = () => within(screen.getByRole("group", { name: "选择属性" }));

test("手机横滑后进入非首项精灵，返回恢复列表横向位置", () => {
  const onOpenSpirit = vi.fn();
  const first = render(<Harness initial={["地", "武"]} onOpenSpirit={onOpenSpirit} />);
  const list = screen.getByRole("list", { name: "匹配精灵，共 8 个" });
  const button = within(list).getAllByRole("button")[3];
  const label = button.getAttribute("aria-label");
  list.scrollLeft = 560;
  fireEvent.click(button);
  const [, view] = onOpenSpirit.mock.calls[0];
  expect(view.listScrollLeft).toBe(560);
  first.unmount();
  render(<Harness initial={["地", "武"]} initialView={view} onOpenSpirit={onOpenSpirit} />);
  expect(screen.getByRole("list", { name: "匹配精灵，共 8 个" }).scrollLeft).toBe(560);
  expect(screen.getByRole("button", { name: label })).toHaveFocus();
});

test("匹配精灵按真实 ID 进入详情，返回保留倍率解释、滚动和原按钮焦点", () => {
  const onOpenSpirit = vi.fn(), onWarmSpirit = vi.fn();
  const first = render(<Harness initial={["地", "冰"]} {...{ onOpenSpirit, onWarmSpirit }} />);
  const button = screen.getByRole("button", { name: "獠牙猪 查看技能" });
  const spiritId = snapshot.spirits.find(spirit => spirit.fullName === "獠牙猪").id;
  fireEvent.pointerEnter(button);
  expect(onWarmSpirit).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button", { name: "查看防守火倍率来源" }));
  const body = screen.getByRole("dialog").querySelector(".type-query__body");
  body.scrollTop = 180;
  fireEvent.click(button);
  const view = { spiritId, scrollTop: 180, listScrollLeft: 0, inspected: { side: "defense", type: "火" } };
  expect(onOpenSpirit).toHaveBeenCalledWith(spiritId, view);
  first.unmount();
  render(<Harness initial={["地", "冰"]} initialView={view} {...{ onOpenSpirit, onWarmSpirit }} />);
  expect(screen.getByRole("button", { name: "獠牙猪 查看技能" })).toHaveFocus();
  expect(screen.getByRole("button", { name: "取消地" })).toBeVisible();
  expect(screen.getByRole("button", { name: "取消冰" })).toBeVisible();
  expect(screen.getByRole("status")).toHaveTextContent("火系攻击地＋冰系防守");
  expect(screen.getByRole("dialog").querySelector(".type-query__body").scrollTop).toBe(180);
});

test("首次空选，18属性最多双选；再点取消和清空", () => {
  render(<Harness />);
  expect(choices().getAllByRole("button")).toHaveLength(18);
  expect(screen.getByText("点击上方属性，即时查看抗性和打击面")).toBeVisible();
  expect(screen.getByRole("button", { name: "清空" })).toBeDisabled();
  fireEvent.click(choices().getByRole("button", { name: "水", exact: true }));
  expect(screen.getByRole("heading", { name: "进攻打击面" })).toBeVisible();
  fireEvent.click(choices().getByRole("button", { name: "地", exact: true }));
  expect(screen.getByRole("region", { name: "对应属性精灵" })).toBeVisible();
  expect(choices().getAllByRole("button").filter((button) => button.disabled)).toHaveLength(16);
  fireEvent.click(choices().getByRole("button", { name: "火", exact: true }));
  expect(screen.getByRole("button", { name: "取消水" })).toBeVisible();
  expect(screen.getByRole("button", { name: "取消地" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "取消水" }));
  expect(choices().getByRole("button", { name: "火", exact: true })).toBeEnabled();
  fireEvent.click(choices().getByRole("button", { name: "地", exact: true }));
  expect(screen.queryByRole("region", { name: "防守抗性" })).toBeNull();
  fireEvent.click(choices().getByRole("button", { name: "火", exact: true }));
  fireEvent.click(screen.getByRole("button", { name: "清空" }));
  expect(choices().getAllByRole("button").every((button) => button.getAttribute("aria-pressed") === "false")).toBe(true);
});

test("攻防倍率与可展开中性结果，点击来源不改查询属性", () => {
  render(<Harness initial={["水", "地"]} />);
  expect(within(screen.getByRole("group", { name: "双重弱点 3×" })).getByRole("button", { name: "查看防守草倍率来源" })).toBeVisible();
  expect(screen.queryByRole("group", { name: "免疫 0×" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "查看防守草倍率来源" }));
  expect(screen.getByRole("status")).toHaveTextContent("草系攻击水＋地系防守：承受 3 倍伤害。");
  expect(screen.getByRole("status")).toHaveTextContent("草打水：2 倍；草打地：2 倍。");
  expect(screen.getByRole("status")).toHaveTextContent("双重弱点为 3 倍，不是 4 倍");
  fireEvent.click(screen.getByRole("button", { name: "查看进攻火倍率来源" }));
  expect(screen.getByRole("status")).toHaveTextContent("攻击火系目标：最佳打击 2 倍。");
  expect(screen.getByRole("status")).toHaveTextContent("取较高倍率，不相乘");
  const details = screen.getByText("常规承伤 1× · 10 种属性").closest("details");
  expect(details).not.toHaveAttribute("open");
  fireEvent.click(details.querySelector("summary"));
  expect(details).toHaveAttribute("open");
  fireEvent.click(within(details).getAllByRole("button")[0]);
  expect(screen.getByRole("button", { name: "取消水" })).toBeVisible();
  expect(screen.getByRole("button", { name: "取消地" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "取消水" }));
  expect(screen.queryByRole("status")).toBeNull();
});

test("双属性显示每条进化链的最终形态，单属性隐藏", () => {
  render(<Harness initial={["地", "冰"]} />);
  const results = screen.getByRole("region", { name: "对应属性精灵" });
  expect(results).toHaveTextContent("獠牙猪");
  expect(results).not.toHaveTextContent("二阶");
  expect(results.previousElementSibling).toHaveClass("type-query__selection");
  expect(results.nextElementSibling).toHaveClass("type-query__columns");
  expect(within(results).getAllByRole("listitem")).toHaveLength(1);
  fireEvent.click(choices().getByRole("button", { name: "冰", exact: true }));
  expect(screen.queryByRole("region", { name: "对应属性精灵" })).toBeNull();
  fireEvent.click(choices().getByRole("button", { name: "武", exact: true }));
  const newResults = screen.getByRole("region", { name: "对应属性精灵" });
  const list = within(newResults).getByRole("list", { name: "匹配精灵，共 8 个" });
  expect(within(list).getAllByRole("listitem")).toHaveLength(8);
  expect(list).toHaveAttribute("tabindex", "0");
  expect(newResults).not.toHaveTextContent("獠牙猪");
});

test("按传入矩阵显示免疫，不补造属性关系", () => {
  const chart = structuredClone(snapshot.typeChart);
  chart.matrix[0][0] = 0;
  render(<Harness initial={["普通"]} chart={chart} />);
  expect(screen.getByRole("group", { name: "免疫 0×" })).toBeVisible();
  expect(screen.getByRole("group", { name: "无法打击 0×" })).toBeVisible();
});

test("关闭、Escape、滚动锁定与焦点还原", () => {
  const onClose = vi.fn();
  const trigger = document.createElement("button");
  document.body.append(trigger); trigger.focus();
  document.body.style.overflow = "auto";
  const { unmount } = render(<Harness onClose={onClose} />);
  expect(screen.getByRole("dialog")).toHaveFocus();
  expect(document.body.style.overflow).toBe("hidden");
  fireEvent.keyDown(document, { key: "Escape" });
  expect(onClose).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button", { name: "关闭属性查询" }));
  expect(onClose).toHaveBeenCalledTimes(2);
  unmount();
  expect(document.body.style.overflow).toBe("auto");
  expect(trigger).toHaveFocus();
  trigger.remove(); document.body.style.overflow = "";
});
