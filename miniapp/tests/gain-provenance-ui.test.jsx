import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import ResultSheet from "../src/components/ResultSheet.jsx";
import ResultFormulaAudit from "../src/components/ResultFormulaAudit.jsx";

test("结果栏无增益不占行，有增益只显示普通文本", () => {
  const view = { status: "exact", rows: [], selectedResult: { skillName: "折射", totalDamage: 100, hpPercent: 25 } };
  const { container, rerender } = render(<ResultSheet open view={view} />);
  expect(container.querySelector(".result-sheet__gains")).toBeNull();
  rerender(<ResultSheet open view={{ ...view, selectedResult: { ...view.selectedResult, gainSummary: "折射×2 · 夺目" } }} />);
  expect(screen.getByText("增益：折射×2 · 夺目")).toBeTruthy();
});

test("公式原项带来源，不再重复使用摘要和下次预览", () => {
  const source = { kind: "skill", id: "coax", name: "撒娇", count: 1, amount: 10 };
  const result = { status: "exact", skillName: "折射", totalDamage: 100,
    usageSummary: { count: 1, nextHint: "本次可得：不要重复" },
    gainSources: { fixed: [source], attack: [{ ...source, name: "折射", amount: 3 }] },
    formulaSteps: [{ label: "基础威力", before: 50, after: 50 }, { label: "固定威力增加", input: 10 }, { label: "攻击面板", input: "magicalAttack", after: 260 }] };
  const { container } = render(<ResultFormulaAudit result={result} />);
  expect(screen.getByText("撒娇×1")).toBeTruthy();
  expect(screen.getByText("魔攻 · +3层（折射×1）")).toBeTruthy();
  expect(container.querySelector(".skill-usage")).toBeNull();
  expect(screen.queryByText(/本次可得/)).toBeNull();
});
