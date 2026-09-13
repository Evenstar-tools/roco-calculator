import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { unzipSync, strFromU8 } from "fflate";
import DamageComparisonDialog from "../../src/components/DamageComparisonDialog.jsx";
import { createInitialState } from "../../src/state/defaults.js";
import * as exporter from "../../src/features/damage-comparison/export.js";
import { damageComparisonXlsx } from "../../src/features/damage-comparison/export-xlsx.js";

afterEach(() => vi.restoreAllMocks());
const stats = { hp: 100, physicalAttack: 100, physicalDefense: 100, magicalAttack: 100, magicalDefense: 100, speed: 100 };
const snapshot = { meta: { id: "export-data", rulesVersion: "export-rules" }, traits: [],
  spirits: Array.from({ length: 72 }, (_, index) => ({ id: String(index), fullName: `精灵${index}`, types: ["草"], raceStats: stats, stage: "首领", sourceCategory: "首领形态" })),
  skills: [{ id: "skill", name: "火焰", basePower: 80, type: "火", category: "magical" }],
};

test("导出当前筛选全量而非60条可见行，保留排序和搜索，空结果禁用", async () => {
  const download = vi.spyOn(exporter, "downloadDamageComparison").mockResolvedValue();
  render(<DamageComparisonDialog snapshot={snapshot} source={{ state: createInitialState(snapshot), direction: "forward" }} onClose={vi.fn()} />);
  expect(screen.getByRole("button", { name: "导出", exact: true })).toBeDisabled();
  await waitFor(() => expect(screen.getByRole("button", { name: "导出", exact: true })).toBeEnabled());
  expect(screen.getAllByRole("button", { name: /^查看精灵/ })).toHaveLength(60);
  fireEvent.click(screen.getByRole("button", { name: "导出", exact: true }));
  fireEvent.click(screen.getByRole("button", { name: "Markdown（.md）" }));
  await waitFor(() => expect(download).toHaveBeenCalledOnce());
  const [report, format] = download.mock.calls[0];
  expect(format).toBe("md");
  expect(report.rows).toHaveLength(72);
  expect(report.metadata.find(([key]) => key === "计算口径")[1]).toContain("未沿用星陨／冻结（按0层）");
  expect(report.metadata.find(([key]) => key === "版本／时间")[1]).toContain("export-rules");
  fireEvent.change(screen.getByLabelText("承伤排序"), { target: { value: "desc" } });
  fireEvent.change(screen.getByLabelText("搜索承伤精灵"), { target: { value: "精灵71" } });
  fireEvent.click(screen.getByRole("button", { name: "导出", exact: true }));
  fireEvent.click(screen.getByRole("button", { name: "Excel（.xlsx）" }));
  await waitFor(() => expect(download).toHaveBeenCalledTimes(2));
  expect(download.mock.calls[1][0].rows).toHaveLength(1);
  expect(download.mock.calls[1][0].rows[0][1]).toBe("精灵71");
  expect(download.mock.calls[1][0].metadata.find(([key]) => key === "筛选")[1]).toContain("承伤从高到低；搜索：精灵71");
  fireEvent.change(screen.getByLabelText("搜索承伤精灵"), { target: { value: "找不到" } });
  expect(screen.getByRole("button", { name: "导出", exact: true })).toBeDisabled();
});

test("导出失败允许重试，Escape只关闭格式菜单", async () => {
  vi.spyOn(exporter, "downloadDamageComparison").mockRejectedValue(new Error("disk"));
  const onClose = vi.fn();
  render(<DamageComparisonDialog snapshot={{ ...snapshot, spirits: snapshot.spirits.slice(0, 2) }} source={{ state: createInitialState(snapshot), direction: "forward" }} onClose={onClose} />);
  await waitFor(() => expect(screen.getByRole("button", { name: "导出", exact: true })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "导出", exact: true }));
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  expect(onClose).not.toHaveBeenCalled();
  expect(screen.queryByRole("group", { name: "导出格式" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "导出", exact: true }));
  fireEvent.click(screen.getByRole("button", { name: "Excel（.xlsx）" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("导出失败，请重试");
  expect(screen.getByRole("button", { name: "Excel（.xlsx）" })).toBeEnabled();
});

test("XLSX是真实工作簿，数值百分比不转文本，特殊字符不破坏结构或执行公式", () => {
  const report = { title: "结论 <测试>", metadata: [["口径", "生命模板"]], headers: ["排名", "精灵", "属性", "满血", "伤害", "比例", "剩余", "结论", "配点"],
    rows: [[1, '=HYPERLINK("https://example.com")|\n<script>', "冰&水", 100, 51, .51, 49, "未击倒", "生命60"]] };
  const files = unzipSync(damageComparisonXlsx(report));
  expect(Object.keys(files)).toHaveLength(6);
  for (const bytes of Object.values(files)) expect(new DOMParser().parseFromString(strFromU8(bytes), "text/xml").querySelector("parsererror")).toBeNull();
  const sheet = new DOMParser().parseFromString(strFromU8(files["xl/worksheets/sheet1.xml"]), "text/xml");
  expect(sheet.querySelector('c[r="F5"] v').textContent).toBe("0.51");
  expect(sheet.querySelector('c[r="B5"]').getAttribute("t")).toBe("inlineStr");
  expect(sheet.querySelector('c[r="B5"] t').textContent).toBe(report.rows[0][1]);
  expect(sheet.querySelector("f")).toBeNull();
  expect(sheet.querySelector("autoFilter").getAttribute("ref")).toBe("A4:I5");
  const md = exporter.damageComparisonMarkdown(report);
  expect(md).toContain("51.0%");
  expect(md).toContain("\\|<br>&lt;script&gt;");
  expect(md).not.toContain("<script>");
});

test.each(["forward", "reverse"])("%s导出跟随实际攻击方及状态，并标记当前数据版本", async (direction) => {
  const download = vi.spyOn(exporter, "downloadDamageComparison").mockResolvedValue();
  const data = { ...snapshot, spirits: snapshot.spirits.slice(0, 2) };
  const state = createInitialState(data);
  state.versions = { data: "old-saved-data", rules: "old-saved-rules" };
  const target = direction === "forward" ? "defender" : "attacker";
  state.marks[target].negative = { id: "starfall", stacks: 6 };
  state.negativeStatuses[target].freeze = 2;
  const before = JSON.stringify(state);
  render(<DamageComparisonDialog snapshot={data} source={{ state, direction }} onClose={vi.fn()} />);
  fireEvent.click(screen.getByRole("checkbox", { name: "沿用星陨／冻结" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "导出", exact: true })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "导出", exact: true }));
  fireEvent.click(screen.getByRole("button", { name: "Markdown（.md）" }));
  await waitFor(() => expect(download).toHaveBeenCalledOnce());
  const report = download.mock.calls[0][0];
  expect(report.title).toContain(direction === "forward" ? "精灵0" : "精灵1");
  expect(report.filename).toContain("星陨6-冻结2");
  expect(report.metadata.find(([key]) => key === "计算口径")[1]).toContain("星陨 6 层 · 冻结 2 层");
  expect(report.metadata.find(([key]) => key === "版本／时间")[1]).toContain("数据 export-data；规则 export-rules");
  expect(JSON.stringify(state)).toBe(before);
});
