import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { ConfigLibraryDialog } from "../../src/components/ConfigLibraryDialog.jsx";

test("shows export counts and disables export when no configured favorites exist", () => {
  const { rerender } = render(
    <ConfigLibraryDialog
      exportSummary={{ exportedCount: 0, skippedUnconfiguredCount: 2 }}
      mode="export"
      onClose={vi.fn()}
    />,
  );

  expect(screen.getByText("可导出 0 只精灵")).toBeVisible();
  expect(screen.getByText("跳过").nextElementSibling).toHaveTextContent("2");
  expect(screen.getByRole("button", { name: "导出" })).toBeDisabled();

  rerender(
    <ConfigLibraryDialog
      exportSummary={{ exportedCount: 3, skippedUnconfiguredCount: 1 }}
      mode="export"
      onClose={vi.fn()}
      onExport={vi.fn()}
    />,
  );
  expect(screen.getByRole("button", { name: "导出" })).toBeEnabled();
});

test("expands the exact spirits, natures, and four skills included in export", () => {
  render(
    <ConfigLibraryDialog
      exportSummary={{
        exportedCount: 1,
        library: {
          entries: [{
            natureId: "adamant",
            skills: ["skill-fire", "skill-speed", null, "skill-guard"],
            spiritId: "spirit-dog",
          }],
        },
      }}
      mode="export"
      onClose={vi.fn()}
      snapshot={{
        skills: [
          { id: "skill-fire", name: "烈焰冲锋" },
          { id: "skill-speed", name: "速度打击" },
          { id: "skill-guard", name: "守护之力" },
        ],
        spirits: [{
          asset: { localUrl: "/assets/spirits/spirit-dog.png" },
          fullName: "音速犬",
          id: "spirit-dog",
        }],
      }}
    />,
  );

  const toggle = screen.getByRole("button", { name: "查看精灵和技能" });
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByText("烈焰冲锋")).not.toBeInTheDocument();

  fireEvent.click(toggle);

  expect(toggle).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByRole("button", { name: "收起精灵和技能" })).toBeVisible();
  expect(screen.getByText("音速犬")).toBeVisible();
  expect(screen.getByText("性格 固执")).toBeVisible();
  expect(screen.getByText("烈焰冲锋")).toBeVisible();
  expect(screen.getByText("速度打击")).toBeVisible();
  expect(screen.getByText("守护之力")).toBeVisible();
  expect(screen.getByText("空")).toBeVisible();
  expect(screen.getByRole("img", { name: "音速犬" })).toHaveAttribute(
    "src",
    "/assets/spirits/spirit-dog.png",
  );
});

test("shows import preview and only confirms after a valid entry is ready", () => {
  const onConfirmImport = vi.fn();
  render(
    <ConfigLibraryDialog
      mode="import"
      onClose={vi.fn()}
      onConfirmImport={onConfirmImport}
      parsed={{
        entries: [{ spiritId: "spirit-a" }],
        favoriteSpiritIds: ["spirit-a"],
        preview: {
          added: 2,
          overwritten: 1,
          favoritesAdded: 2,
          missingSpirits: 1,
          missingSkills: 3,
          unknownTraitFields: 1,
          invalidEntries: 1,
          duplicateEntries: 1,
          repairedEntries: 0,
        },
        issueDetails: [{
          action: "已跳过，不会写入",
          entryIndex: 75,
          reason: "技能槽数量不符合当前版本",
          spiritId: "spirit-unicorn",
          spiritName: "彩虹独角兽",
          type: "invalidEntries",
        }],
        warnings: ["数据版本不同，已按当前版本校验"],
      }}
    />,
  );

  expect(screen.getByText("新增配置").nextElementSibling).toHaveTextContent("2");
  expect(screen.getByText("覆盖本机配置").nextElementSibling).toHaveTextContent("1");
  expect(screen.getByText("新增收藏").nextElementSibling).toHaveTextContent("2");
  expect(screen.queryByText("失效技能槽")).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: /检查详情/ }));

  expect(screen.getByText("失效技能槽").nextElementSibling).toHaveTextContent("3");
  expect(screen.getByText("文件内重复").nextElementSibling).toHaveTextContent("1");
  expect(screen.getByText("彩虹独角兽")).toBeVisible();
  expect(screen.getByText(/文件第 75 条/)).toBeVisible();
  expect(screen.getByText("技能槽数量不符合当前版本")).toBeVisible();
  expect(screen.getByText("已跳过，不会写入")).toBeVisible();
  expect(screen.getByText(/采用最后一条有效配置/)).toBeVisible();
  expect(screen.getByText(/确认后将覆盖 1 只精灵/)).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "确认导入" }));
  expect(onConfirmImport).toHaveBeenCalledTimes(1);
});

