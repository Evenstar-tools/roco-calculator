import { readFileSync } from "node:fs";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, test } from "vitest";
import { withCalculatorExtras } from "../../src/data/snapshot-extras.js";
import { withWebPreview } from "../../src/features/s5-preview/with-web-preview.js";
import { DeerWorkspace } from "../../src/features/deer/DeerPage.jsx";

const snapshot = withCalculatorExtras(JSON.parse(readFileSync("public/data/runtime.json", "utf8")));
const skillRow = (name) => screen.getByRole("button", { name, exact: true }).closest("tr");

test("S5过充电顶部两行分别展示65与95威力，不再输入聚能次数", () => {
  render(<DeerWorkspace snapshot={withWebPreview(snapshot)} />);
  expect(screen.queryByRole("spinbutton", { name: "聚能次数" })).not.toBeInTheDocument();
  const normal = skillRow("过充电 · 未强化");
  const charged = skillRow("过充电 · 已强化");
  expect(normal).toBe(screen.getAllByRole("row")[1]);
  expect(charged).toBe(screen.getAllByRole("row")[2]);
  expect(charged).toHaveTextContent("已聚能至少1次");
  const arc = skillRow("电弧 · 普通").textContent;
  fireEvent.click(screen.getByRole("button", { name: "查看过充电 · 未强化详情" }));
  expect(screen.getByText(/实际威力 65/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "查看过充电 · 已强化详情" }));
  expect(screen.getByText(/实际威力 95/)).toBeInTheDocument();
  expect(screen.getByText("聚能后永久＋30威力，仅强化一次。")).toBeInTheDocument();
  expect(charged.querySelector(".deer-damage").textContent).not.toBe(normal.querySelector(".deer-damage").textContent);
  expect(skillRow("电弧 · 普通")).toHaveTextContent(arc);
});

test("S5两种电鹿均展示未强化和已强化两行，旧资料不显示缺失技能", () => {
  const { unmount } = render(<DeerWorkspace snapshot={snapshot} />);
  expect(screen.queryByRole("button", { name: /过充电/, exact: false })).toBeNull();
  unmount();
  render(<DeerWorkspace snapshot={withWebPreview(snapshot)} />);
  fireEvent.change(screen.getByLabelText("攻击方精灵"), { target: { value: "爵士鹿" } });
  fireEvent.click(screen.getByRole("option", { name: /爵士鹿/ }));
  expect(screen.getByRole("button", { name: "过充电 · 未强化", exact: true })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "过充电 · 已强化", exact: true })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "查看过充电 · 已强化详情" }));
  expect(screen.getByText(/实际威力 95/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "愿力冲击", exact: true })).toBeInTheDocument();
});

test("通电位于先发上方，默认只算直伤，勾选触发2层引电显示合计及拆分", () => {
  render(<DeerWorkspace snapshot={snapshot} />);
  const row = skillRow("通电");
  expect(row.nextElementSibling).toBe(skillRow("先发制人"));
  const toggle = within(row).getByLabelText("触发2层引电");
  expect(toggle).not.toBeChecked();
  const direct = row.querySelector('.deer-damage').textContent;
  const arc = skillRow("电弧 · 普通").textContent;
  fireEvent.click(toggle);
  expect(row).toHaveTextContent("含一次引电");
  expect(row.querySelector('.deer-damage').textContent).not.toBe(direct);
  expect(row).toHaveTextContent(/通电 \d+ ＋ 引电 \d+/);
  expect(skillRow("电弧 · 普通")).toHaveTextContent(arc);
  fireEvent.click(screen.getByRole("button", { name: "查看通电详情" }));
  expect(screen.getByText(/合计：通电 .* 引电 .*凑齐2层引电触发一次/)).toBeInTheDocument();
  expect(document.querySelectorAll('.deer-layer-grid > div')).toHaveLength(100);
  fireEvent.click(toggle);
  expect(row.querySelector('.deer-damage')).toHaveTextContent(direct);
  expect(screen.queryByText(/合计：通电/)).not.toBeInTheDocument();
});

test("生命无性格增益，无预设默认生命并保留无耐久入口", () => {
  render(<DeerWorkspace snapshot={snapshot} />);
  const defense = screen.getByRole("region", { name: "防御方配置" });
  expect(within(defense).getByRole("button", { name: "生命", exact: true })).toHaveAttribute("aria-pressed", "true");
  expect(within(defense).getByText(/生命60 \/ 物防0 \/ 魔防0/)).toHaveTextContent("普通");
  fireEvent.click(within(defense).getByRole("button", { name: "手调配置" }));
  expect(screen.getByLabelText("防御方性格")).toHaveValue("neutral");
  for (const stat of ["物攻", "魔攻", "速度", "物防", "魔防"]) expect(within(defense).getByLabelText(`${stat}个体`)).toHaveValue(0);
  fireEvent.click(within(defense).getByRole("button", { name: "无耐久", exact: true }));
  expect(within(defense).getByLabelText("生命个体")).toHaveValue(0);
  fireEvent.click(within(defense).getByRole("button", { name: "生命", exact: true }));
  expect(within(defense).getByLabelText("生命个体")).toHaveValue(60);
  expect(screen.getByLabelText("防御方性格")).toHaveValue("neutral");
});

test("一键填单招最低层数并高亮技能，不混用先发补刀层数", () => {
  render(<DeerWorkspace snapshot={snapshot} />);
  fireEvent.click(screen.getByRole("button", { name: "满耐久", exact: true }));
  const before = JSON.stringify(localStorage);
  fireEvent.click(screen.getByRole("button", { name: "一键填层数" }));
  expect(screen.getByLabelText("特性层数")).toHaveValue(5);
  expect(skillRow("下注 · 明")).toHaveAttribute("aria-selected", "true");
  expect(screen.getByRole("status")).toHaveTextContent("已填入 5 层 · 下注 · 明");
  expect(JSON.stringify(localStorage)).toBe(before);
  fireEvent.click(screen.getByRole("button", { name: "无耐久", exact: true }));
  expect(skillRow("下注 · 明")).not.toHaveAttribute("aria-selected", "true");
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});
