import { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import snapshot from "../../data/snapshots/current.json";
import TypeQueryPanel from "../../src/features/type-query/TypeQueryPanel.jsx";

function Harness({ initial = [], onClose = vi.fn(), chart = snapshot.typeChart }) {
  const [types, setTypes] = useState(initial);
  return <TypeQueryPanel typeChart={chart} selectedTypes={types} onTypesChange={setTypes} onClose={onClose} />;
}
const choices = () => within(screen.getByRole("group", { name: "选择属性" }));

test("首次空选，18属性最多双选；再点取消和清空", () => {
  render(<Harness />);
  expect(choices().getAllByRole("button")).toHaveLength(18);
  expect(screen.getByText("点击上方属性，即时查看抗性和打击面")).toBeVisible();
  expect(screen.getByRole("button", { name: "清空" })).toBeDisabled();
  fireEvent.click(choices().getByRole("button", { name: "水", exact: true }));
  expect(screen.getByText("我用这一系打谁")).toBeVisible();
  fireEvent.click(choices().getByRole("button", { name: "地", exact: true }));
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
  expect(screen.getByRole("status")).toHaveTextContent("点击结果查看倍率来源");
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
