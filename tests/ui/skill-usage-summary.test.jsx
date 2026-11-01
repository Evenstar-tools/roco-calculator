import { LocaleProvider } from "../../src/i18n/LocaleContext.jsx";
import { translateCalculatorText, clearMissingCalculatorTexts, getMissingCalculatorTexts } from "../../src/i18n/calculator-text.js";
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
    recordedEffects: ["敌方能量-2"],
    nextHint: "本次可得：水·能耗-1　冰·敌冻结+2",
  } }} nextHint="172 − 172 = 0 · 本次可得：水·能耗-1" />);
  expect(screen.getByText(/当前：静态威力 80（手动） · 魔攻 \+3 层 · 速度 \+20/)).toBeVisible();
  expect(screen.getByText("仅记录：敌方能量-2（未参与结算）")).toBeVisible();
  expect(screen.getByText("本次可得：水·能耗-1 冰·敌冻结+2（异常结算）")).toBeVisible();
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


test.each(["en", "ja"])("%s shows translated accumulated effects and next-use preview separately", (locale) => {
  clearMissingCalculatorTexts();
  const result = { usageSummary: { count: 2, powerGain: 20, hitCountGain: 2,
    hitCountCapped: true, hitCountLimit: 99, currentEffects: ["魔攻 +3 层", "速度 +20"] } };
  const { container, rerender } = render(<LocaleProvider locale={locale}><SkillUsageSummary result={result}
    nextHint="本次可得：普·威力+10　翼·连击+1" /></LocaleProvider>);
  expect(container.querySelector(".skill-usage__main").textContent).toContain(translateCalculatorText("已使用×2", locale));
  expect(container.querySelector(".skill-usage__main").textContent).toContain(translateCalculatorText("威力+20", locale));
  expect(container.querySelector(".skill-usage__main").textContent).toContain(translateCalculatorText("连击+2", locale));
  expect(container.querySelector(".skill-usage__next").textContent).toContain(translateCalculatorText("普·威力+10", locale));
  expect(getMissingCalculatorTexts(), JSON.stringify(getMissingCalculatorTexts())).toEqual([]);
  expect(result.usageSummary.powerGain).toBe(20);

  const persistentEffects = [
    ["减伤80%", "Damage reduction 80%", "ダメージ軽減 80%"],
    ["魔攻+7层", "M. ATK +7 stages", "魔攻+7段階"],
    ["魔攻 +3 层", "M. ATK +3 stages", "魔攻 +3段階"],
    ["敌方魔防 -4 层", "Opponent M. DEF −4 stages", "相手の魔防 −4段階"],
    ["魔攻+8层", "M. ATK +8 stages", "魔攻+8段階"],
    ["攻击+7层", "Attack +7 stages", "攻撃+7段階"],
    ["双攻+4层", "Both attacks +4 stages", "物攻・魔攻+4段階"],
    ["双防+3层", "Both defenses +3 stages", "物防・魔防+3段階"],
    ["物攻+2层", "P. ATK +2 stages", "物攻+2段階"],
    ["物防+16层", "P. DEF +16 stages", "物防+16段階"],
    ["魔防-6层", "M. DEF −6 stages", "魔防−6段階"],
    ["防御+4层", "Defense +4 stages", "防御+4段階"],
    ["敌方攻击-3层", "Opponent Attack −3 stages", "相手の攻撃−3段階"],
    ["敌方魔攻+8层", "Opponent M. ATK +8 stages", "相手の魔攻+8段階"],
    ["敌方防御-4层", "Opponent Defense −4 stages", "相手の防御−4段階"],
    ["敌方双防-4层", "Opponent Both defenses −4 stages", "相手の物防・魔防−4段階"],
    ["敌方物防-9层", "Opponent P. DEF −9 stages", "相手の物防−9段階"],
    ["敌方魔防-4层", "Opponent M. DEF −4 stages", "相手の魔防−4段階"],
    ["速度+30", "SPD +30", "速さ+30"],
    ["速度-40", "SPD −40", "速さ−40"],
    ["敌方速度-40", "Opponent SPD −40", "相手の速さ−40"],
  ];
  const persistent = { usageSummary: { count: 1, successCount: 1,
    appliedEffects: persistentEffects.map(([source]) => source) } };
  const original = JSON.stringify(persistent);
  rerender(<LocaleProvider locale={locale}><SkillUsageSummary result={persistent} /></LocaleProvider>);
  const main = container.querySelector(".skill-usage__main");
  expect(main).toHaveTextContent(locale === "en" ? "Used ×1 · Counter successes ×1" : "使用×1 · カウンター成功×1");
  for (const [, en, ja] of persistentEffects) expect(main).toHaveTextContent(locale === "en" ? en : ja);
  expect(getMissingCalculatorTexts(), JSON.stringify(getMissingCalculatorTexts())).toEqual([]);
  if (locale === "en") expect(main.textContent).not.toMatch(/[\u3400-\u9fff]/u);
  expect(JSON.stringify(persistent)).toBe(original);
});
