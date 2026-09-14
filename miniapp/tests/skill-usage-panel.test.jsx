import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import SkillUsageSummary from "../src/components/SkillUsageSummary.jsx";
import { ConditionField } from "../src/components/ConditionField.jsx";
import SkillConditionEditor from "../src/components/SkillConditionEditor.jsx";

test("折射减耗后实际能耗输入与计算结果一致，手动修改仍可提交", () => {
  const onContextChange = vi.fn();
  render(<SkillConditionEditor context={{}} direction={{ overrides: {} }}
    skill={{ id: "wave", name: "叠浪", type: "水", category: "physical", basePower: 10, cost: 3 }}
    result={{ effectiveCostInput: 2, skillCost: 2 }} onContextChange={onContextChange} onDirectionChange={vi.fn()} />);
  const input = screen.getByRole("spinbutton", { name: "实际能耗" });
  expect(input).toHaveValue(2);
  fireEvent.input(input, { target: { value: "1" } });
  expect(onContextChange).toHaveBeenCalledWith(expect.objectContaining({ actualSkillCost: 1 }));
});

test("累计值与下次预览分层，通用规则不铺开，手动覆盖有提示", () => {
  render(<SkillUsageSummary summary="未使用｜无增益" usage={{ count: 0, powerGain: 0, hitCountGain: 0, manualPower: true }} nextHint="本次可得：威力+10" details={["累计已生效：通用说明", "折射无独立上限"]} />);
  expect(screen.queryByText(/累计威力|累计连击|已使用/)).not.toBeInTheDocument();
  expect(screen.getByText("本次可得：威力+10")).toBeVisible();
  expect(screen.getByText("威力手动覆盖")).toBeVisible();
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

test("增益摘要直接展示，不保留明细入口，点击不会重复激活技能", () => {
  const activate = vi.fn();
  render(<div onClick={activate}><SkillUsageSummary summary="已使用×2｜增益：威力+20 · 连击+2" details={["来源：普通、翼；萌芽0层", "最终连击上限99"]} /></div>);
  expect(screen.queryByText("来源：普通、翼；萌芽0层")).not.toBeInTheDocument();
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
  fireEvent.click(screen.getByText("已使用×2｜增益：威力+20 · 连击+2"));
  expect(activate).not.toHaveBeenCalled();
  expect(screen.queryByText("来源：普通、翼；萌芽0层")).not.toBeInTheDocument();
});

test("未使用且没有预览时不渲染空容器，使用后只增加一条摘要", () => {
  const { container, rerender } = render(<SkillUsageSummary usage={{ count: 0 }} />);
  expect(container).toBeEmptyDOMElement();
  rerender(<SkillUsageSummary usage={{ count: 2, powerGain: 20, hitCountGain: 2, currentEffects: ["静态威力 +20", "魔攻 +6 层"] }} nextHint="本次可得：普·威力+10" />);
  expect(container.querySelectorAll('.skill-usage__main')).toHaveLength(1);
  expect(screen.getByText("累计状态：已使用×2 增益：威力+20 · 连击+2 当前：魔攻 +6 层")).toBeVisible();
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
