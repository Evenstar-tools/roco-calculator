import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";

const loading = vi.hoisted(() => ({ team: vi.fn(), fail: false }));
vi.mock("../../src/components/TeamDrawer.jsx", async () => {
  const { useState } = await import("react");
  loading.team();
  return { TeamDrawer: function TeamDrawer({ open, onClose }) {
    const [draft, setDraft] = useState("默认队伍");
    if (loading.fail) throw new Error("team render failed");
    return open ? <section aria-label="测试队伍"><input aria-label="队伍临时状态" value={draft} onChange={event => setDraft(event.target.value)} /><button onClick={onClose}>关闭测试队伍</button></section> : null;
  } };
});

test("team code loads on first use and closing/reopening preserves the mounted drawer state", async () => {
  const { WorkspaceOverlays } = await import("../../src/components/WorkspaceOverlays.jsx");
  const onClose = vi.fn();
  const view = (open) => <WorkspaceOverlays menu={{}} mobileResult={{}} share={{}}
    team={{ open, drawerProps: { onClose } }} toast={{}} />;
  const { rerender } = render(view(false));
  expect(loading.team).not.toHaveBeenCalled();
  rerender(view(true));
  const input = await screen.findByRole("textbox", { name: "队伍临时状态" });
  expect(input).toHaveValue("默认队伍");
  fireEvent.change(input, { target: { value: "保留本次选择" } });
  fireEvent.click(screen.getByRole("button", { name: "关闭测试队伍" }));
  expect(onClose).toHaveBeenCalledOnce();
  rerender(view(false));
  expect(screen.queryByRole("textbox", { name: "队伍临时状态" })).toBeNull();
  rerender(view(true));
  expect(await screen.findByRole("textbox", { name: "队伍临时状态" })).toHaveValue("保留本次选择");
  expect(loading.team).toHaveBeenCalledOnce();
});

test("closing the drawer hides its error boundary and reopening can recover", async () => {
  const { WorkspaceOverlays } = await import("../../src/components/WorkspaceOverlays.jsx");
  const onClose = vi.fn();
  const view = (open) => <WorkspaceOverlays menu={{}} mobileResult={{}} share={{}}
    team={{ open, drawerProps: { onClose } }} toast={{}} />;
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  loading.fail = true;
  try {
    const { rerender } = render(view(true));
    await screen.findByRole("alert");
    rerender(view(false));
    expect(screen.queryByRole("alert")).toBeNull();
    rerender(view(true));
    loading.fail = false;
    fireEvent.click(screen.getByRole("button", { name: "关闭", exact: true }));
    expect(onClose).toHaveBeenCalledOnce();
    rerender(view(false));
    rerender(view(true));
    expect(await screen.findByRole("textbox", { name: "队伍临时状态" })).toHaveValue("默认队伍");
  } finally {
    loading.fail = false;
    log.mockRestore();
  }
});
