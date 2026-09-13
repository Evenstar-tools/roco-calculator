import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import SkillUsageSummary from "../src/components/SkillUsageSummary.jsx";
import { ConditionField } from "../src/components/ConditionField.jsx";
import SkillConditionEditor from "../src/components/SkillConditionEditor.jsx";

test("累计值与下次预览分层，通用规则不铺开，手动覆盖有提示", () => {
  render(<SkillUsageSummary summary="未使用｜无增益" usage={{ count: 0, powerGain: 0, hitCountGain: 0, manualPower: true }} nextHint="本次可得：威力+10" details={["累计已生效：通用说明", "折射无独立上限"]} />);
  expect(screen.queryByText(/累计威力|累计连击|已使用/)).not.toBeInTheDocument();
  expect(screen.getByText("使用后可得：威力+10")).toBeVisible();
  expect(screen.getByText("威力已手动覆盖，以当前值为准")).toBeVisible();
  expect(screen.queryByRole("button", { name: "查看增益明细" })).not.toBeInTheDocument();
  expect(screen.queryByText("累计已生效：通用说明")).not.toBeInTheDocument();
});

test("连击可加减并恢复基础默认，自动增益不重复写入基础值", () => {
  const onDirectionChange = vi.fn();
  render(<SkillConditionEditor context={{}} direction={{ hitCount: 7 }} skill={{ id: "test", name: "连击", category: "physical", basePower: 20, description: "造成物伤，3连击。" }} result={{ automaticHitCountAdd: 2 }} onContextChange={vi.fn()} onDirectionChange={onDirectionChange} />);
  fireEvent.click(screen.getByRole("button", { name: "减少连击数" }));
  expect(onDirectionChange).toHaveBeenLastCalledWith({ hitCount: 6 });
  fireEvent.click(screen.getByRole("button", { name: "增加连击数" }));
  expect(onDirectionChange).toHaveBeenLastCalledWith({ hitCount: 8 });
  fireEvent.click(screen.getByRole("button", { name: "恢复默认连击数" }));
  expect(onDirectionChange).toHaveBeenLastCalledWith({ hitCount: 3 });
});

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
