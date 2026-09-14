import { render, screen, fireEvent } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import TeamWeaknessSummary from "../../src/components/TeamWeaknessSummary.jsx";

test("按弱点成员数降序，三倍弱点只计一名成员，并提供对应候选入口", () => {
  const onCandidates = vi.fn();
  const analysis = { types: ["草", "幽", "火"], members: [
    { name: "甲", defense: [{ type: "草", multiplier: 3 }, { type: "幽", multiplier: 2 }, { type: "火", multiplier: null }] },
    { name: "乙", defense: [{ type: "草", multiplier: 0.5 }, { type: "幽", multiplier: 3 }, { type: "火", multiplier: 1 }] },
  ] };
  render(<TeamWeaknessSummary analysis={analysis} onCandidates={onCandidates} />);
  expect(screen.getAllByRole("button").map(button => button.getAttribute("aria-label"))).toEqual(["查看幽抗性候选", "查看草抗性候选"]);
  expect(screen.getByText("2 个幽属性弱点")).toBeInTheDocument();
  expect(screen.getByText("1 个草属性弱点")).toBeInTheDocument();
  expect(screen.getByText("可抵抗 ×1")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "查看幽抗性候选" }));
  expect(onCandidates).toHaveBeenCalledWith("幽");
});
