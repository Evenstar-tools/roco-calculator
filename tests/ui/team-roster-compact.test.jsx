import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { TeamRoster } from "../../src/components/TeamRoster.jsx";

const snapshot = {
  spirits: Array.from({ length: 6 }, (_, index) => ({ id: `member-${index}`, fullName: `测试精灵${index + 1}`, asset: { localUrl: `/portrait-${index}.png` } })),
  skills: [],
};
const members = snapshot.spirits.map(spirit => ({ spiritId: spirit.id, natureId: "neutral", skills: { four: [] } }));

test("shared roster keeps six independent targets, full labels and the selected member", () => {
  const onSelect = vi.fn();
  const { rerender } = render(<TeamRoster members={members} snapshot={snapshot} selectedIndex={0} onSelect={onSelect} onApply={vi.fn()} />);
  const roster = screen.getByRole("list", { name: "队伍成员" });
  expect(roster).toHaveClass("team-roster");
  expect(within(roster).getAllByRole("listitem")).toHaveLength(6);
  for (let index = 0; index < 6; index += 1) {
    const button = within(roster).getByRole("button", { name: `编辑测试精灵${index + 1}` });
    expect(button).toHaveAttribute("title", `${index + 1}号位 · 测试精灵${index + 1}`);
    fireEvent.click(button);
    expect(onSelect).toHaveBeenLastCalledWith(index);
  }
  rerender(<TeamRoster members={members} snapshot={snapshot} selectedIndex={5} onSelect={onSelect} onApply={vi.fn()} />);
  expect(within(roster).getByRole("button", { name: "编辑测试精灵6" })).toHaveAttribute("aria-pressed", "true");
  expect(within(roster).getByRole("button", { name: "编辑测试精灵1" })).toHaveAttribute("aria-pressed", "false");
});

test("card attack and defense actions apply without selecting, and the folded duplicate is gone", () => {
  const onApply = vi.fn();
  const onSelect = vi.fn();
  const { container } = render(<TeamRoster members={members} snapshot={snapshot} selectedIndex={0} onSelect={onSelect} onApply={onApply} />);
  expect(container.querySelector(".team-roster__current-actions")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "测试精灵1设为攻击方" }));
  expect(onApply).toHaveBeenLastCalledWith("attacker", members[0]);
  fireEvent.click(screen.getByRole("button", { name: "测试精灵6设为防御方" }));
  expect(onApply).toHaveBeenLastCalledWith("defender", members[5]);
  expect(onSelect).not.toHaveBeenCalled();
});

test("empty slots read as add actions, stay selectable and cannot be applied", () => {
  const onSelect = vi.fn();
  render(<TeamRoster members={[members[0], null]} snapshot={snapshot} selectedIndex={5} onSelect={onSelect} onApply={vi.fn()} />);
  const empty = screen.getByRole("button", { name: "编辑空位 6" });
  expect(empty).toHaveTextContent("添加精灵");
  expect(empty).not.toHaveTextContent("空位");
  expect(empty.closest("li")).toHaveClass("is-empty");
  fireEvent.click(empty);
  expect(onSelect).toHaveBeenCalledWith(5);
  expect(screen.getByRole("button", { name: "空位 6设为攻击方" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "空位 6设为防御方" })).toBeDisabled();
});

test("cards hide the neutral nature label but keep real natures", () => {
  const adamant = { ...members[1], natureId: "adamant" };
  render(<TeamRoster members={[members[0], adamant]} snapshot={snapshot} selectedIndex={0} onSelect={vi.fn()} onApply={vi.fn()} />);
  expect(screen.getByRole("button", { name: "编辑测试精灵1" })).not.toHaveTextContent("普通");
  expect(screen.getByRole("button", { name: "编辑测试精灵2" })).toHaveTextContent("固执");
});

test("an unselected roster hides current-member actions", () => {
  const { container } = render(<TeamRoster members={members} snapshot={snapshot} selectedIndex={-1} onSelect={vi.fn()} onApply={vi.fn()} />);
  expect(screen.getByRole("list", { name: "队伍成员" })).not.toHaveClass("team-roster--compact");
  expect(container.querySelector(".team-roster__current-actions")).toBeNull();
});
