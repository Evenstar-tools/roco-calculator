import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, test, vi } from "vitest";
import { PowerDraftInput } from "../../src/components/PowerDraftInput.jsx";

describe("PowerDraftInput", () => {
  test("commits a multi-digit static power only on Enter", async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    render(
      <PowerDraftInput
        ariaLabel="静态威力"
        mode="static"
        onCommit={onCommit}
        value={80}
      />,
    );
    const input = screen.getByRole("spinbutton", { name: "静态威力" });

    await user.clear(input);
    await user.type(input, "180");
    expect(onCommit).not.toHaveBeenCalled();
    await user.keyboard("{Enter}");
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(180);
  });

  test("clearing and blurring restores automatic power", async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();
    render(
      <PowerDraftInput
        ariaLabel="静态威力"
        isManual
        mode="static"
        onClear={onClear}
        value={180}
      />,
    );
    const input = screen.getByRole("spinbutton", { name: "静态威力" });
    await user.clear(input);
    await user.tab();
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  test("rejects fractional panel power without changing calculation", async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    render(
      <PowerDraftInput
        ariaLabel="显示威力"
        mode="panel"
        onCommit={onCommit}
        value={281}
      />,
    );
    const input = screen.getByRole("spinbutton", { name: "显示威力" });
    await user.clear(input);
    await user.type(input, "87.5");
    await user.keyboard("{Enter}");

    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.getByText("显示威力只能填整数")).toBeVisible();
  });

  test("显示威力超出范围时使用统一名称提示", async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    render(
      <PowerDraftInput
        ariaLabel="显示威力"
        mode="panel"
        onCommit={onCommit}
        value={281}
      />,
    );
    const input = screen.getByRole("spinbutton", { name: "显示威力" });
    await user.clear(input);
    await user.type(input, "10000");
    await user.keyboard("{Enter}");

    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.getByText("请输入 0–9999 的显示威力")).toBeVisible();
  });

  test("rejects fractional static power without changing calculation", async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    render(
      <PowerDraftInput
        ariaLabel="静态威力"
        mode="static"
        onCommit={onCommit}
        value={80}
      />,
    );
    const input = screen.getByRole("spinbutton", { name: "静态威力" });
    await user.clear(input);
    await user.type(input, "87.5");
    await user.keyboard("{Enter}");

    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.getByText("静态威力只能填整数")).toBeVisible();
  });

  test("Escape abandons a draft and the recovery button clears a manual value", async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();
    render(
      <PowerDraftInput
        ariaLabel="静态威力"
        isManual
        mode="static"
        onClear={onClear}
        value={90}
      />,
    );
    const input = screen.getByRole("spinbutton", { name: "静态威力" });
    await user.clear(input);
    await user.type(input, "123");
    await user.keyboard("{Escape}");
    expect(input).toHaveValue(90);

    await user.click(screen.getByRole("button", { name: "恢复自动威力" }));
    expect(onClear).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("自动")).not.toBeInTheDocument();
  });

  test("恢复自动威力后点击邻近条件，不会再次保存自动值为手动威力", async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();

    function SkillControls() {
      const [manualPower, setManualPower] = useState(null);
      const [counterState, setCounterState] = useState(false);
      return (
        <>
          <PowerDraftInput
            ariaLabel="静态威力"
            isManual={manualPower !== null}
            mode="static"
            onClear={() => setManualPower(null)}
            onCommit={(value) => {
              onCommit(value);
              setManualPower(value);
            }}
            value={manualPower ?? 95}
          />
          <label>
            <input
              checked={counterState}
              onChange={(event) => setCounterState(event.target.checked)}
              type="checkbox"
            />
            应对状态
          </label>
        </>
      );
    }

    render(<SkillControls />);
    const powerInput = screen.getByRole("spinbutton", { name: "静态威力" });
    await user.clear(powerInput);
    await user.type(powerInput, "100");
    await user.keyboard("{Enter}");
    expect(onCommit).toHaveBeenLastCalledWith(100);

    await user.click(screen.getByRole("button", { name: "恢复自动威力" }));
    expect(powerInput).toHaveValue(95);
    expect(screen.queryByRole("button", { name: "恢复自动威力" })).not.toBeInTheDocument();
    onCommit.mockClear();

    await user.click(screen.getByRole("checkbox", { name: "应对状态" }));
    expect(screen.getByRole("checkbox", { name: "应对状态" })).toBeChecked();
    expect(onCommit).not.toHaveBeenCalled();
    expect(powerInput).toHaveValue(95);
    expect(screen.queryByRole("button", { name: "恢复自动威力" })).not.toBeInTheDocument();
  });
});
