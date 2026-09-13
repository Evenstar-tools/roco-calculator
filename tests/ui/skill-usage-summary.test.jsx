import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { SkillUsageSummary, UsageCountActions } from "../../src/components/SkillUsageSummary.jsx";

test("零次无占位，使用后仅一条累计摘要且不再提供折叠明细", () => {
  const activate = vi.fn();
  const { rerender } = render(<div onClick={activate}><SkillUsageSummary result={{ usageSummary: { count: 0 } }} nextHint="本次可得：普·威力+10" /></div>);
  expect(screen.queryByText(/已使用|累计威力|累计连击|查看增益明细/)).not.toBeInTheDocument();
  expect(screen.getByText("本次可得：普·威力+10")).toBeVisible();
  rerender(<div onClick={activate}><SkillUsageSummary result={{ usageSummary: {
    count: 2, powerGain: 20, hitCountGain: 2, scope: "persistent", hitCountCapped: true, hitCountLimit: 99,
    sources: [{ types: ["普通", "翼"], sproutStacks: 0, count: 2, powerGain: 20, hitCountGain: 2 }],
  } }} nextHint="本次可得：普·威力+10" /></div>);
  expect(screen.getByLabelText("已使用 2 次")).toBeVisible();
  expect(screen.getByText(/增益：威力\+20 · 连击\+2.*连击已达上限 99/)).toBeVisible();
  fireEvent.click(screen.getByLabelText("已使用 2 次"));
  expect(screen.queryByText(/查看增益明细|来源：|萌芽0层/)).not.toBeInTheDocument();
  expect(activate).not.toHaveBeenCalled();
  expect(screen.queryByText(/^累计已生效：/)).not.toBeInTheDocument();
});

test("当前计算、历史与仅记录分开，零值不显示，手动值不伪装成折射累计", () => {
  render(<SkillUsageSummary result={{ usageSummary: {
    count: 0, powerGain: 0, hitCountGain: 0, manualPower: true,
    currentEffects: ["静态威力 80（手动）", "魔攻 +3 层", "速度 +20"],
    recordedEffects: ["全技能能耗-1"],
    nextHint: "本次可得：水·能耗-1",
  } }} nextHint="172 − 172 = 0 · 本次可得：水·能耗-1" />);
  expect(screen.getByText(/当前：静态威力 80（手动） · 魔攻 \+3 层 · 速度 \+20/)).toBeVisible();
  expect(screen.getByText("仅记录：全技能能耗-1（未参与结算）")).toBeVisible();
  expect(screen.getByText("本次可得：水·能耗-1（仅记录）")).toBeVisible();
  expect(screen.queryByText(/172 − 172/)).not.toBeInTheDocument();
  expect(screen.queryByText(/已使用 0|累计威力|累计连击|查看增益明细/)).not.toBeInTheDocument();
});

test("无次数、无效果的摘要不留下容器", () => {
  const { container } = render(<SkillUsageSummary result={{ usageSummary: { count: 0 } }} />);
  expect(container).toBeEmptyDOMElement();
});

test("已有次数输入的减、加、重置共用一个值并遵守控件边界", () => {
  function Harness() {
    const [count, setCount] = useState(0);
    return <><input aria-label="此前使用次数" type="number" value={count} readOnly /><UsageCountActions input={{ contextKey: "skillUseCount", label: "此前使用次数", min: 0, max: 2 }} value={count} onChange={setCount} /></>;
  }
  render(<Harness />);
  expect(screen.getByRole("button", { name: "此前使用次数减少" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "此前使用次数增加" }));
  fireEvent.click(screen.getByRole("button", { name: "此前使用次数增加" }));
  expect(screen.getByRole("spinbutton")).toHaveValue(2);
  expect(screen.getByRole("button", { name: "此前使用次数增加" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "此前使用次数减少" }));
  expect(screen.getByRole("spinbutton")).toHaveValue(1);
  fireEvent.click(screen.getByRole("button", { name: "此前使用次数重置" }));
  expect(screen.getByRole("spinbutton")).toHaveValue(0);
});
