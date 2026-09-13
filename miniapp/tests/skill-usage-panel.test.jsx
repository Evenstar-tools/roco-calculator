import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import SkillUsageSummary from "../src/components/SkillUsageSummary.jsx";
import { ConditionField } from "../src/components/ConditionField.jsx";

test("增益明细可展开收起，点击不会重复激活技能", () => {
  const activate = vi.fn();
  render(<div onClick={activate}><SkillUsageSummary summary="已使用×2｜增益：威力+20 · 连击+2" details={["来源：普通、翼；萌芽0层", "最终连击上限99"]} /></div>);
  expect(screen.queryByText("来源：普通、翼；萌芽0层")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "查看增益明细" }));
  expect(screen.getByText("来源：普通、翼；萌芽0层")).toBeVisible();
  expect(activate).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "收起增益明细" }));
  expect(screen.queryByText("来源：普通、翼；萌芽0层")).not.toBeInTheDocument();
});

test("次数控件复用原输入并支持重置，不增加第二个输入", () => {
  const onChange = vi.fn();
  render(<ConditionField input={{ type: "number", contextKey: "skillUseCount", label: "此前使用次数", min: 0, max: 20 }} value={2} onChange={onChange} />);
  expect(screen.getAllByRole("spinbutton")).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "此前使用次数减少" }));
  expect(onChange).toHaveBeenLastCalledWith(1);
  fireEvent.click(screen.getByRole("button", { name: "此前使用次数增加" }));
  expect(onChange).toHaveBeenLastCalledWith(3);
  fireEvent.click(screen.getByRole("button", { name: "此前使用次数重置" }));
  expect(onChange).toHaveBeenLastCalledWith(0);
});
