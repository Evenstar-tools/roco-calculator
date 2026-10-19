import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import AppHeader from "../src/components/AppHeader.jsx";
import SeasonBackdrop from "../src/components/SeasonBackdrop.jsx";
import MarkEditor from "../src/components/MarkEditor.jsx";
import TraitConditionEditor from "../src/components/TraitConditionEditor.jsx";
import IndexPage from "../src/pages/index/index.jsx";
import LoadingState from "../src/components/LoadingState.jsx";
import {
  MINIAPP_RELEASE_LABEL,
  MINIAPP_UPDATE_DATE,
  MINIAPP_VERSION,
  WEB_CORE_VERSION,
} from "../src/version.js";
import miniappPackage from "../package.json";
import { readSeasonTheme, SEASON_THEME_STORAGE_KEY, writeSeasonTheme } from "../src/state/season-theme.js";

describe("miniapp shell", () => {
  test.each([[0, "s1"], [0.25, "s2"], [0.5, "s3"], [0.99999, "s4"]])("random theme draw %s persists the mode, not %s", (random, id) => {
    const values = new Map();
    const storage = { get: (key) => values.get(key), set: (key, value) => values.set(key, value) };
    expect(readSeasonTheme(storage)).toEqual({ preference: "s4", id: "s4" });
    expect(writeSeasonTheme("random", storage, () => random)).toEqual({ preference: "random", id });
    expect(values.get(SEASON_THEME_STORAGE_KEY)).toBe("random");
    expect(readSeasonTheme(storage, () => random)).toEqual({ preference: "random", id });
    expect(writeSeasonTheme(id, storage)).toEqual({ preference: id, id });
    expect(readSeasonTheme(storage)).toEqual({ preference: id, id });
  });

  test("invalid or blocked theme storage restores S4 without blocking the current page", () => {
    expect(readSeasonTheme({ get: () => "s5" })).toEqual({ preference: "s4", id: "s4" });
    const blocked = { get: () => { throw new Error("blocked"); }, set: () => { throw new Error("blocked"); } };
    expect(readSeasonTheme(blocked)).toEqual({ preference: "s4", id: "s4" });
    expect(writeSeasonTheme("s2", blocked)).toEqual({ preference: "s2", id: "s2" });
    expect(writeSeasonTheme("random", blocked, () => 0)).toEqual({ preference: "random", id: "s1" });
  });

  test.each(["s1", "s2", "s3"])("%s backdrop uses only its local decorative scene and never changes the data title", (seasonId) => {
    const { container } = render(<><SeasonBackdrop seasonId={seasonId} /><AppHeader /></>);
    const background = container.querySelector(`.season-sky--${seasonId}`);
    expect(background).toHaveAttribute("aria-hidden", "true");
    expect(background.querySelectorAll("img")).toHaveLength(1);
    expect(background.querySelector("img").getAttribute("src")).toContain(`/assets/season/${seasonId}-`);
    expect(background.querySelector(".season-sky__wolf")).toBeNull();
    expect(container.querySelector(".app-header__title")).toHaveTextContent("洛克计算器 · S4「季中」");
  });

  test("native theme picker can fix the same drawn season and the shuffle control remains a separate button", () => {
    const change = vi.fn();
    const ui = (preference = "s4", id = "s4") => <AppHeader seasonTheme={{ preference, id }} onSeasonThemeChange={change} />;
    const view = render(ui());
    fireEvent.click(screen.getByRole("button", { name: "打开设置" }));
    const picker = screen.getByRole("combobox", { name: "赛季主题" });
    expect(picker).toHaveValue("3");
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual(["S1 暗夜拾光", "S2 狂欢怪谈", "S3 铅字幻梦", "S4 月涌狂想"]);
    const shuffle = screen.getByRole("button", { name: "每次进入随机主题" });
    expect(shuffle).toHaveAttribute("aria-pressed", "false");
    expect(shuffle.querySelector("img")).toHaveAttribute("src", expect.stringContaining("shuffle.png"));
    fireEvent.click(shuffle);
    expect(change).toHaveBeenLastCalledWith("random");
    view.rerender(ui("random", "s3"));
    expect(picker).toHaveValue("0");
    expect(picker.options[0]).toHaveTextContent("随机 · S3");
    expect(shuffle).toHaveAttribute("aria-pressed", "true");
    fireEvent.change(picker, { target: { value: "3" } });
    expect(change).toHaveBeenLastCalledWith("s3");
    view.rerender(ui("s3", "s3"));
    expect(picker).toHaveValue("2");
    expect(shuffle).toHaveAttribute("aria-pressed", "false");
  });

  test("registers native sharing for the page hook", async () => {
    vi.stubGlobal("definePageConfig", (config) => config);
    try {
      const { default: config } = await import("../src/pages/index/index.config.js");
      expect(config.enableShareAppMessage).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  test("ranking entrances use the menu row anatomy and close settings before navigation", () => {
    const onOpenRanking = vi.fn();
    render(<AppHeader onOpenRanking={onOpenRanking} />);
    for (const [kind, label] of [["speed", "速度线排行"], ["durability", "耐久排行"]]) {
      fireEvent.click(screen.getByRole("button", { name: "打开设置" }));
      const entry = screen.getByRole("button", { name: label });
      expect(entry.querySelector(".settings-sheet__copy .settings-sheet__label")).toHaveTextContent(label);
      expect(entry.querySelector(".settings-sheet__description")).not.toBeEmptyDOMElement();
      expect(entry.querySelector(".settings-sheet__entry-icon")).toHaveAttribute("mode", "aspectFit");
      fireEvent.click(entry);
      expect(onOpenRanking).toHaveBeenLastCalledWith(kind);
      expect(screen.queryByRole("dialog", { name: "设置" })).not.toBeInTheDocument();
    }
  });

  test("keeps the seasonal background decorative and settings interactive", () => {
    const { container } = render(<><SeasonBackdrop /><AppHeader /></>);
    const background = container.querySelector(".season-sky");
    expect(background).toHaveAttribute("aria-hidden", "true");
    expect(background.querySelectorAll("img")).toHaveLength(2);
    for (const image of background.querySelectorAll("img")) {
      expect(image).toHaveAttribute("alt", "");
      expect(image.getAttribute("src")).toMatch(/assets\/season\/s4-.+\.webp/u);
    }
    expect(screen.queryAllByRole("img")).toHaveLength(0);
    expect(container.querySelector(".app-header__title")).toHaveTextContent("洛克计算器 · S4「季中」");
    fireEvent.click(screen.getByRole("button", { name: "打开设置" }));
    expect(screen.getByRole("dialog", { name: "设置" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "关闭设置" }));
    expect(screen.queryByRole("dialog", { name: "设置" })).not.toBeInTheDocument();
  });

  test("uses a static startup indicator that does not block WeChat rendering", () => {
    const { container } = render(<LoadingState />);

    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(container.querySelector(".state-card__progress-fill"))
      .toBeInTheDocument();
  });

  test("publishes the declared miniapp version against its web core", () => {
    expect(MINIAPP_VERSION).toBe(miniappPackage.version);
    expect(MINIAPP_UPDATE_DATE).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
    expect(WEB_CORE_VERSION).toMatch(/^\d+\.\d+\.\d+$/u);
    expect(MINIAPP_RELEASE_LABEL).toBe(
      `小程序 v${MINIAPP_VERSION} · 网页核心 v${WEB_CORE_VERSION}`,
    );
    render(<AppHeader dataVersion="data-v1" />);
    expect(screen.queryByText(MINIAPP_RELEASE_LABEL)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "打开设置" }));
    expect(screen.getByText(MINIAPP_RELEASE_LABEL)).toBeInTheDocument();
    expect(screen.getByText("数据快照：data-v1")).toBeInTheDocument();
  });

  test("renders the calculator title without requesting identity", () => {
    render(<IndexPage />);
    expect(screen.getByText("洛克计算器 · S4「季中」")).toBeInTheDocument();
    expect(screen.queryByText("微信登录")).not.toBeInTheDocument();
  });

  test("exposes compact settings actions, common configs and data attribution", () => {
    const onImportCommonConfig = vi.fn();
    const onNegativeStatusChange = vi.fn();
    const onQuickUndoChange = vi.fn();
    const onTypeAnalysisChange = vi.fn();
    const onTeamAnalysisChange = vi.fn();
    render(
      <AppHeader
        commonConfigCount={0}
        commonConfigStatus="available"
        dataVersion="data-v1"
        memoryEnabled
        onImportCommonConfig={onImportCommonConfig}
        onMemoryChange={vi.fn()}
        onNegativeStatusChange={onNegativeStatusChange}
        onQuickUndoChange={onQuickUndoChange}
        onReset={vi.fn()}
        onTypeAnalysisChange={onTypeAnalysisChange}
        onTeamAnalysisChange={onTeamAnalysisChange}
        teamAnalysisEnabled={false}
        typeAnalysisEnabled
      />,
    );

    expect(screen.queryByText(/配置\s*\d+/u)).not.toBeInTheDocument();
    const settings = screen.getByRole("button", { name: "打开设置" });
    fireEvent.click(settings);
    expect(settings).toHaveAttribute("aria-expanded", "true");
    const dialog = screen.getByRole("dialog", { name: "设置" });
    expect(dialog).toBeInTheDocument();
    expect(dialog.querySelector(".settings-sheet__body"))
      .toHaveAttribute("data-scroll-y", "true");
    expect(screen.getByRole("switch", { name: "配置记忆" }))
      .toHaveAttribute("aria-checked", "true");
    const typeAnalysisSwitch = screen.getByRole("switch", {
      name: "属性克制与打击面",
    });
    expect(typeAnalysisSwitch).toHaveAttribute("aria-checked", "true");
    fireEvent.click(typeAnalysisSwitch);
    expect(onTypeAnalysisChange).toHaveBeenCalledWith(false);
    const teamAnalysisSwitch = screen.getByRole("switch", {
      name: "队伍防守面分析",
    });
    expect(teamAnalysisSwitch).toHaveAttribute("aria-checked", "false");
    fireEvent.click(teamAnalysisSwitch);
    expect(onTeamAnalysisChange).toHaveBeenCalledWith(true);
    const negativeStatusSwitch = screen.getByRole("switch", {
      name: "负面状态结算",
    });
    expect(negativeStatusSwitch).toHaveAttribute("aria-checked", "false");
    fireEvent.click(negativeStatusSwitch);
    expect(onNegativeStatusChange).toHaveBeenCalledWith(true);
    const quickUndoSwitch = screen.getByRole("switch", { name: "快捷撤回" });
    expect(quickUndoSwitch).toHaveAttribute("aria-checked", "true");
    fireEvent.click(quickUndoSwitch);
    expect(onQuickUndoChange).toHaveBeenCalledWith(false);
    expect(screen.getByText("常用精灵配置")).toBeInTheDocument();
    const importButton = screen.getByRole("button", {
      name: "导入PVP热门配置",
    });
    expect(importButton).toHaveTextContent("一键导入");
    fireEvent.click(importButton);
    expect(onImportCommonConfig).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "重置本页" }))
      .toBeInTheDocument();
    const settingsText = dialog.textContent;
    expect(settingsText.indexOf("重置本页"))
      .toBeLessThan(settingsText.indexOf("常用精灵配置"));
    expect(dialog.querySelector(".settings-sheet__body-content").firstElementChild)
      .toHaveTextContent("查询工具");
    expect(within(dialog).getByRole("button", { name: "耐久排行" })).toBeEnabled();
    expect(within(dialog).getByRole("button", { name: "速度线排行" })).toBeEnabled();
    expect(settingsText.indexOf("重置本页"))
      .toBeLessThan(settingsText.indexOf("数据来源"));
    expect(screen.getByText("数据来源")).toBeInTheDocument();
    expect(screen.getByText(/BWIKI 洛克王国公开资料/u))
      .toBeInTheDocument();
    expect(screen.getByText(/1215583051/u)).toBeInTheDocument();
    expect(screen.getByText("当前版本")).toBeInTheDocument();
    expect(screen.getByText(MINIAPP_RELEASE_LABEL)).toBeInTheDocument();
    expect(
      screen.getByText(`更新于 ${MINIAPP_UPDATE_DATE}`),
    ).toBeInTheDocument();
  });

  test("disables the common configuration action after the bundled version is installed", () => {
    const onImportCommonConfig = vi.fn();
    render(
      <AppHeader
        commonConfigCount={213}
        commonConfigStatus="current"
        dataVersion="data-v1"
        onImportCommonConfig={onImportCommonConfig}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "打开设置" }));
    const updatedButton = screen.getByRole("button", {
      name: "PVP热门配置已更新",
    });
    expect(updatedButton).toBeDisabled();
    expect(updatedButton).toHaveTextContent("已更新");
    expect(updatedButton).toHaveTextContent("当前 213 只");
    fireEvent.click(updatedButton);
    expect(onImportCommonConfig).not.toHaveBeenCalled();
  });

  test("mounts portrait touch-target classes on real controls", () => {
    const { unmount } = render(
      <TraitConditionEditor
        onChange={vi.fn()}
        values={{ attacker: {} }}
        views={{
          attacker: {
            automaticStack: null,
            controls: [{
              canonicalKey: "trait.activation",
              defaultValue: false,
              id: "trait.activation",
              label: "满足触发条件",
              type: "boolean",
            }],
            description: "测试说明",
            name: "测试特性",
            ownerSide: "attacker",
          },
        }}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "展开特性与状态" }),
    );
    expect(
      screen.getByRole("button", { name: "满足触发条件" }),
    ).toHaveClass("trait-editor__control");
    unmount();

    const markRender = render(
      <MarkEditor
        marks={{
          negative: { id: null, stacks: 0 },
          positive: { id: null, stacks: 0 },
        }}
        onChange={vi.fn()}
        side="attacker"
      />,
    );
    expect(
      screen.getByRole("button", { name: "攻击方正面印记无" }),
    ).toHaveClass("mark-editor__control");
    markRender.unmount();

  });
});
