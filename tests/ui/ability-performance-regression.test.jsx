import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { AbilityWorkbench } from "../../src/components/AbilityWorkbench.jsx";
import RankingsPanel from "../../src/components/RankingsPanel.jsx";
import * as speed from "../../src/features/team-ability/domain/speed-targets.js";
import * as ranking from "../../src/features/team-ability/domain/durability-ranking.js";
import * as analysis from "../../src/features/team-ability/domain/ability-analysis.js";
import { calculateAllPanelStats } from "../../src/domain/stat.js";
import { getNatureMultipliers } from "../../src/domain/natures.js";

vi.mock("../../src/features/team-ability/domain/speed-targets.js", async (original) => {
  const module = await original();
  return { ...module, createSpeedTargets: vi.fn(module.createSpeedTargets), createSpeedSpecialTargets: vi.fn(module.createSpeedSpecialTargets) };
});
vi.mock("../../src/features/team-ability/domain/durability-ranking.js", async (original) => {
  const module = await original();
  return { ...module, createDurabilityRanking: vi.fn(module.createDurabilityRanking) };
});
vi.mock("../../src/features/team-ability/domain/ability-analysis.js", async (original) => {
  const module = await original();
  return { ...module, recommendDurabilityBuilds: vi.fn(module.recommendDurabilityBuilds) };
});
afterEach(() => vi.clearAllMocks());

const raceStats = { hp: 100, physicalAttack: 100, physicalDefense: 100, magicalAttack: 100, magicalDefense: 100, speed: 100 };
const snapshot = { meta: { id: "memo-fixture" }, skills: [], spirits: [
  { id: "boss-1", fullName: "测试甲", stage: "首领", sourceCategory: "首领形态", types: ["水"], raceStats },
  { id: "boss-2", fullName: "测试乙", stage: "首领", sourceCategory: "首领形态", types: ["火"], raceStats: { ...raceStats, speed: 120 } },
] };
const configuration = { spiritId: "boss-1", natureId: "neutral", skills: { four: [], single: null },
  displayIvs: { hp: 60, physicalAttack: 0, physicalDefense: 60, magicalAttack: 0, magicalDefense: 60, speed: 0 } };

test("three previews share one ranking and disclosure does not rebuild calculations", () => {
  render(<AbilityWorkbench configuration={configuration} snapshot={snapshot} source={{ kind: "member", index: 0 }} onApplyMember={vi.fn()} />);
  expect(ranking.createDurabilityRanking).toHaveBeenCalledTimes(1);
  const speedCalls = speed.createSpeedTargets.mock.calls.length;
  const specialCalls = speed.createSpeedSpecialTargets.mock.calls.length;
  const solverCalls = analysis.recommendDurabilityBuilds.mock.calls.length;
  fireEvent.click(screen.getByRole("button", { name: "查看计算依据" }));
  expect(screen.getByText(/展示值统一/)).toBeInTheDocument();
  expect(speed.createSpeedTargets).toHaveBeenCalledTimes(speedCalls);
  expect(speed.createSpeedSpecialTargets).toHaveBeenCalledTimes(specialCalls);
  expect(analysis.recommendDurabilityBuilds).toHaveBeenCalledTimes(solverCalls);
  expect(ranking.createDurabilityRanking).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByText("手动微调"));
  fireEvent.click(screen.getByRole("combobox", { name: "能力分析性格" }));
  fireEvent.click(screen.getByRole("treeitem", { name: "生命增益 +20%" }));
  fireEvent.click(screen.getByRole("treeitem", { name: "踏实（+生命 -速度）" }));
  expect(analysis.recommendDurabilityBuilds.mock.calls.length).toBeGreaterThan(solverCalls);
  expect(speed.createSpeedTargets).toHaveBeenCalledTimes(speedCalls);
  expect(ranking.createDurabilityRanking).toHaveBeenCalledTimes(1);
});

test("search and metric changes reuse panels; unused speed tool stays unmounted", () => {
  render(<RankingsPanel kind="durability" snapshot={snapshot} onClose={vi.fn()} />);
  expect(speed.createSpeedTargets).not.toHaveBeenCalled();
  expect(ranking.createDurabilityRanking).toHaveBeenCalledTimes(1);
  fireEvent.change(screen.getByLabelText("搜索耐久榜精灵"), { target: { value: "测试甲" } });
  fireEvent.click(screen.getByRole("button", { name: "物理耐久" }));
  expect(ranking.createDurabilityRanking).toHaveBeenCalledTimes(1);
  expect(within(screen.getByRole("table", { name: "标准耐久完整榜" })).getAllByRole("row")).toHaveLength(2);
  fireEvent.change(screen.getByLabelText("承受属性"), { target: { value: "火" } });
  expect(ranking.createDurabilityRanking).toHaveBeenCalledTimes(2);
});

test("visiting speed delays base overview while visited tools keep independent state", () => {
  const onClose = vi.fn();
  const { container, rerender } = render(<RankingsPanel kind="speed" snapshot={snapshot} onClose={onClose} />);
  expect(container.querySelector('[aria-label="种族速度总览"]')).toBeNull();
  expect(ranking.createDurabilityRanking).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "按种族速查" }));
  fireEvent.change(screen.getByLabelText("搜索种族总览"), { target: { value: "测试甲" } });
  rerender(<RankingsPanel kind="durability" snapshot={snapshot} onClose={onClose} />);
  fireEvent.change(screen.getByLabelText("搜索耐久榜精灵"), { target: { value: "测试乙" } });
  rerender(<RankingsPanel kind={null} snapshot={snapshot} onClose={onClose} />);
  rerender(<RankingsPanel kind="speed" snapshot={snapshot} onClose={onClose} />);
  expect(screen.getByLabelText("搜索种族总览")).toHaveValue("测试甲");
  rerender(<RankingsPanel kind="durability" snapshot={snapshot} onClose={onClose} />);
  expect(screen.getByLabelText("搜索耐久榜精灵")).toHaveValue("测试乙");
});

test("timid triple-defense keep cannot apply a slower nature; unlocked remains explicit", () => {
  const onApplyMember = vi.fn();
  render(<AbilityWorkbench configuration={{ ...configuration, natureId: "timid" }} snapshot={snapshot} source={{ kind: "member", index: 0 }} onApplyMember={onApplyMember} />);
  const builds = screen.getByRole("region", { name: "耐久方案对比" });
  expect(within(builds).queryByRole("button", { name: "应用到成员" })).not.toBeInTheDocument();
  expect(onApplyMember).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("推荐速度约束"), { target: { value: "unlocked" } });
  fireEvent.click(within(builds).getAllByRole("button", { name: "应用到成员" })[0]);
  const applied = onApplyMember.mock.calls[0][0];
  expect(applied.natureId).toBe("silent");
  const panel = calculateAllPanelStats({ raceStats, displayIvs: applied.displayIvs, natureMultipliers: getNatureMultipliers(applied.natureId) });
  expect(panel.speed).toBe(170);
});
