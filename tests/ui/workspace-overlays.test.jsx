import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { WorkspaceOverlays } from "../../src/components/WorkspaceOverlays.jsx";
import {
  FEATURED_USER_RELEASE,
  USER_RELEASE_NOTES,
} from "../../src/data/user-release-notes.js";

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

test("exposes a replayable whats-new dialog from the app menu", () => {
  const onShowWhatsNew = vi.fn();
  renderOverlays({
    menu: {
      actions: { onShowWhatsNew },
      buttonRef: { current: document.createElement("button") },
      open: true,
      ref: { current: null },
    },
    whatsNew: { open: false, version: FEATURED_USER_RELEASE.version },
  });

  fireEvent.click(
    screen.getByRole("button", { name: `新功能 ${FEATURED_USER_RELEASE.version}` }),
  );
  expect(onShowWhatsNew).toHaveBeenCalledOnce();
});

test("introduces the current release and opens the team workspace", () => {
  const onClose = vi.fn();
  const onOpenTeam = vi.fn();
  renderOverlays({
    menu: { actions: {}, open: false },
    whatsNew: {
      onClose,
      onOpenTeam,
      open: true,
      release: FEATURED_USER_RELEASE,
      version: FEATURED_USER_RELEASE.version,
    },
  });

  const dialog = screen.getByRole("dialog", { name: "新功能介绍" });
  expect(within(dialog).getByText("配队前，先把能力值算清楚")).toBeVisible();
  expect(within(dialog).getByText("耐久方案")).toBeVisible();
  expect(within(dialog).getByText("标准耐久榜")).toBeVisible();
  expect(within(dialog).getByText("速度线")).toBeVisible();
  fireEvent.click(within(dialog).getByRole("button", { name: "打开队伍" }));
  expect(onOpenTeam).toHaveBeenCalledOnce();
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

  const [latestRelease, ...previousReleases] = USER_RELEASE_NOTES;
  const oldestRelease = previousReleases.at(-1);

  expect(screen.getByText("版本记录")).toBeVisible();
  expect(screen.getByText(latestRelease.title)).toBeVisible();
  expect(screen.getByText(latestRelease.version)).toBeVisible();
  for (const highlight of latestRelease.summaryHighlights) {
    expect(screen.getByText(highlight)).toBeVisible();
  }
  for (const release of previousReleases) {
    expect(screen.queryByText(release.version)).not.toBeInTheDocument();
  }
  expect(screen.queryByText(oldestRelease.highlights[0])).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "查看完整版本记录" }));
  expect(screen.getByRole("dialog", { name: "完整版本记录" })).toBeVisible();
  expect(screen.getAllByText("新增功能").length).toBeGreaterThan(0);
  expect(screen.getAllByText("修复与优化").length).toBeGreaterThan(0);
  expect(screen.queryByText("前瞻内容")).not.toBeInTheDocument();
  expect(screen.queryByText("规则适配")).not.toBeInTheDocument();
  for (const release of USER_RELEASE_NOTES) {
    expect(screen.getByText(release.version)).toBeVisible();
  }
  expect(screen.getByText(oldestRelease.highlights[0])).toBeVisible();

  fireEvent.click(screen.getByRole("button", { name: "返回关于与来源" }));
  expect(screen.getByRole("dialog", { name: "关于与来源" })).toBeVisible();
  expect(screen.queryByText(oldestRelease.version)).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "查看完整版本记录" })).toBeVisible();
});

test("opens display settings from the menu and exposes the type analysis switch", () => {
  const onShowDisplaySettings = vi.fn();
  const onPowerDisplayModeChange = vi.fn();
  const onDurabilityOverviewChange = vi.fn();
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
        durabilityOverviewEnabled: false,
        onClose: vi.fn(),
        negativeStatusSettlementEnabled: false,
        onNegativeStatusSettlementChange,
        onDurabilityOverviewChange,
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

  const durabilitySwitch = screen.getByRole("checkbox", {
    name: "显示面板耐久",
  });
  expect(durabilitySwitch).not.toBeChecked();
  fireEvent.click(durabilitySwitch);
  expect(onDurabilityOverviewChange).toHaveBeenCalledWith(true);

  expect(screen.getByRole("button", { name: "静态威力" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  fireEvent.click(screen.getByRole("button", { name: "显示威力" }));
  expect(onPowerDisplayModeChange).toHaveBeenCalledWith("panel");
});