test("allows importing legacy favorites even when they contain no configuration", () => {
  const onConfirmImport = vi.fn();
  render(
    <ConfigLibraryDialog
      mode="import"
      onClose={vi.fn()}
      onConfirmImport={onConfirmImport}
      parsed={{
        entries: [],
        favoriteSpiritIds: ["spirit-a"],
        preview: {
          added: 0,
          overwritten: 0,
          favoritesAdded: 1,
          missingSpirits: 0,
          missingSkills: 0,
          unknownTraitFields: 0,
          invalidEntries: 0,
          duplicateEntries: 0,
        },
        warnings: [],
      }}
    />,
  );

  expect(screen.getByText("检查通过，未发现兼容问题")).toBeVisible();
  expect(screen.queryByRole("button", { name: /检查详情/ })).not.toBeInTheDocument();
  const confirm = screen.getByRole("button", { name: "确认导入" });
  expect(confirm).toBeEnabled();
  fireEvent.click(confirm);
  expect(onConfirmImport).toHaveBeenCalledTimes(1);
});

test("shows the built-in popular configuration preview without a file picker", () => {
  const onConfirmImport = vi.fn();
  render(
    <ConfigLibraryDialog
      mode="popular"
      onClose={vi.fn()}
      onConfirmImport={onConfirmImport}
      parsed={{
        entries: [{
          natureId: "adamant",
          skills: ["skill-fire", null, null, null],
          spiritId: "spirit-dog",
        }],
        favoriteSpiritIds: ["spirit-dog"],
        preview: {
          added: 188,
          overwritten: 5,
          favoritesAdded: 180,
          missingSpirits: 0,
          missingSkills: 0,
          unknownTraitFields: 0,
          invalidEntries: 0,
          duplicateEntries: 0,
          repairedEntries: 0,
        },
        issueDetails: [],
        warnings: [],
      }}
      snapshot={{
        skills: [{ id: "skill-fire", name: "烈焰冲锋" }],
        spirits: [{ fullName: "音速犬", id: "spirit-dog" }],
      }}
    />,
  );

  expect(screen.getByRole("dialog", { name: "常用精灵配置" })).toBeVisible();
  expect(screen.getByText("PVP 热门配置 · 213 只")).toBeVisible();
  expect(screen.getByText("安装后可离线导入")).toBeVisible();
  expect(screen.queryByLabelText("选择配置库文件")).not.toBeInTheDocument();
  expect(screen.getByText("新增配置").nextElementSibling).toHaveTextContent("188");
  expect(screen.getByText("覆盖本机配置").nextElementSibling).toHaveTextContent("5");
  expect(screen.getByText(/队伍与当前页面不会改变/)).toBeVisible();

  fireEvent.click(screen.getByRole("button", { name: "查看精灵和技能" }));
  expect(screen.getByText("音速犬")).toBeVisible();
  expect(screen.getByText("烈焰冲锋")).toBeVisible();

  fireEvent.click(screen.getByRole("button", { name: "导入常用配置" }));
  expect(onConfirmImport).toHaveBeenCalledTimes(1);
});
