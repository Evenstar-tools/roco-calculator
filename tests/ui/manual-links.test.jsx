import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { DataSourceDialog } from "../../src/components/DataSourceDialog.jsx";
import { WhatsNewDialog } from "../../src/components/WhatsNewDialog.jsx";
import { USER_MANUAL_URL } from "../../src/data/product-links.js";

for (const Component of [DataSourceDialog, WhatsNewDialog]) {
  test(`${Component.name} opens the shared manual without closing the current dialog`, () => {
    const onClose = vi.fn();
    render(<Component open onClose={onClose} />);
    const link = screen.getByRole("link", { name: "查看使用说明书（飞书文档，新窗口打开）" });
    expect(link).toHaveAttribute("href", USER_MANUAL_URL);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    fireEvent.click(link);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeVisible();
  });
}

test("the update dialog retains its dismiss and team actions", () => {
  const onClose = vi.fn();
  const onOpenTeam = vi.fn();
  render(<WhatsNewDialog open onClose={onClose} onOpenTeam={onOpenTeam} />);
  fireEvent.click(screen.getByRole("button", { name: "打开队伍" }));
  expect(onOpenTeam).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button", { name: "知道了" }));
  expect(onClose).toHaveBeenCalledOnce();
});
