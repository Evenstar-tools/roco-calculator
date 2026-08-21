import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import {
  FloatingUndoButton,
  UNDO_POSITION_STORAGE_KEY,
} from "../../src/components/FloatingUndoButton.jsx";

beforeEach(() => {
  localStorage.removeItem(UNDO_POSITION_STORAGE_KEY);
  window.PointerEvent = MouseEvent;
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1000 });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: 700 });
});

test("explains the unavailable and available undo states", () => {
  const onUndo = vi.fn();
  const view = render(<FloatingUndoButton count={0} onUndo={onUndo} />);
  const button = screen.getByRole("button", { name: "暂无可撤回操作" });
  expect(button).toHaveAttribute("aria-disabled", "true");
  fireEvent.click(button);
  expect(onUndo).not.toHaveBeenCalled();

  view.rerender(<FloatingUndoButton count={3} onUndo={onUndo} />);
  fireEvent.click(screen.getByRole("button", { name: "撤回上一步（3）" }));
  expect(onUndo).toHaveBeenCalledTimes(1);
});

test("can be dragged without accidentally undoing and remembers its position", () => {
  const onUndo = vi.fn();
  render(<FloatingUndoButton count={2} onUndo={onUndo} />);
  const button = screen.getByRole("button", { name: "撤回上一步（2）" });
  button.setPointerCapture = vi.fn();

  fireEvent.pointerDown(button, { clientX: 930, clientY: 630, pointerId: 1 });
  fireEvent.pointerMove(button, { clientX: 600, clientY: 400, pointerId: 1 });
  fireEvent.pointerUp(button, { clientX: 600, clientY: 400, pointerId: 1 });
  fireEvent.click(button);

  expect(onUndo).not.toHaveBeenCalled();
  expect(button.style.left).toBe("606px");
  expect(button.style.top).toBe("406px");
  expect(JSON.parse(localStorage.getItem(UNDO_POSITION_STORAGE_KEY))).toEqual({
    x: 606,
    y: 406,
  });
});
