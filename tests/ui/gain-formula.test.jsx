import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { FormulaAudit, buildFormulaAudit } from "../../src/components/AdvancedOptions.jsx";

test("威力和魔攻原位标来源，去掉公式顶部的使用摘要", () => {
  const source = { kind: "skill", id: "coax", name: "撒娇", count: 1, amount: 10 };
  const result = { status: "exact", skillName: "折射", totalDamage: 100, staticPower: 60,
    usageSummary: { count: 1, nextHint: "本次可得：不要重复" },
    gainSources: { fixed: [source], attack: [{ ...source, name: "折射", amount: 3 }] },
    formulaSteps: [{ label: "基础威力", before: 50, after: 50 }, { label: "固定威力增加", input: 10 }, { label: "攻击面板", input: "magicalAttack", after: 260 }, { label: "显示威力", before: 97.5, after: 97 }, { label: "等级系数与攻防比", input: { calculationPower: 75 } }] };
  const { container } = render(<FormulaAudit result={result} />);
  expect(screen.getByText("撒娇×1")).toBeVisible();
  expect(screen.getByText("魔攻 · +3层（折射×1）")).toBeVisible();
  expect(container.querySelector(".skill-usage")).toBeNull();
  expect(buildFormulaAudit(result).formulaPower.internal).toBe(97.5);
});
