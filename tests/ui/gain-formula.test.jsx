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
  expect(buildFormulaAudit(result).formulaPower.displayed).toBe(97);
  expect(container.querySelectorAll(".formula-audit__row")[1]).toHaveTextContent("基础50+撒娇×110→加成后威力97.5");
});

test("旧记录缺少威力基础时不把攻击面板变化当作固定威力", () => {
  const audit = buildFormulaAudit({ status: "exact", formulaSteps: [
    { label: "攻击面板", before: 200, after: 240 },
    { label: "技能威力百分比", before: 80, after: 120, input: [0.5] },
    { label: "显示威力", before: 120, after: 120 },
  ] });
  expect(audit.power.fixedSteps).toEqual([]);
  expect(audit.power.percentBefore).toBe(80);
});
