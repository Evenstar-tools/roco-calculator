import { render, screen, within } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import BaseSpeedOverview from "../../src/components/BaseSpeedOverview.jsx";
import * as speed from "../../src/features/team-ability/domain/speed-targets.js";

vi.mock("../../src/features/team-ability/domain/speed-targets.js", { spy: true });
beforeEach(() => vi.clearAllMocks());

const snapshot = {
  meta: { id: "base-speed-cache-fixture" },
  spirits: [
    { id: "cache-a", fullName: "缓存甲", dexNo: 1, aliases: ["甲别名"] },
    { id: "cache-b", fullName: "缓存乙", dexNo: 2 },
  ].map(spirit => ({
    ...spirit, stage: "首领", sourceCategory: "首领形态",
    raceStats: { hp: 100, physicalAttack: 100, physicalDefense: 100, magicalAttack: 100, magicalDefense: 100, speed: 100 },
  })),
};
const onDetail = vi.fn();
const onLocate = vi.fn();
const onQueryChange = vi.fn();
const view = (query, data = snapshot) => <BaseSpeedOverview snapshot={data} query={query} onQueryChange={onQueryChange} onDetail={onDetail} onLocate={onLocate} />;

test("base-speed search reuses computed profiles and filters members within a shared speed tier", () => {
  const { rerender } = render(view(""));
  const initialCalls = speed.createSpeedTargets.mock.calls.length;
  expect(initialCalls).toBe(3);
  for (const query of ["甲", "甲别名", "100", ""]) rerender(view(query));
  expect(speed.createSpeedTargets).toHaveBeenCalledTimes(initialCalls);
  rerender(view("甲别名"));
  const table = screen.getByRole("table", { name: "种族速度档位表" });
  expect(within(table).getByRole("button", { name: "查看缓存甲标准速度详情" })).toBeInTheDocument();
  expect(within(table).queryByRole("button", { name: "查看缓存乙标准速度详情" })).not.toBeInTheDocument();
  rerender(view("不存在"));
  expect(screen.getByText("没有匹配的精灵或种族速度。")).toBeInTheDocument();
  rerender(view(""));
  expect(screen.getByRole("button", { name: "查看缓存乙标准速度详情" })).toBeInTheDocument();
  expect(speed.createSpeedTargets).toHaveBeenCalledTimes(initialCalls);
});

test("base-speed cache invalidates on a new snapshot, without mutating the old groups", () => {
  const before = structuredClone(snapshot);
  const { rerender } = render(view("100"));
  const next = { ...snapshot, spirits: snapshot.spirits.map(spirit => ({ ...spirit, raceStats: { ...spirit.raceStats, speed: 120 } })) };
  rerender(view("100", next));
  expect(speed.createSpeedTargets).toHaveBeenCalledTimes(6);
  expect(screen.getByText("没有匹配的精灵或种族速度。")).toBeInTheDocument();
  rerender(view("120", next));
  expect(speed.createSpeedTargets).toHaveBeenCalledTimes(6);
  expect(screen.getByRole("button", { name: "查看缓存甲标准速度详情" })).toBeInTheDocument();
  expect(snapshot).toEqual(before);
});
