import { useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { ProductAccessDialog } from "../../src/components/ProductAccessDialog.jsx";
import { ConfigLibraryDialog } from "../../src/components/ConfigLibraryDialog.jsx";

test.each(["获取应用", "配置库导入导出"])("%s preserves keyboard focus and restores the page on close", async (name) => {
  const user = userEvent.setup();
  function Example() {
    const [open, setOpen] = useState(false);
    return <>
      <button onClick={() => setOpen(true)}>打开弹窗</button>
      {name === "获取应用"
        ? <ProductAccessDialog open={open} onClose={() => setOpen(false)} />
        : <ConfigLibraryDialog mode={open ? "export" : null} exportSummary={{ exportedCount: 0 }} onClose={() => setOpen(false)} />}
      <button>背景操作</button>
    </>;
  }
  const previousOverflow = document.body.style.overflow;
  document.body.style.overflow = "scroll";
  try {
    render(<Example />);
    const trigger = screen.getByRole("button", { name: "打开弹窗" });
    await user.click(trigger);
    const dialog = screen.getByRole("dialog", { name });
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(document.body.style.overflow).toBe("hidden");
    for (let index = 0; index < 7; index += 1) {
      await user.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
    for (let index = 0; index < 7; index += 1) {
      await user.tab({ shift: true });
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
    if (name === "配置库导入导出") {
      expect(within(dialog).getByRole("button", { name: "导出", exact: true })).toBeDisabled();
    }
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(document.body.style.overflow).toBe("scroll");
  } finally {
    document.body.style.overflow = previousOverflow;
  }
});
