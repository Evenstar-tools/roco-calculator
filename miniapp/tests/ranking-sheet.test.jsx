import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import RankingSheet from "../src/components/RankingSheet.jsx";
const snapshot = { meta: {}, spirits: [
  { id: "water", fullName: "水测试", types: ["水"] },
  { id: "grass", fullName: "草测试", types: ["草"] },
].map((spirit) => ({ ...spirit, stage: "首领", sourceCategory: "首领形态", raceStats: { hp: 100, physicalDefense: 100, magicalDefense: 100, physicalAttack: 100, magicalAttack: 100, speed: 100 } })) };

test("倍率支持全取消、半选和任意组合；详情可返回", () => {
  const close = vi.fn();
  render(<RankingSheet kind="durability" snapshot={snapshot} onClose={close} />);
  fireEvent.change(screen.getByLabelText("承受属性"), { target: { value: "3" } });
  fireEvent.click(screen.getByRole("checkbox", { name: /全选/ }));
  expect(screen.getByText("尚未勾选倍率")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("checkbox", { name: "×0.5" }));
  expect(screen.getByRole("checkbox", { name: /全选/ })).toHaveAttribute("aria-checked", "mixed");
  expect(screen.getByText("水测试")).toBeInTheDocument();
  expect(screen.queryByText("草测试")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("checkbox", { name: "×2" }));
  fireEvent.click(screen.getByText("草测试"));
  expect(screen.getByText("榜单配置详情")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "返回" }));
  expect(screen.getByText("水测试")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "关闭" }));
  expect(close).toHaveBeenCalledOnce();
});

test("无队伍也能打开速度榜，同精灵多口径保留且不虚构当前速度", () => {
  render(<RankingSheet kind="speed" snapshot={snapshot} onClose={() => {}} />);
  expect(screen.getAllByText("水测试")).toHaveLength(2);
  expect(screen.queryByText(/当前速度/)).not.toBeInTheDocument();
});

test("速度试查、种族筛选及去字头像详情可操作", () => {
  render(<RankingSheet kind="speed" snapshot={snapshot} onClose={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: "试查 267" }));
  expect(screen.getByText(/比 267 快 0 · 同速 0 · 慢 4 个配置/)).toBeInTheDocument();
  expect(screen.getByText("基准位置 · 没有同速配置")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "种族速度" }));
  expect(screen.getByText("没有符合当前条件的结果")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "重置" }));
  fireEvent.click(screen.getByRole("button", { name: "隐藏精灵文字" }));
  expect(screen.queryByText("水测试")).not.toBeInTheDocument();
  fireEvent.click(screen.getAllByRole("button", { name: /水测试，速度/ })[0]);
  expect(screen.getByText("榜单配置详情")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "返回" }));
  expect(screen.getByRole("button", { name: "显示精灵文字" })).toBeInTheDocument();
});
