import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import DamageRangeFilter from "../../src/components/DamageRangeFilter.jsx";
import { filterSkillDamageRanking } from "../../src/domain/skill-damage-ranking.js";

test("分段、端点、可击倒及全部切换", () => {
  function Harness() { const [value, setValue] = useState("all"); return <DamageRangeFilter value={value} onChange={setValue} />; }
  render(<Harness />);
  fireEvent.click(screen.getByRole("button", { name: "25%至50%" }));
  expect(screen.getByText("25%–50%")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("承伤范围上限"), { target: { value: 75 } });
  expect(screen.getByText("25%–75%")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "≥100%" }));
  expect(screen.getByRole("button", { name: "≥100%" })).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(screen.getByRole("button", { name: "全部" }));
  expect(screen.getByRole("button", { name: "全部" })).toHaveAttribute("aria-pressed", "true");
});

test("区间含下限不含上限，100%归入可击倒", () => {
  const rows = [0, 24.99, 25, 49.99, 50, 75, 99.99, 100, 125].map((damage) => ({ spirit: { fullName: String(damage) }, damage, percent: damage, panelStats: { hp: 100 }, lethal: damage >= 100 }));
  expect(filterSkillDamageRanking(rows, { filter: [25, 50] }).map((row) => row.damage)).toEqual([25, 49.99]);
  expect(filterSkillDamageRanking(rows, { filter: [0, 100] })).toHaveLength(7);
  expect(filterSkillDamageRanking(rows, { filter: "ko" }).map((row) => row.damage)).toEqual([100, 125]);
  expect(filterSkillDamageRanking(rows, { filter: [75, null] }).map((row) => row.damage)).toEqual([75, 99.99, 100, 125]);
});

test("全部高亮五段，拖动只在松手后提交并吸附25%", () => {
  const onChange = vi.fn();
  render(<DamageRangeFilter value="all" onChange={onChange} />);
  expect(screen.getByRole("button", { name: "75%至100%" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "≥100%" })).toHaveAttribute("aria-pressed", "true");
  const lower = screen.getByLabelText("承伤范围下限");
  fireEvent.pointerDown(lower);
  fireEvent.change(lower, { target: { value: 73 } });
  expect(onChange).not.toHaveBeenCalled();
  expect(lower).toHaveValue("73");
  fireEvent.pointerUp(lower);
  expect(onChange).toHaveBeenCalledExactlyOnceWith([75, null]);
});
