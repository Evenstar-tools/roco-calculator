import { useState } from "react";
import { createPortal } from "react-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { installInputSelection } from "../../src/input-selection.js";
import { PowerDraftInput } from "../../src/components/PowerDraftInput.jsx";

let dispose;
beforeEach(() => { dispose = installInputSelection(document); });
afterEach(() => { dispose(); });

function TextField({ type = "text", ...props }) {
  const [value, setValue] = useState("队伍 123");
  return <input aria-label="输入" type={type} value={value} onChange={event => setValue(event.target.value)} {...props} />;
}

describe("app-wide input selection", () => {
  test.each(["text", "search", "tel", "url", "password"])("first click selects %s, typing replaces, subsequent click keeps the caret", async type => {
    const user = userEvent.setup();
    render(<TextField type={type} />);
    const input = screen.getByLabelText("输入");
    await user.click(input);
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(input.value.length);
    await user.keyboard("新的");
    expect(input.value).toBe("新的");
    await user.click(input);
    expect(input.selectionStart).toBe(input.selectionEnd);
    input.blur();
    await user.click(input);
    expect(input.selectionEnd - input.selectionStart).toBe(2);
  });

  test("keyboard focus selects and lazy portal inputs are covered", async () => {
    const user = userEvent.setup();
    render(createPortal(<TextField />, document.body));
    await user.tab();
    const input = screen.getByLabelText("输入");
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(input.value.length);
  });

  test("number input selects without committing the power draft", async () => {
    const user = userEvent.setup();
    const commit = vi.fn();
    render(<PowerDraftInput ariaLabel="威力" value={180} onCommit={commit} />);
    const input = screen.getByRole("spinbutton");
    const select = vi.spyOn(input, "select");
    await user.click(input);
    expect(select).toHaveBeenCalledTimes(1);
    expect(commit).not.toHaveBeenCalled();
    await user.keyboard("{Enter}");
    expect(commit).toHaveBeenCalledWith(180);
  });

  test("drag selection and modified clicks are not overridden", () => {
    render(<TextField />);
    const input = screen.getByLabelText("输入");
    const select = vi.spyOn(input, "select");
    fireEvent(input, new MouseEvent("pointerdown", { bubbles: true, button: 0, clientX: 5, clientY: 5 }));
    input.focus();
    fireEvent(input, new MouseEvent("pointermove", { bubbles: true, clientX: 35, clientY: 5 }));
    input.setSelectionRange(1, 3);
    fireEvent.click(input, { detail: 1 });
    expect(select).not.toHaveBeenCalled();
    expect([input.selectionStart, input.selectionEnd]).toEqual([1, 3]);
    input.blur();
    fireEvent(input, new MouseEvent("pointerdown", { bubbles: true, button: 0, shiftKey: true }));
    input.focus();
    fireEvent.click(input, { detail: 1 });
    expect(select).not.toHaveBeenCalled();
  });

  test.each([
    { readOnly: true }, { disabled: true }, { "data-auto-select": "false" },
    { type: "checkbox" }, { type: "range" }, { type: "color", value: "#ffffff" },
  ])("non-editable and non-text controls stay unchanged: %j", async props => {
    const user = userEvent.setup();
    render(<input aria-label="保留" defaultValue="123" {...props} />);
    const input = screen.getByLabelText("保留");
    const select = vi.spyOn(input, "select");
    await user.click(input);
    expect(select).not.toHaveBeenCalled();
  });

  test("textarea, composition and disposed listeners keep native behavior", async () => {
    const user = userEvent.setup();
    render(<><textarea aria-label="长文本" defaultValue="多行文本" /><TextField /></>);
    const area = screen.getByLabelText("长文本");
    const areaSelect = vi.spyOn(area, "select");
    await user.click(area);
    expect(areaSelect).not.toHaveBeenCalled();
    const input = screen.getByLabelText("输入");
    const select = vi.spyOn(input, "select");
    fireEvent.compositionStart(input);
    await user.click(input);
    expect(select).not.toHaveBeenCalled();
    fireEvent.compositionEnd(input);
    input.blur();
    dispose();
    await user.click(input);
    expect(select).not.toHaveBeenCalled();
  });
});
