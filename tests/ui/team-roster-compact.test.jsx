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

test("current member actions retain attack and defense behavior without applying on selection", () => {
  const onApply = vi.fn();
  const { container, rerender } = render(<TeamRoster members={members} snapshot={snapshot} selectedIndex={0} onSelect={vi.fn()} onApply={onApply} />);
  let details = container.querySelector(".team-roster__current-actions");
  fireEvent.click(details.querySelector("summary"));
  details.open = true;
  expect(onApply).not.toHaveBeenCalled();
  fireEvent.click(within(details).getByRole("button", { name: "测试精灵1设为攻击方" }));
  expect(onApply).toHaveBeenLastCalledWith("attacker", members[0]);
  rerender(<TeamRoster members={members} snapshot={snapshot} selectedIndex={5} onSelect={vi.fn()} onApply={onApply} />);
  details = container.querySelector(".team-roster__current-actions");
  expect(details.open).toBe(false);
  details.open = true;
  fireEvent.click(within(details).getByRole("button", { name: "测试精灵6设为防御方" }));
  expect(onApply).toHaveBeenLastCalledWith("defender", members[5]);
});

test("empty slots remain selectable while applying an empty member is disabled", () => {
  const onSelect = vi.fn();
  const { container } = render(<TeamRoster members={[members[0], null]} snapshot={snapshot} selectedIndex={5} onSelect={onSelect} onApply={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "编辑空位 6" }));
  expect(onSelect).toHaveBeenCalledWith(5);
  const details = container.querySelector(".team-roster__current-actions");
  details.open = true;
  expect(within(details).getAllByRole("button").every(button => button.disabled)).toBe(true);
});

test("an unselected roster hides current-member actions", () => {
  const { container } = render(<TeamRoster members={members} snapshot={snapshot} selectedIndex={-1} onSelect={vi.fn()} onApply={vi.fn()} />);
  expect(screen.getByRole("list", { name: "队伍成员" })).not.toHaveClass("team-roster--compact");
  expect(container.querySelector(".team-roster__current-actions")).toBeNull();
});
