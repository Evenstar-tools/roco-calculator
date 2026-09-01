import { fireEvent, render, screen, within } from "@testing-library/react";
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
      productAccess={{ onClose: vi.fn(), open: false }}
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
  expect(screen.getByRole("button", { name: "常用精灵配置" }))
    .toHaveTextContent("213");
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

test("puts clear first and hides cleanup and sharing from the web menu", () => {
  renderOverlays();
  const menu = screen.getByRole("navigation", { name: "应用菜单" });
  const buttons = within(menu)
    .getAllByRole("button")
    .map((button) => button.textContent.trim());

  expect(buttons[0]).toBe("清除当前页配置");
  expect(buttons).not.toContain("清理未完成配置");
  expect(buttons).not.toContain("分享当前配置");
  expect(buttons.indexOf("新手引导")).toBeLessThan(buttons.indexOf("显示设置"));
});

test("opens application access and about from the lower utility menu", () => {
  const onShowProductAccess = vi.fn();
  const onShowDataSource = vi.fn();
  renderOverlays({
    menu: {
      actions: { onShowDataSource, onShowProductAccess },
      buttonRef: { current: document.createElement("button") },
      open: true,
      ref: { current: null },
    },
  });

  fireEvent.click(screen.getByRole("button", { name: "获取应用" }));
  expect(onShowProductAccess).toHaveBeenCalledOnce();

  fireEvent.click(screen.getByRole("button", { name: "关于与来源" }));
  expect(onShowDataSource).toHaveBeenCalledOnce();
});

test("shows desktop downloads and the mini program code", () => {
  renderOverlays({
    menu: { actions: {}, open: false },
    productAccess: { onClose: vi.fn(), open: true },
  });

  expect(screen.getByRole("dialog", { name: "获取应用" })).toBeVisible();
  expect(screen.getByRole("link", { name: "GitHub 发布页" }))
    .toHaveAttribute(
      "href",
      "https://github.com/Evenstar-tools/roco-calculator",
    );
  expect(screen.getByRole("link", { name: "获取 Windows 电脑版" }))
    .toHaveAttribute(
      "href",
      "https://github.com/Evenstar-tools/roco-calculator/releases/latest",
    );
  expect(screen.getByRole("img", { name: "洛克计算器微信小程序码" }))
    .toHaveAttribute("src", "/assets/downloads/wechat-miniapp-code.jpg");
  expect(screen.queryByText(/安装包.*未签名/)).not.toBeInTheDocument();
});

test("hides permission errors from the configuration export dialog", () => {
  renderOverlays({
    configLibrary: {
      error: "Permission denied",
      exportSummary: { exportedCount: 213, library: { entries: [] } },
      mode: "export",
      onClose: vi.fn(),
      snapshot: { skills: [], spirits: [] },
    },
  });

  expect(screen.getByRole("dialog", { name: "配置库导出" })).toBeVisible();
  expect(screen.queryByText(/permission denied/i)).not.toBeInTheDocument();
});

test("hides permission errors from global web notices", () => {
  renderOverlays({ toast: { message: "Permission denied" } });

  expect(screen.queryByText(/permission denied/i)).not.toBeInTheDocument();
});

