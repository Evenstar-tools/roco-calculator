import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { PowerDraftInput } from "../../src/components/PowerDraftInput.jsx";

describe("PowerDraftInput", () => {
  test("commits a multi-digit actual power only on Enter", async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    render(
      <PowerDraftInput
        ariaLabel="实际威力"
        mode="actual"
        onCommit={onCommit}
        value={80}
      />,
    );
    const input = screen.getByRole("spinbutton", { name: "实际威力" });

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
        ariaLabel="实际威力"
        isManual
        mode="actual"
        onClear={onClear}
        value={180}
      />,
    );
    const input = screen.getByRole("spinbutton", { name: "实际威力" });
    await user.clear(input);
    await user.tab();
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  test("rejects fractional panel power without changing calculation", async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    render(
      <PowerDraftInput
        ariaLabel="面板威力"
        mode="panel"
        onCommit={onCommit}
        value={281}
      />,
    );
    const input = screen.getByRole("spinbutton", { name: "面板威力" });
    await user.clear(input);
    await user.type(input, "87.5");
    await user.keyboard("{Enter}");

    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.getByText("面板威力只能填整数")).toBeVisible();
  });

  test("Escape abandons a draft and the recovery button clears a manual value", async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();
    render(
      <PowerDraftInput
        ariaLabel="实际威力"
        isManual
        mode="actual"
        onClear={onClear}
        value={90}
      />,
    );
    const input = screen.getByRole("spinbutton", { name: "实际威力" });
    await user.clear(input);
    await user.type(input, "123");
    await user.keyboard("{Escape}");
    expect(input).toHaveValue(90);

    await user.click(screen.getByRole("button", { name: "恢复自动威力" }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});
