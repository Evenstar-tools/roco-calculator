import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { unzipSync, strFromU8 } from "fflate";
import DamageComparisonDialog from "../../src/components/DamageComparisonDialog.jsx";
import { createInitialState } from "../../src/state/defaults.js";
import * as exporter from "../../src/features/damage-comparison/export.js";
import { damageComparisonXlsx } from "../../src/features/damage-comparison/export-xlsx.js";

test("冻结蓝段与实伤分开显示，满条筛选包含冻结击倒，导出保持一致", async () => {
  const stats = { hp: 100, physicalAttack: 100, physicalDefense: 100, magicalAttack: 100, magicalDefense: 100, speed: 100 };
  const snapshot = { meta: { id: "freeze-ui" }, traits: [], spirits: [["source", "普通"], ["target", "草"], ["ice", "冰"]].map(([id, type]) => ({ id, fullName: id, types: [type], raceStats: stats, stage: "首领", sourceCategory: "首领形态" })), skills: [{ id: "hit", name: "测试", type: "普通", category: "magical", basePower: 320 }] };
  const state = createInitialState(snapshot);
  state.negativeStatuses.defender.freeze = 4;
  const download = vi.spyOn(exporter, "downloadDamageComparison").mockResolvedValue();
  try {
    render(<DamageComparisonDialog snapshot={snapshot} source={{ state, direction: "forward" }} onClose={vi.fn()} />);
    const row = await screen.findByRole("button", { name: "查看target承伤详情" });
    expect(row).toHaveTextContent("100.2%");
    expect(row).toHaveTextContent("冻结击倒");
    expect(within(row).getByRole("img", { name: "伤害80.2%＋冻结20%" }).firstChild).toHaveStyle({ width: "20%" });
    fireEvent.click(row);
    expect(screen.getByText(/冻结斩杀≤89 HP/)).toBeInTheDocument();
    fireEvent.change(screen.getByRole("slider", { name: "承伤范围下限" }), { target: { value: "100" } });
    fireEvent.keyUp(screen.getByRole("slider", { name: "承伤范围下限" }), { key: "ArrowRight" });
    fireEvent.click(screen.getByRole("button", { name: "导出", exact: true }));
    fireEvent.click(screen.getByRole("button", { name: "Markdown（.md）" }));
    await waitFor(() => expect(download).toHaveBeenCalledOnce());
    const report = download.mock.calls[0][0];
    const exported = report.rows.find((r) => r[1] === "target");
    expect(exported[4]).toBe(360);
    expect(exported[6]).toBe(0);
    expect(exported[7]).toBe("冻结击倒");
    expect(exported[10]).toBe(0.2);
    const xml = strFromU8(unzipSync(damageComparisonXlsx(report))["xl/worksheets/sheet1.xml"]);
    expect(xml).toMatch(/<c r="K\d+" s="3"><v>0.2<\/v>/u);
    expect(exporter.damageComparisonMarkdown(report)).toContain("冻结覆盖");
    fireEvent.click(screen.getByRole("checkbox", { name: "沿用星陨／冻结" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "查看target承伤详情" })).not.toBeInTheDocument());
  } finally { download.mockRestore(); }
});