test("keeps QQ on the first level and moves other feedback contacts deeper", () => {
  const onClose = vi.fn();
  const onCopyFeedback = vi.fn();
  renderOverlays({
    dataSource: { onClose, onCopyFeedback, open: true },
    menu: { actions: {}, open: false },
  });

  expect(screen.getByRole("dialog", { name: "关于与来源" })).toBeVisible();
  expect(screen.getByRole("link", { name: /洛克王国：世界 BWIKI/ })).toHaveAttribute(
    "href",
    "https://wiki.biligame.com/rocom/",
  );
  expect(screen.getByText("QQ 1215583051")).toBeVisible();
  expect(screen.queryByRole("link", { name: "诛仙剑下伤心花" }))
    .not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "1215583051@qq.com" }))
    .not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "复制反馈 QQ" }));
  expect(onCopyFeedback).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button", { name: "查看问题反馈" }));
  expect(screen.getByRole("dialog", { name: "问题反馈" })).toBeVisible();
  expect(screen.getByRole("link", { name: "诛仙剑下伤心花" })).toHaveAttribute(
    "href",
    "https://space.bilibili.com/9281359?spm_id_from=333.1007.0.0",
  );
  expect(screen.getByRole("link", { name: "1215583051@qq.com" }))
    .toHaveAttribute("href", "mailto:1215583051@qq.com");
  fireEvent.click(screen.getByRole("button", { name: "返回关于与来源" }));
  fireEvent.click(screen.getByRole("button", { name: "查看免责声明" }));
  expect(screen.getByRole("dialog", { name: "免责声明" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "返回关于与来源" }));
  fireEvent.click(screen.getByRole("button", { name: "关闭关于与来源" }));
  expect(onClose).toHaveBeenCalledTimes(1);
});

test("puts the current release first and removes the rule validation card", () => {
  renderOverlays({
    dataSource: { onClose: vi.fn(), onCopyFeedback: vi.fn(), open: true },
    menu: { actions: {}, open: false },
  });

  const history = screen.getByRole("region", { name: "版本记录" });
  const source = screen.getByRole("link", { name: /洛克王国：世界 BWIKI/ });
  expect(
    history.compareDocumentPosition(source) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(screen.queryByText("规则校验")).not.toBeInTheDocument();
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
  expect(screen.getByText("计算取整修复")).toBeVisible();
  expect(screen.getByText("v1.6.5")).toBeVisible();
  expect(
    screen.getByText("有效技能威力完成百分比加成后先向下取整，再进入伤害公式。"),
  ).toBeVisible();
  expect(
    screen.getByText(
      "岚鸟→龙鱼案例：55×1.5=82.5→向下取整82，20054÷170=117.96→向下取整117。",
    ),
  ).toBeVisible();
  expect(screen.queryByText(/小程序技能栏|技能图标|窄屏/)).not.toBeInTheDocument();
  expect(screen.queryByText(/陨星虫配置中已失效/)).not.toBeInTheDocument();
  expect(screen.queryByText("v1.5.3")).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "查看完整版本记录" }));
  expect(screen.getByRole("dialog", { name: "完整版本记录" })).toBeVisible();
  expect(screen.getByText(/陨星虫配置中已失效/)).toBeVisible();
  expect(screen.getByText("v1.6.2")).toBeVisible();
  expect(screen.getByText("v1.5.4")).toBeVisible();
  expect(screen.getByText("v1.0.0")).toBeVisible();
  expect(
    screen.getByText("新增精灵防御端分析，分别显示自身弱点与抗性。"),
  ).toBeVisible();

  fireEvent.click(screen.getByRole("button", { name: "返回关于与来源" }));
  expect(screen.getByRole("dialog", { name: "关于与来源" })).toBeVisible();
  expect(screen.queryByText("v1.5.3")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "查看完整版本记录" })).toBeVisible();
});

test("opens display settings from the menu and exposes the type analysis switch", () => {
  const onShowDisplaySettings = vi.fn();
  const onPowerDisplayModeChange = vi.fn();
  const onNegativeStatusSettlementChange = vi.fn();
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
        negativeStatusSettlementEnabled: false,
        onNegativeStatusSettlementChange,
        onPowerDisplayModeChange,
        onTypeCoverageChange,
        open: true,
        powerDisplayMode: "static",
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

  const statusSwitch = screen.getByRole("checkbox", {
    name: "负面状态结算",
  });
  expect(statusSwitch).not.toBeChecked();
  fireEvent.click(statusSwitch);
  expect(onNegativeStatusSettlementChange).toHaveBeenCalledWith(true);

  expect(screen.getByRole("button", { name: "静态威力" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  fireEvent.click(screen.getByRole("button", { name: "显示威力" }));
  expect(onPowerDisplayModeChange).toHaveBeenCalledWith("panel");
});
