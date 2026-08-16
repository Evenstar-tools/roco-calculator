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
      dataSource={{
        onClose: vi.fn(),
        onCopyFeedback: vi.fn(),
        open: false,
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

test("exposes a replayable first-run guide from the app menu", () => {
  const onFirstRunGuide = vi.fn();
  renderOverlays({
    menu: {
      actions: { onFirstRunGuide },
      buttonRef: { current: document.createElement("button") },
      open: true,
      ref: { current: null },
    },
  });

  fireEvent.click(screen.getByRole("button", { name: "新手引导" }));
  expect(onFirstRunGuide).toHaveBeenCalledOnce();
});

test("keeps the first-run guide with the lower utility actions", () => {
  renderOverlays();
  const buttons = screen
    .getAllByRole("button")
    .map((button) => button.textContent.trim());

  expect(buttons.indexOf("新手引导")).toBeGreaterThan(
    buttons.indexOf("分享当前配置"),
  );
  expect(buttons.indexOf("新手引导")).toBeLessThan(
    buttons.indexOf("显示设置"),
  );
});

test("shows data sources and exposes the feedback contact", () => {
  const onClose = vi.fn();
  const onCopyFeedback = vi.fn();
  renderOverlays({
    dataSource: { onClose, onCopyFeedback, open: true },
    menu: { actions: {}, open: false },
  });

  const dialog = screen.getByRole("dialog", { name: "数据来源" });
  expect(screen.getByRole("link", { name: /洛克王国：世界 BWIKI/ })).toHaveAttribute(
    "href",
    "https://wiki.biligame.com/rocom/",
  );
  expect(screen.getByText(/1215583051/)).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "复制反馈 QQ" }));
  expect(onCopyFeedback).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "关闭数据来源" }));
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(dialog).toBeVisible();
});

test("opens the complete release notes in a second-level dialog", () => {
  renderOverlays({
    dataSource: {
      onClose: vi.fn(),
      onCopyFeedback: vi.fn(),
      open: true,
    },
    menu: { actions: {}, open: false },
  });

  expect(screen.getByText("版本记录")).toBeVisible();
  expect(screen.getByText("威力显示与乘区校正")).toBeVisible();
  expect(screen.getByText("v1.5.7")).toBeVisible();
  expect(screen.queryByText("v1.5.3")).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "查看完整版本记录" }));
  expect(screen.getByRole("dialog", { name: "完整版本记录" })).toBeVisible();
  expect(screen.getByText("v1.5.4")).toBeVisible();
  expect(screen.getByText("v1.0.0")).toBeVisible();
  expect(
    screen.getByText("新增精灵防御端分析，分别显示自身弱点与抗性。"),
  ).toBeVisible();

  fireEvent.click(screen.getByRole("button", { name: "返回数据来源" }));
  expect(screen.getByRole("dialog", { name: "数据来源" })).toBeVisible();
  expect(screen.queryByText("v1.5.3")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "查看完整版本记录" })).toBeVisible();
});

test("opens display settings from the menu and exposes the type analysis switch", () => {
  const onShowDisplaySettings = vi.fn();
  const onPowerDisplayModeChange = vi.fn();
  const onTypeCoverageChange = vi.fn();
  const { rerender } = renderOverlays({
    menu: {
      actions: { onShowDisplaySettings },
      buttonRef: { current: document.createElement("button") },
      open: true,
      ref: { current: null },
    },
  });

  fireEvent.click(screen.getByRole("button", { name: "显示设置" }));
  expect(onShowDisplaySettings).toHaveBeenCalledOnce();

  rerender(
    <WorkspaceOverlays
      displaySettings={{
        onClose: vi.fn(),
        onPowerDisplayModeChange,
        onTypeCoverageChange,
        open: true,
        powerDisplayMode: "skill",
        typeCoverageEnabled: false,
      }}
      menu={{ actions: {}, open: false }}
      mobileResult={{ open: false }}
      share={{ pendingState: null }}
      team={{ open: false }}
      toast={{ message: "" }}
    >
      <main>工作区</main>
    </WorkspaceOverlays>,
  );

  const switchControl = screen.getByRole("checkbox", {
    name: "属性克制与打击面",
  });
  expect(switchControl).not.toBeChecked();
  fireEvent.click(switchControl);
  expect(onTypeCoverageChange).toHaveBeenCalledWith(true);

  expect(screen.getByRole("button", { name: "技能威力" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  fireEvent.click(screen.getByRole("button", { name: "面板威力" }));
  expect(onPowerDisplayModeChange).toHaveBeenCalledWith("panel");
});
