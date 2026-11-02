import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import BidirectionalQuery from "../../src/features/skill-query/BidirectionalQuery.jsx";
import SpiritStatRadar from "../../src/features/skill-query/SpiritStatRadar.jsx";

vi.mock("../../src/data/trait-icons.js", () => ({ getTraitIconUrl: trait => trait.iconUrl ?? null }));

const season = {
  id: "S3", skills: [], learnsets: [],
  spirits: [{ id: "s1", fullName: "第一形态", familyId: "family", traitIds: ["t1"] },
    { id: "s2", fullName: "第二形态", familyId: "family", traitIds: ["t2", "t3"] }],
  traits: [{ id: "t1", name: "原始特性", description: "本赛季效果", iconUrl: "/assets/traits/original.png" },
    { id: "t2", name: "进化特性", description: "条件满足时触发。\n持续两回合。" },
    { id: "t3", name: "补充特性", description: "" }],
};

const stats = hp => ({ hp, physicalAttack: 100, magicalAttack: 80, physicalDefense: 110, magicalDefense: 90, speed: 60 });

test("六维图只显示种族值图标与数值，生命在上速度在下，物理在左魔法在右", () => {
  render(<SpiritStatRadar spirit={{ raceStats: stats(180) }} />);
  const chart = screen.getByRole("figure", { name: "种族值" });
  expect(chart.textContent).toBe("180809060110100");
  expect(within(chart).getByTitle("生命")).toHaveStyle({ left: "50%", top: "6%" });
  expect(parseFloat(within(chart).getByTitle("速度").style.left)).toBeCloseTo(50);
  expect(within(chart).getByTitle("速度")).toHaveStyle({ top: "94%" });
  expect(parseFloat(within(chart).getByTitle("物攻").style.left)).toBeLessThan(50);
  expect(parseFloat(within(chart).getByTitle("魔攻").style.left)).toBeGreaterThan(50);
  expect(chart.querySelectorAll("img")).toHaveLength(6);
  expect(chart.querySelector(".stat-radar__values").getAttribute("points").split(" ")).toHaveLength(6);
  expect(chart.querySelectorAll(".stat-radar__grid polygon")).toHaveLength(3);
});

test("精灵形态和赛季切换后六维图读所选记录，不混入最新快照", () => {
  const current = { ...season, spirits: season.spirits.map((entry, i) => ({ ...entry, raceStats: stats(i ? 160 : 120) })) };
  const { rerender } = render(<BidirectionalQuery season={current} initialSpiritId="s1" spirits={[{ id: "s1", raceStats: stats(999) }]} />);
  expect(screen.getByTitle("生命")).toHaveTextContent("120");
  const previous = screen.getByRole("figure").querySelector(".stat-radar__values").getAttribute("points");
  fireEvent.change(screen.getByLabelText("精灵形态"), { target: { value: "s2" } });
  expect(screen.getByTitle("生命")).toHaveTextContent("160");
  expect(screen.getByRole("figure").querySelector(".stat-radar__values").getAttribute("points")).not.toBe(previous);
  rerender(<BidirectionalQuery season={{ ...current, id: "S4", spirits: current.spirits.map(entry => ({ ...entry, raceStats: stats(180) })) }} />);
  expect(screen.getByTitle("生命")).toHaveTextContent("180");
});

test.each([
  {}, { raceStats: { hp: 100 } }, { raceStats: stats(NaN) },
  { raceStats: stats(100), previewIdentity: { raceStatsPlaceholder: true } },
  { raceStats: stats(100), calculationStatus: "pending-race-stats" },
])("缺失或占位资料不伪造六维图 %j", spirit => {
  render(<SpiritStatRadar spirit={spirit} />);
  expect(screen.queryByRole("figure")).not.toBeInTheDocument();
});

test("精灵详情读取所选赛季的特性，切换形态更新图标和完整描述，不拿当前快照覆盖历史", () => {
  render(<BidirectionalQuery season={season} initialSpiritId="s1" spirits={[
    { id: "s1", traitName: "新赛季同名特性", traitDescription: "不应覆盖历史的新版效果" },
  ]} />);
  const traits = screen.getByRole("region", { name: "精灵特性" });
  expect(within(traits).getByRole("heading", { name: "原始特性" })).toBeInTheDocument();
  expect(within(traits).getByText("本赛季效果")).toBeInTheDocument();
  expect(screen.queryByText("不应覆盖历史的新版效果")).not.toBeInTheDocument();
  expect(traits.querySelector("img")).toHaveAttribute("src", "/assets/traits/original.png");
  fireEvent.error(traits.querySelector("img"));
  expect(traits.querySelector("img")).toBeNull();
  expect(within(traits).getByText("本赛季效果")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("精灵形态"), { target: { value: "s2" } });
  expect(within(traits).getByRole("heading", { name: "进化特性" })).toBeInTheDocument();
  expect(within(traits).getByText(/持续两回合/)).toHaveTextContent("条件满足时触发。 持续两回合。");
  expect(within(traits).getByText("特性描述待确认")).toBeInTheDocument();
  expect(within(traits).queryByText("原始特性")).not.toBeInTheDocument();
});

test("没有特性资料时不套用其它精灵特性或伪造图标", () => {
  render(<BidirectionalQuery season={{ ...season, traits: [] }} initialSpiritId="s1" />);
  expect(screen.queryByRole("region", { name: "精灵特性" })).not.toBeInTheDocument();
});
