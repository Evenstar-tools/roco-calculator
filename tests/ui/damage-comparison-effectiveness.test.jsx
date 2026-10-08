import { render, screen, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import DamageComparisonDialog from "../../src/components/DamageComparisonDialog.jsx";

vi.mock("../../src/features/damage-comparison/useDamageComparison.js", () => ({
  useDamageComparison: () => ({
    selection: { options: [], index: 0 }, templates: [], template: { label: "测试" },
    ranking: { excluded: [] }, rows: [0, 0.25, 0.5, 1, 2, 3, 4, undefined, null, NaN].map((value, index) => ({
      spirit: { id: String(index), fullName: `精灵${index}`, types: ["光"] },
      rank: index + 1, damage: 10, percent: value === 2 ? 25 : 10, remainingHp: 90,
      damagePercent: 10, freezePercent: value === 2 ? 15 : 0,
      result: { typeMultiplier: value },
      template: { id: "standard-hp-v1", presetFallback: value === 2 },
    })), limit: 20,
  }),
}));

test("克制列使用计算结果，保留零和小数，无倍率时不冒充一倍", () => {
  render(<DamageComparisonDialog snapshot={{ spirits: [] }} source={{}} onClose={vi.fn()} />);
  for (const value of [0, 0.25, 0.5, 1, 2, 3, 4]) {
    expect(screen.getByLabelText(`克制倍率 ${value}`, { exact: true })).toHaveTextContent(String(value));
  }
  expect(screen.getAllByLabelText("克制倍率 不适用")).toHaveLength(3);
  for (const unknown of screen.getAllByLabelText("克制倍率 不适用")) expect(unknown).toHaveTextContent("—");
});

test("手机类型行与桌面克制列使用同一倍率语义，免疫与未知不冒充抵抗", () => {
  render(<DamageComparisonDialog snapshot={{ spirits: [] }} source={{}} onClose={vi.fn()} />);
  for (const [value, tone] of [[0, "immune"], [0.25, "resistance"], [0.5, "resistance"], [1, "neutral"], [2, "weakness"], [3, "weakness"], [4, "weakness"]]) {
    for (const label of ["克制倍率", "属性倍率"]) {
      const badge = screen.getByLabelText(`${label} ${value}`, { exact: true });
      expect(badge).toHaveAttribute("data-tone", tone);
      expect(badge).toHaveTextContent(`×${value}`);
      if (value === 0) expect(badge).toHaveTextContent("免疫");
    }
  }
  for (const badge of screen.getAllByLabelText("属性倍率 不适用")) {
    expect(badge).toHaveAttribute("data-tone", "unknown");
    expect(badge).toHaveTextContent("—");
  }
  const identity = screen.getByLabelText("属性倍率 2", { exact: true }).closest(".dc-web-identity");
  expect(identity).toHaveTextContent("光");
  expect(identity).toHaveTextContent("无预设");
  expect(identity).toHaveTextContent("伤害 10 HP");
});

test("冻结摘要保留伤害和斩杀比例，手机能按整段换行", () => {
  render(<DamageComparisonDialog snapshot={{ spirits: [] }} source={{}} onClose={vi.fn()} />);
  const row = screen.getByRole("button", { name: "查看精灵4承伤详情" });
  expect(within(row).getByRole("img", { name: "伤害10.0%＋冻结15%" })).toBeInTheDocument();
  const parts = row.querySelectorAll(".dc-web-freeze-breakdown > span");
  expect([...parts].map((part) => part.textContent)).toEqual(["伤害10.0%", "＋冻结15%"]);
  expect(row).toHaveTextContent("25.0%");
  expect(row).toHaveTextContent("剩余 90 HP");
});
