import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { WorkspaceOverlays } from "../../src/components/WorkspaceOverlays.jsx";

function renderOverlays(overrides = {}) {
  const onMenuClose = vi.fn();
  const menuButtonRef = { current: document.createElement("button") };
  document.body.append(menuButtonRef.current);
  const result = render(
    <WorkspaceOverlays
      menu={{
        actions: {
          onClose: onMenuClose,
          onImport: vi.fn(),
          onInstall: vi.fn(),
          onReset: vi.fn(),
          onShare: vi.fn(),
          onShowData: vi.fn(),
          onShowSeason: vi.fn(),
        },
        buttonRef: menuButtonRef,
        open: true,
        ref: { current: null },
      }}
      mobileResult={{ open: false }}
      share={{ importOpen: false, pendingState: null, shareLink: "" }}
      team={{ open: false }}
      toast={{ message: "" }}
      {...overrides}
    >
      <main>工作区</main>
    </WorkspaceOverlays>,
  );
  return { ...result, menuButtonRef, onMenuClose };
}

test("keeps menu before workspace and closes it with Escape", () => {
  const { menuButtonRef, onMenuClose } = renderOverlays();

  expect(screen.getByRole("navigation", { name: "应用菜单" })).toBeTruthy();
  expect(screen.getByText("工作区").previousElementSibling).toHaveAttribute(
    "aria-label",
    "应用菜单",
  );
  fireEvent.keyDown(document, { key: "Escape" });
  expect(onMenuClose).toHaveBeenCalledTimes(1);
  expect(document.activeElement).toBe(menuButtonRef.current);
});
