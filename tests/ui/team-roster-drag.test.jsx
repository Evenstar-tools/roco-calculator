import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { TeamRoster } from "../../src/components/TeamRoster.jsx";

const snapshot = {
  spirits: Array.from({ length: 6 }, (_, index) => ({
    id: `member-${index}`,
    fullName: `测试精灵${index + 1}`,
    asset: { localUrl: `/portrait-${index}.png` },
  })),
  skills: [],
};
const members = snapshot.spirits.map((spirit) => ({
  spiritId: spirit.id,
  natureId: "neutral",
  skills: { four: [] },
}));

beforeEach(() => {
  vi.stubGlobal("PointerEvent", MouseEvent);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function renderRoster() {
  const actions = { onApply: vi.fn(), onReorder: vi.fn(), onSelect: vi.fn() };
  const onOutsideClick = vi.fn();
  const view = render(<>
    <button onClick={onOutsideClick} type="button">关闭队伍</button>
    <TeamRoster {...actions} members={members} selectedIndex={-1} snapshot={snapshot} />
  </>);
  const roster = screen.getByRole("list", { name: "队伍成员" });
  vi.spyOn(roster, "getBoundingClientRect").mockReturnValue({
    x: 10, y: 100, left: 10, top: 100, right: 250, bottom: 700, width: 240, height: 600,
  });
  for (const slot of within(roster).getAllByRole("listitem")) {
    vi.spyOn(slot, "getBoundingClientRect").mockImplementation(() => {
      const top = 100 + Number(slot.dataset.slotPosition) * 100;
      return { x: 10, y: top, left: 10, top, right: 250, bottom: top + 88, width: 240, height: 88 };
    });
  }
  return { ...actions, ...view, onOutsideClick, roster, first: within(roster).getByRole("button", { name: "编辑测试精灵1" }) };
}

test("ordinary card clicks and attack actions keep their behavior without reordering", () => {
  const { first, onSelect, onApply, onReorder, roster } = renderRoster();

  fireEvent.pointerDown(first, { button: 0, clientX: 60, clientY: 140 });
  fireEvent.pointerUp(window, { button: 0, clientX: 60, clientY: 140 });
  fireEvent.click(first, { detail: 1 });
  expect(onSelect).toHaveBeenCalledExactlyOnceWith(0);
  fireEvent.click(within(roster).getByRole("button", { name: "测试精灵1设为攻击方" }));

  expect(onApply).toHaveBeenCalledExactlyOnceWith("attacker", members[0]);
  expect(onReorder).not.toHaveBeenCalled();
  expect(document.querySelector(".team-roster-drag-backdrop")).toBeNull();
});

test("Alt and arrow keys reorder adjacent slots without selecting or applying the member", () => {
  const { first, roster, onReorder, onSelect, onApply } = renderRoster();
  const second = within(roster).getByRole("button", { name: "编辑测试精灵2" });

  fireEvent.keyDown(first, { key: "ArrowDown", altKey: true });
  fireEvent.keyDown(second, { key: "ArrowLeft", altKey: true });
  fireEvent.keyDown(first, { key: "ArrowUp", altKey: true });
  fireEvent.keyDown(second, { key: "ArrowRight" });

  expect(onReorder.mock.calls).toEqual([[0, 1], [1, 0]]);
  expect(onSelect).not.toHaveBeenCalled();
  expect(onApply).not.toHaveBeenCalled();
});

test("dragging commits only on release and removes its overlay after release Escape blur or unmount", () => {
  vi.spyOn(performance, "now").mockReturnValue(1000);
  const { first, onReorder, onSelect, onApply, onOutsideClick, unmount } = renderRoster();
  function dragToThirdSlot() {
    fireEvent.pointerDown(first, { button: 0, clientX: 60, clientY: 140 });
    fireEvent.pointerMove(window, { buttons: 1, clientX: 60, clientY: 340 });
    expect(document.querySelector(".team-roster-drag-backdrop")).not.toBeNull();
    expect(document.querySelector(".team-roster-drag-preview")).not.toBeNull();
  }
  function expectCleaned() {
    expect(document.querySelector(".team-roster-drag-layer")).toBeNull();
    expect(document.querySelector(".team-roster-drag-preview")).toBeNull();
  }

  dragToThirdSlot();
  expect(onReorder).not.toHaveBeenCalled();
  fireEvent.pointerUp(window, { button: 0, clientX: 60, clientY: 340 });
  expect(onReorder).toHaveBeenCalledExactlyOnceWith(0, 2);
  expectCleaned();
  // The post-drag click guard belongs to the roster, not the whole drawer.
  fireEvent.click(screen.getByRole("button", { name: "关闭队伍" }), { detail: 1 });
  expect(onOutsideClick).toHaveBeenCalledTimes(1);
  fireEvent.click(first, { detail: 1 });
  expect(onSelect).not.toHaveBeenCalled();
  expect(onApply).not.toHaveBeenCalled();

  dragToThirdSlot();
  fireEvent.keyDown(window, { key: "Escape" });
  fireEvent.pointerUp(window, { button: 0, clientX: 60, clientY: 340 });
  expectCleaned();
  expect(onReorder).toHaveBeenCalledTimes(1);

  dragToThirdSlot();
  fireEvent.blur(window);
  expectCleaned();
  expect(onReorder).toHaveBeenCalledTimes(1);

  dragToThirdSlot();
  unmount();
  expectCleaned();
  expect(onReorder).toHaveBeenCalledTimes(1);
});
