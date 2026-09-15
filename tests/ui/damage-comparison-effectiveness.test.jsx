import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import DamageComparisonDialog from "../../src/components/DamageComparisonDialog.jsx";

vi.mock("../../src/features/damage-comparison/useDamageComparison.js", () => ({
  useDamageComparison: () => ({
    selection: { options: [], index: 0 }, templates: [], template: { label: "测试" },
    ranking: { excluded: [] }, rows: [0, 0.25, 0.5, 1, 2, 3, undefined].map((value, index) => ({
      spirit: { id: String(index), fullName: `精灵${index}`, types: ["光"] },
      rank: index + 1, damage: 10, percent: 10, remainingHp: 90,
      result: { typeMultiplier: value },
    })), limit: 20,
  }),
}));

test("克制列使用计算结果，保留零和小数，无倍率时不冒充一倍", () => {
  render(<DamageComparisonDialog snapshot={{ spirits: [] }} source={{}} onClose={vi.fn()} />);
  for (const value of [0, 0.25, 0.5, 1, 2, 3]) {
    expect(screen.getByLabelText(`克制倍率 ${value}`, { exact: true })).toHaveTextContent(String(value));
  }
  expect(screen.getByLabelText("克制倍率 不适用")).toHaveTextContent("—");
});
