import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import AppHeader from "../src/components/AppHeader.jsx";
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

describe("miniapp shell", () => {
  test("uses a static startup indicator that does not block WeChat rendering", () => {
    const { container } = render(<LoadingState />);

    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(container.querySelector(".state-card__progress-fill"))
      .toBeInTheDocument();
  });

  test("publishes miniapp 1.1.1 against web core 1.6.2", () => {
    expect(MINIAPP_VERSION).toBe("1.1.1");
    expect(MINIAPP_UPDATE_DATE).toBe("2026-08-22");
    expect(WEB_CORE_VERSION).toBe("1.6.2");
    expect(MINIAPP_RELEASE_LABEL).toBe(
      "小程序 v1.1.1 · 网页核心 v1.6.2",
    );
    render(<AppHeader dataVersion="data-v1" />);
    expect(screen.getByText(MINIAPP_RELEASE_LABEL)).toBeInTheDocument();
  });

  test("renders the calculator title without requesting identity", () => {
    render(<IndexPage />);
    expect(screen.getByText("洛克计算器 · S3季中")).toBeInTheDocument();
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
    expect(quickUndoSwitch).toHaveAttribute("aria-checked", "false");
    fireEvent.click(quickUndoSwitch);
    expect(onQuickUndoChange).toHaveBeenCalledWith(true);
    expect(screen.getByText("常用精灵配置")).toBeInTheDocument();
    const importButton = screen.getByRole("button", {
      name: "导入PVP热门配置",
    });
    expect(importButton).toHaveTextContent("一键导入");
    fireEvent.click(importButton);
    expect(onImportCommonConfig).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "重置本页" }))
      .toBeInTheDocument();
    expect(screen.getByText("数据来源")).toBeInTheDocument();
    expect(screen.getByText(/BWIKI 洛克王国公开资料/u))
      .toBeInTheDocument();
    expect(screen.getByText(/1215583051/u)).toBeInTheDocument();
    expect(screen.getByText("当前版本")).toBeInTheDocument();
    expect(screen.getByText("v1.1.1 · 更新于 2026-08-22"))
      .toBeInTheDocument();
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
