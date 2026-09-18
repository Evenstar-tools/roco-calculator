import { readFileSync, writeFileSync } from "node:fs";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterAll, beforeEach, expect, test, vi } from "vitest";
import { AbilityWorkbench } from "../../src/components/AbilityWorkbench.jsx";
import RankingsPanel from "../../src/components/RankingsPanel.jsx";
import BaseSpeedOverview from "../../src/components/BaseSpeedOverview.jsx";
import * as analysis from "../../src/features/team-ability/domain/ability-analysis.js";
import * as ranking from "../../src/features/team-ability/domain/durability-ranking.js";
import * as speed from "../../src/features/team-ability/domain/speed-targets.js";
import * as stat from "../../src/domain/stat.js";
import * as rankingTools from "../../src/features/team-ability/domain/ranking-tools.js";

vi.mock("../../src/features/team-ability/domain/ability-analysis.js", { spy: true });
vi.mock("../../src/features/team-ability/domain/durability-ranking.js", { spy: true });
vi.mock("../../src/features/team-ability/domain/speed-targets.js", { spy: true });
vi.mock("../../src/domain/stat.js", { spy: true });
vi.mock("../../src/features/team-ability/domain/ranking-tools.js", { spy: true });

const snapshot = JSON.parse(readFileSync("public/data/runtime.json", "utf8"));
const spirit = snapshot.spirits.find(entry => entry.stage === "首领" && entry.sourceCategory === "首领形态");
const configuration = {
  spiritId: spirit.id, natureId: "neutral", skills: { four: [], single: null },
  displayIvs: { hp: 60, physicalAttack: 0, magicalAttack: 0, physicalDefense: 60, magicalDefense: 60, speed: 0 },
};
const results = { snapshotId: snapshot.meta.id, spirits: snapshot.spirits.length };
const counters = () => ({
  ranking: ranking.createDurabilityRanking.mock.calls.length,
  panels: stat.calculateAllPanelStats.mock.calls.length,
  singleStats: stat.calculatePanelStat.mock.calls.length,
  targets: speed.createSpeedTargets.mock.calls.length,
  specialTargets: speed.createSpeedSpecialTargets.mock.calls.length,
  solver: analysis.recommendDurabilityBuilds.mock.calls.length,
  baseSpeed: rankingTools.createBaseSpeedGroups.mock.calls.length,
});
const difference = (before, after) => Object.fromEntries(Object.keys(after).map(key => [key, after[key] - before[key]]));
beforeEach(() => vi.clearAllMocks());
afterAll(() => {
  if (process.env.PHASE1_MEASURE_OUTPUT) writeFileSync(process.env.PHASE1_MEASURE_OUTPUT, JSON.stringify(results, null, 2) + "\n", "utf8");
});

test("measure workbench calculation counts against the same runtime snapshot", () => {
  render(<AbilityWorkbench configuration={configuration} snapshot={snapshot} source={{ kind: "member", index: 0 }} onApplyMember={vi.fn()} />);
  const initial = counters();
  fireEvent.click(screen.getByRole("button", { name: "查看计算依据" }));
  fireEvent.click(screen.getByRole("button", { name: "收起计算依据" }));
  const afterDisclosure = counters();
  fireEvent.change(screen.getByLabelText("能力分析性格"), { target: { value: "grounded" } });
  results.workbench = {
    initial, disclosureTwoClicks: difference(initial, afterDisclosure),
    natureChange: difference(afterDisclosure, counters()),
  };
  expect(screen.getByRole("region", { name: "能力分析", exact: true })).toBeInTheDocument();
});

test("measure ranking search and unused view initialization counts", () => {
  render(<RankingsPanel kind="durability" snapshot={snapshot} onClose={vi.fn()} />);
  const initial = counters();
  for (const query of ["迪", "迪莫", ""]) fireEvent.change(screen.getByLabelText("搜索耐久榜精灵"), { target: { value: query } });
  fireEvent.click(screen.getByRole("button", { name: "物理耐久", exact: true }));
  const table = screen.getByRole("table", { name: "标准耐久完整榜" });
  results.ranking = { initial, threeQueriesAndSort: difference(initial, counters()), rows: table.querySelectorAll("tbody tr").length };
  expect(results.ranking.rows).toBeGreaterThan(0);
});

test("measure base-speed search against the same runtime snapshot", () => {
  const props = { snapshot, onQueryChange: vi.fn(), onDetail: vi.fn(), onLocate: vi.fn() };
  const { rerender } = render(<BaseSpeedOverview {...props} query="" />);
  const initial = counters();
  for (const query of ["迪", "迪莫", "100", ""]) rerender(<BaseSpeedOverview {...props} query={query} />);
  results.baseSpeed = { initial, fourQueries: difference(initial, counters()) };
  expect(screen.getByRole("table", { name: "种族速度档位表" })).toBeInTheDocument();
});
