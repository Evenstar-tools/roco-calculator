import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { ResultRail } from "../../src/components/ResultRail.jsx";
import { WorkspaceOverlays } from "../../src/components/WorkspaceOverlays.jsx";

// These presentation tests never decode imported lineup images.
vi.mock("../../src/state/lineup-image.js", () => ({ decodeLineupImage: vi.fn() }));

const result = {
  attackerName: "烈火守护", defenderName: "银月狼王", selectedSkillName: "撕咬",
  defenderHp: 400, defenderMaxHp: 400, mode: "four",
  selectedResult: { status: "exact", totalDamage: 68, hpPercent: 17, remainingHp: 332, lethal: false },
  skillResults: [{ id: "bite", name: "撕咬", damage: 68, hpPercent: 17, selected: true }],
};

const staleComparison = { active: true, hasCustom: true, issue: "旧比较提示不应显示",
  beforeView: { result: { ...result, selectedResult: { status: "exact", totalDamage: 50, hpPercent: 12.5 } } },
  afterView: { result }, beforeLabel: "记录调整前", afterLabel: "自定义试算" };

function expectNoHistoricalComparison(container) {
  expect(container.querySelector(".balance-summary, .balance-inline, .balance-damage, .skill-result-row__comparison")).toBeNull();
  expect(container).not.toHaveTextContent(/记录调整前|更新前后对比|不可对比|旧比较提示|百分点|伤害增加|伤害减少/u);
}

test.each([false, true])("种族值编辑状态%s仍显示一个主伤害数及原技能结果，不渲染遗留比较输入", (hasCustomRaceStats) => {
  const onOpenComparison = vi.fn();
  const { container } = render(<ResultRail result={result} hasCustomRaceStats={hasCustomRaceStats}
    balanceComparison={staleComparison} onOpenComparison={onOpenComparison} />);
  expect(screen.getAllByTestId("primary-damage")).toHaveLength(1);
  expect(screen.getByTestId("primary-damage")).toHaveTextContent(/^68$/u);
  expect(screen.getByLabelText("撕咬实际伤害")).toHaveTextContent(/^68$/u);
  expect(screen.getByText("剩余 332 HP")).toBeVisible();
  expectNoHistoricalComparison(container);
  fireEvent.click(screen.getByRole("button", { name: hasCustomRaceStats ? "查看全精灵承伤（官方值）" : "查看全精灵承伤" }));
  expect(onOpenComparison).toHaveBeenCalledOnce();
});

test("手机底栏和展开结果都使用当前自定义伤害，原官方承伤工具保留", () => {
  const onOpenComparison = vi.fn();
  const { container } = render(<WorkspaceOverlays
    menu={{ open: false }} share={{}} team={{}} toast={{}}
    mobileResult={{ configurationReady: true, open: true, viewMode: "compact", result,
      hasCustomRaceStats: true, balanceComparison: staleComparison,
      actions: { onOpenComparison } }} />);
  expect(container.querySelector(".mobile-result-bar__damage")).toHaveTextContent(/^68$/u);
  expect(screen.getByTestId("primary-damage")).toHaveTextContent(/^68$/u);
  expectNoHistoricalComparison(container);
  fireEvent.click(screen.getByRole("button", { name: "承伤对比（官方）" }));
  expect(onOpenComparison).toHaveBeenCalledOnce();
  expect(screen.getByRole("button", { name: "查看全精灵承伤（官方值）" })).toBeVisible();
});
