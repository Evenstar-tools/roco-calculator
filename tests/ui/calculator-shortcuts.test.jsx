import { useState } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { useCalculatorShortcuts } from "../../src/hooks/useCalculatorShortcuts.js";

function Harness({ enabled = true, onSave = () => {} }) {
  const [mode, setMode] = useState("compact");
  const [preview, setPreview] = useState(null);
  const [steps, setSteps] = useState(5);
  const [nature, setNature] = useState("neutral");
  useCalculatorShortcuts({
    enabled, viewMode: mode, onPreview: setPreview,
    onModeChange: (next) => { setMode(next); onSave(next); },
    canUndo: steps > 0, onUndo: () => setSteps((value) => value - 1),
  });
  return <><output data-testid="mode">{preview ?? mode}</output><output data-testid="steps">{steps}</output><output data-testid="nature">{nature}</output><input aria-label="输入" /><select aria-label="选择" value={nature} onChange={event => setNature(event.target.value)}><option value="neutral">普通</option><option value="cheerful">开朗</option></select><div contentEditable suppressContentEditableWarning aria-label="编辑">text</div></>;
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
const tick = (ms) => act(() => vi.advanceTimersByTime(ms));
const down = (key, options = {}, target = document.body) => fireEvent.keyDown(target, { key, ...options });
const up = (key, options = {}) => fireEvent.keyUp(document.body, { key, ...options });
const mode = () => screen.getByTestId("mode").textContent;
const steps = () => Number(screen.getByTestId("steps").textContent);

test("Tab 按下立即预览，短按提交且可往返切换", () => {
  const onSave = vi.fn();
  render(<Harness onSave={onSave} />);
  expect(down("Tab")).toBe(false);
  expect(mode()).toBe("detailed");
  expect(onSave).not.toHaveBeenCalled();
  tick(100); up("Tab");
  expect(mode()).toBe("detailed");
  expect(onSave).toHaveBeenLastCalledWith("detailed");
  down("Tab"); up("Tab");
  expect(mode()).toBe("compact");
});

test("Tab 长按忽略系统连发，松开还原且不保存临时模式", () => {
  const onSave = vi.fn();
  render(<Harness onSave={onSave} />);
  down("Tab"); tick(350); down("Tab", { repeat: true });
  expect(mode()).toBe("detailed");
  up("Tab");
  expect(mode()).toBe("compact");
  expect(onSave).not.toHaveBeenCalled();
  down("Tab"); up("Tab");
  down("Tab"); tick(400); up("Tab");
  expect(mode()).toBe("detailed");
  expect(onSave).toHaveBeenCalledTimes(1);
});

test("Ctrl+Z 短按一步，长按等待后定速连撤，松开即停", () => {
  render(<Harness />);
  down("z", { ctrlKey: true });
  expect(steps()).toBe(4);
  tick(449);
  expect(steps()).toBe(4);
  down("z", { ctrlKey: true, repeat: true });
  expect(steps()).toBe(4);
  tick(1); expect(steps()).toBe(3);
  tick(120); expect(steps()).toBe(2);
  up("z"); tick(1000); expect(steps()).toBe(2);
  down("Z", { ctrlKey: true }); up("Z");
  expect(steps()).toBe(1);
});

test("撤空停止，松开 Ctrl 也停止，不受渲染更新影响", () => {
  render(<Harness />);
  down("z", { ctrlKey: true }); up("Control"); tick(1000);
  expect(steps()).toBe(4);
  down("z", { ctrlKey: true }); tick(450);
  for (let i = 0; i < 10; i++) tick(120);
  expect(steps()).toBe(0);
});

test.each(["输入", "选择", "编辑"])("%s 中保留原生 Tab 和 Ctrl+Z", (label) => {
  render(<Harness />);
  const target = screen.getByLabelText(label);
  expect(down("Tab", {}, target)).toBe(true);
  expect(down("z", { ctrlKey: true }, target)).toBe(true);
  expect(mode()).toBe("compact");
  expect(steps()).toBe(5);
});

test.each([{ shiftKey: true }, { altKey: true }, { ctrlKey: true }, { metaKey: true }, { isComposing: true }, { keyCode: 229 }])("不抢占修饰键 Tab 或输入法：%j", (options) => {
  render(<Harness />);
  expect(down("Tab", options)).toBe(true);
  expect(mode()).toBe("compact");
});

test("Ctrl+Shift+Z 不触发撤回，已处理的事件不再处理", () => {
  render(<Harness />);
  expect(down("z", { ctrlKey: true, shiftKey: true })).toBe(true);
  const event = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
  event.preventDefault(); fireEvent(document.body, event);
  expect(mode()).toBe("compact");
  expect(steps()).toBe(5);
});

test.each(["blur", "hidden"])("%s 中断临时模式与连撤，不会卡住", (reason) => {
  render(<Harness />);
  const cancel = () => {
    if (reason === "focus") fireEvent.focusIn(screen.getByLabelText("输入"));
    else if (reason === "hidden") {
      const spy = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
      fireEvent(document, new Event("visibilitychange")); spy.mockRestore();
    } else fireEvent(window, new Event(reason));
  };
  down("Tab"); cancel(); up("Tab");
  expect(mode()).toBe("compact");
  down("z", { ctrlKey: true }); cancel(); tick(1000);
  expect(steps()).toBe(4);
});

test("按住 Tab 可点击、聚焦并修改性格，松开仅还原模式且修改保留", () => {
  const onSave = vi.fn();
  render(<Harness onSave={onSave} />);
  down("Tab"); tick(400);
  const target = screen.getByLabelText("选择");
  fireEvent.pointerDown(target);
  fireEvent.focusIn(target);
  expect(mode()).toBe("detailed");
  down("ArrowDown", {}, target);
  fireEvent.change(target, { target: { value: "cheerful" } });
  down("Enter", {}, target);
  expect(mode()).toBe("detailed");
  // 已持有的 Tab 连发不能在新聚焦控件里穿透成原生移焦。
  expect(down("Tab", { repeat: true }, target)).toBe(false);
  fireEvent.keyUp(target, { key: "Tab" });
  expect(mode()).toBe("compact");
  expect(screen.getByTestId("nature")).toHaveTextContent("cheerful");
  expect(onSave).not.toHaveBeenCalled();
});

test.each(["pointerdown", "focus"])("%s 只停止连撤，不结束 Tab 临时编辑", (reason) => {
  render(<Harness />);
  const interact = () => reason === "pointerdown"
    ? fireEvent.pointerDown(screen.getByLabelText("输入"))
    : fireEvent.focusIn(screen.getByLabelText("输入"));
  down("Tab"); tick(400); interact();
  down("Escape");
  expect(mode()).toBe("detailed");
  up("Tab"); expect(mode()).toBe("compact");
  down("z", { ctrlKey: true }); interact(); tick(1000);
  expect(steps()).toBe(4);
});

test("快速编辑也只临时切换，控件拦截 keyup 仍能收到 Tab 松键", () => {
  const onSave = vi.fn();
  render(<Harness onSave={onSave} />);
  down("Tab"); tick(100);
  const target = screen.getByLabelText("选择");
  fireEvent.pointerDown(target);
  fireEvent.change(target, { target: { value: "cheerful" } });
  target.addEventListener("keyup", event => event.stopPropagation());
  fireEvent.keyUp(target, { key: "Tab" });
  expect(mode()).toBe("compact");
  expect(screen.getByTestId("nature")).toHaveTextContent("cheerful");
  expect(onSave).not.toHaveBeenCalled();
});

test("从具体版临时切到精简版编辑也保持修改，不改变已保存模式", () => {
  const onSave = vi.fn();
  render(<Harness onSave={onSave} />);
  down("Tab"); up("Tab");
  expect(mode()).toBe("detailed");
  down("Tab"); tick(400);
  fireEvent.pointerDown(screen.getByLabelText("选择"));
  fireEvent.change(screen.getByLabelText("选择"), { target: { value: "cheerful" } });
  expect(mode()).toBe("compact");
  up("Tab");
  expect(mode()).toBe("detailed");
  expect(screen.getByTestId("nature")).toHaveTextContent("cheerful");
  expect(onSave).toHaveBeenCalledTimes(1);
});

test("弹层暂停新快捷键但保留已持有的 Tab，松开和卸载仍可清理", () => {
  const view = render(<Harness />);
  down("Tab"); tick(400); view.rerender(<Harness enabled={false} />);
  expect(mode()).toBe("detailed");
  up("Tab");
  expect(mode()).toBe("compact");
  expect(down("Tab")).toBe(true);
  down("z", { ctrlKey: true }); expect(steps()).toBe(5);
  view.rerender(<Harness />);
  down("z", { ctrlKey: true });
  view.unmount(); tick(2000);
  expect(vi.getTimerCount()).toBe(0);
});
