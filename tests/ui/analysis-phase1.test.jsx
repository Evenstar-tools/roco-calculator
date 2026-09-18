import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { AbilityWorkbench } from "../../src/components/AbilityWorkbench.jsx";
import RankingsPanel from "../../src/components/RankingsPanel.jsx";
import * as analysis from "../../src/features/team-ability/domain/ability-analysis.js";
import * as speed from "../../src/features/team-ability/domain/speed-targets.js";
import * as stat from "../../src/domain/stat.js";
import * as rankingTools from "../../src/features/team-ability/domain/ranking-tools.js";
import { getNatureMultipliers } from "../../src/domain/natures.js";

vi.mock("../../src/features/team-ability/domain/ability-analysis.js", { spy: true });
vi.mock("../../src/features/team-ability/domain/speed-targets.js", { spy: true });
vi.mock("../../src/domain/stat.js", { spy: true });
vi.mock("../../src/features/team-ability/domain/ranking-tools.js", { spy: true });
beforeEach(() => vi.clearAllMocks());

const snapshot = {
  meta: { id: "phase1-fixture", rulesVersion: "fixture-v1" }, skills: [], traits: [], learnsets: [],
  spirits: [100, 67].map((speedValue, i) => ({
    id: `boss-${i}`, fullName: i ? "目标测试" : "当前测试", stage: "首领", sourceCategory: "首领形态", types: ["水"],
    raceStats: { hp: 100, physicalAttack: 100, magicalAttack: 100, physicalDefense: 100, magicalDefense: 100, speed: speedValue },
  })),
};
const configuration = {
  spiritId: "boss-0", natureId: "timid", skills: { four: [], single: null },
  displayIvs: { hp: 60, physicalAttack: 0, magicalAttack: 0, physicalDefense: 60, magicalDefense: 60, speed: 0 },
};

test.each(["keep", "at-least"])("displayed and applied defensive builds respect %s", (mode) => {
  const onApplyMember = vi.fn();
  render(<AbilityWorkbench configuration={configuration} snapshot={snapshot} source={{ kind: "member", index: 0 }} onApplyMember={onApplyMember} />);
  if (mode === "at-least") {
    const input = screen.getByRole("combobox", { name: "速度目标精灵" });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "目标测试" } });
    const option = screen.getAllByRole("option", { name: /目标测试/ }).find(node => node.textContent.includes("190"));
    expect(option).toBeTruthy();
    fireEvent.mouseDown(option);
    fireEvent.click(option);
    fireEvent.change(screen.getByLabelText("推荐速度约束"), { target: { value: mode } });
  }
  const builds = screen.getByRole("region", { name: "耐久方案对比" });
  const cards = within(builds).getAllByRole("article");
  if (mode === "keep") {
    expect(cards).toHaveLength(3);
    for (const card of cards) expect(card).toHaveTextContent("当前锁定条件下没有合法方案");
    expect(within(builds).queryByRole("button", { name: "应用到成员" })).not.toBeInTheDocument();
    expect(onApplyMember).not.toHaveBeenCalled();
    return;
  }
  const displayed = cards.map(card => Number(within(card).getAllByRole("definition")[0].textContent));
  for (const value of displayed) expect(value).toBeGreaterThanOrEqual(mode === "keep" ? 194 : 190);
  expect(onApplyMember).not.toHaveBeenCalled();
  fireEvent.click(within(cards[0]).getByRole("button", { name: "应用到成员" }));
  expect(onApplyMember).toHaveBeenCalledTimes(1);
  const applied = onApplyMember.mock.calls[0][0];
  const panel = stat.calculateAllPanelStats({ raceStats: snapshot.spirits[0].raceStats, displayIvs: applied.displayIvs, natureMultipliers: getNatureMultipliers(applied.natureId) });
  expect(panel.speed).toBe(displayed[0]);
});

test("explanation toggles and solver controls do not rebuild the target catalog", () => {
  render(<AbilityWorkbench configuration={configuration} snapshot={snapshot} source={{ kind: "member", index: 0 }} onApplyMember={vi.fn()} />);
  const targetCalls = speed.createSpeedTargets.mock.calls.length;
  const solverCalls = analysis.recommendDurabilityBuilds.mock.calls.length;
  fireEvent.click(screen.getByRole("button", { name: "查看计算依据" }));
  fireEvent.click(screen.getByRole("button", { name: "收起计算依据" }));
  expect(speed.createSpeedTargets).toHaveBeenCalledTimes(targetCalls);
  expect(analysis.recommendDurabilityBuilds).toHaveBeenCalledTimes(solverCalls);
  fireEvent.change(screen.getByLabelText("推荐速度约束"), { target: { value: "unlocked" } });
  expect(speed.createSpeedTargets).toHaveBeenCalledTimes(targetCalls);
  expect(analysis.recommendDurabilityBuilds.mock.calls.length).toBeGreaterThan(solverCalls);
});

test("opening durability does not mount unused speed views", () => {
  const close = vi.fn();
  const { rerender } = render(<RankingsPanel kind="durability" snapshot={snapshot} onClose={close} />);
  expect(speed.createSpeedTargets).not.toHaveBeenCalled();
  expect(rankingTools.createBaseSpeedGroups).not.toHaveBeenCalled();
  rerender(<RankingsPanel kind="speed" snapshot={snapshot} onClose={close} />);
  expect(speed.createSpeedTargets).toHaveBeenCalledTimes(2);
  expect(rankingTools.createBaseSpeedGroups).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "按种族速查" }));
  expect(rankingTools.createBaseSpeedGroups).toHaveBeenCalledTimes(1);
});

test("search and sort reuse panel calculations; a template change invalidates them", () => {
  render(<RankingsPanel kind="durability" snapshot={snapshot} onClose={vi.fn()} />);
  const panelCalls = stat.calculateAllPanelStats.mock.calls.length;
  fireEvent.change(screen.getByLabelText("搜索耐久榜精灵"), { target: { value: "当" } });
  fireEvent.change(screen.getByLabelText("搜索耐久榜精灵"), { target: { value: "当前" } });
  fireEvent.click(screen.getByRole("button", { name: "物理耐久" }));
  expect(stat.calculateAllPanelStats).toHaveBeenCalledTimes(panelCalls);
  fireEvent.click(screen.getByRole("button", { name: "筛选" }));
  fireEvent.change(screen.getByLabelText("耐久榜模板"), { target: { value: "standard-neutral-v1" } });
  expect(stat.calculateAllPanelStats.mock.calls.length).toBeGreaterThan(panelCalls);
});

test("speed ranking search reuses the profile catalog", () => {
  render(<RankingsPanel kind="speed" snapshot={snapshot} onClose={vi.fn()} />);
  const targetCalls = speed.createSpeedTargets.mock.calls.length;
  for (const query of ["当", "当前", "190", ""]) {
    fireEvent.change(screen.getByLabelText("搜索速度榜精灵"), { target: { value: query } });
  }
  expect(speed.createSpeedTargets).toHaveBeenCalledTimes(targetCalls);
  expect(rankingTools.createBaseSpeedGroups).not.toHaveBeenCalled();
});
