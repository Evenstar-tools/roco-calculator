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
  expect(button.textContent).toBe("0");
  fireEvent.click(button);
  expect(onUndo).not.toHaveBeenCalled();

  view.rerender(<FloatingUndoButton count={3} onUndo={onUndo} />);
  expect(button.textContent).toBe("3");
  expect(button).toHaveAttribute("title", "撤回上一步（3）");
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
  expect(button.style.left).toBe("568px");
  expect(button.style.top).toBe("344px");
  expect(JSON.parse(localStorage.getItem(UNDO_POSITION_STORAGE_KEY))).toEqual({
    x: 568,
    y: 344,
  });
});

test("defaults to the bottom right and does not shift between availability states", () => {
  const view = render(<FloatingUndoButton count={0} />);
  const button = screen.getByRole("button");
  expect(button.style.left).toBe("898px");
  expect(button.style.top).toBe("574px");
  view.rerender(<FloatingUndoButton count={50} />);
  expect(button.style.left).toBe("898px");
  expect(button.style.top).toBe("574px");
  expect(button.textContent).toBe("50");
});

test("keeps the full strip inside narrow screens and clear of the mobile bottom bar", () => {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 320 });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: 640 });
  localStorage.setItem(UNDO_POSITION_STORAGE_KEY, JSON.stringify({ x: 950, y: 680 }));
  render(<FloatingUndoButton count={1} />);
  const button = screen.getByRole("button");
  expect(button.style.left).toBe("218px");
  expect(button.style.top).toBe("514px");
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 300 });
  fireEvent(window, new Event("resize"));
  expect(button.style.left).toBe("198px");
});

function resize(width, height) {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: height });
  fireEvent(window, new Event("resize"));
}

test("默认位置随手机及桌面视口恢复右下角，点击与缩放不保存成拖拽位置", () => {
  const onUndo = vi.fn();
  render(<FloatingUndoButton count={2} onUndo={onUndo} />);
  const button = screen.getByRole("button");
  resize(320, 720);
  expect(button).toHaveStyle({ left: "218px", top: "594px" });
  fireEvent.pointerDown(button, { clientX: 240, clientY: 610, pointerId: 1 });
  fireEvent.pointerUp(button, { clientX: 240, clientY: 610, pointerId: 1 });
  fireEvent.click(button);
  expect(onUndo).toHaveBeenCalledOnce();
  resize(390, 844);
  expect(button).toHaveStyle({ left: "288px", top: "718px" });
  resize(1280, 900);
  expect(button).toHaveStyle({ left: "1178px", top: "838px" });
  resize(1920, 1080);
  expect(button).toHaveStyle({ left: "1818px", top: "1018px" });
  expect(localStorage.getItem(UNDO_POSITION_STORAGE_KEY)).toBeNull();
});

test("手动保存位置在缩小时临时限界，放大和重新挂载后仍保留原选择", () => {
  localStorage.setItem(UNDO_POSITION_STORAGE_KEY, JSON.stringify({ x: 700, y: 500 }));
  const view = render(<FloatingUndoButton count={1} />);
  resize(320, 640);
  expect(screen.getByRole("button")).toHaveStyle({ left: "218px", top: "500px" });
  expect(JSON.parse(localStorage.getItem(UNDO_POSITION_STORAGE_KEY))).toEqual({ x: 700, y: 500 });
  resize(1280, 900);
  expect(screen.getByRole("button")).toHaveStyle({ left: "700px", top: "500px" });
  view.unmount();
  render(<FloatingUndoButton count={1} />);
  expect(screen.getByRole("button")).toHaveStyle({ left: "700px", top: "500px" });
});
