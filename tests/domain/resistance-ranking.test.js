import { describe, expect, test } from "vitest";
import { createDurabilityRanking } from "../../src/features/team-ability/domain/durability-ranking.js";

const spirits = [["quarter", ["水", "龙"]], ["half", ["水"]], ["normal", ["火"]], ["double", ["草"]], ["triple", ["草", "冰"]], ["unknown", []]].map(([id, types], index) => ({
  id, fullName: id, dexNo: index, types, stage: "首领", sourceCategory: "首领形态",
  raceStats: { hp: 100, physicalAttack: 100, magicalAttack: 100, physicalDefense: 100, magicalDefense: 100, speed: 100 },
}));
const rank = (options = {}) => createDurabilityRanking({ spirits, attackType: "火", ...options });

describe("属性耐久排行", () => {
  test("以双属性最终倍率筛选，基础值不变，有效值除以倍率", () => {
    const result = rank({ multipliers: [0.25, 0.5] });
    expect(result.rows.map((r) => r.spiritId)).toEqual(["quarter", "half"]);
    for (const row of result.rows) expect(row.durability.display.combined).toBe(Math.round(row.baseDurability.raw.combined / row.multiplier));
  });
  test("空选择就是空结果；任意并集；搜索保留筛选前名次", () => {
    expect(rank({ multipliers: [] }).rows).toEqual([]);
    expect(rank({ multipliers: [0.5, 2] }).rows.map((r) => r.spiritId)).toEqual(["half", "double"]);
    expect(rank({ multipliers: [0.5, 2], query: "double" }).rows[0].filteredRank.combined).toBe(2);
  });
  test("全选排除未知属性，双弱为3倍，不限属性保持原榜", () => {
    expect(rank().rows.map((r) => r.multiplier)).toEqual([0.25, 0.5, 1, 2, 3]);
    expect(rank().excluded.some((r) => r.reason === "UNKNOWN_DEFENSIVE_TYPE")).toBe(true);
    expect(rank({ attackType: "" }).rows).toHaveLength(6);
  });
  test("免疫单列，不产生无穷值或参与有限排名", () => {
    const result = rank({ typeChart: { types: ["火", "水", "龙", "草", "冰"], matrix: [[1, 0, 1, 2, 2]] }, multipliers: [0, 1, 2, 3] });
    expect(result.immuneRows.map((r) => r.spiritId)).toEqual(["quarter", "half"]);
    expect(result.rows.every((r) => Number.isFinite(r.durability.raw.combined))).toBe(true);
  });
});
