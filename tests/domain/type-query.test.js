import { describe, expect, test } from "vitest";
import snapshot from "../../data/snapshots/current.json";
import { ELEMENT_TYPES, getTypeMultiplier } from "../../src/domain/type-chart.js";
import { buildTypeQuery, findFinalDualTypeSpirits, toggleQueryType } from "../../src/features/type-query/model.js";
import { resolveSpiritFormRole } from "../../src/features/team-ability/domain/spirit-form-role.js";

const chart = snapshot.typeChart;
const row = (rows, type) => rows.find((entry) => entry.type === type);

describe("属性查询", () => {
  test("空选择没有虚假的常规倍率，去重并限制两种合法属性", () => {
    expect(buildTypeQuery([], chart)).toEqual({ types: [], defense: [], offense: [] });
    expect(buildTypeQuery(["水", "水", "不存在", "地", "火"], chart).types).toEqual(["水", "地"]);
    expect(toggleQueryType(["水", "地"], "火")).toEqual(["水", "地"]);
    expect(toggleQueryType(["水", "地"], "水")).toEqual(["地"]);
    expect(toggleQueryType([], "水")).toEqual(["水"]);
    expect(toggleQueryType([], "不存在")).toEqual([]);
  });
  test("展示内核双弱点3倍、双抗性四分之一和抵消关系", () => {
    const result = buildTypeQuery(["水", "地"], chart);
    expect(row(result.defense, "草")).toMatchObject({ multiplier: 3, parts: [{ type: "水", multiplier: 2 }, { type: "地", multiplier: 2 }] });
    expect(row(result.defense, "火").multiplier).toBe(0.25);
    expect(row(result.defense, "电").multiplier).toBe(1);
  });
  test("进攻取较优属性，而非叠乘，并提供两系来源", () => {
    const result = buildTypeQuery(["水", "地"], chart);
    expect(row(result.offense, "火")).toMatchObject({ multiplier: 2, parts: [{ type: "水", multiplier: 2 }, { type: "地", multiplier: 2 }] });
    expect(row(result.offense, "龙").multiplier).toBe(1);
    expect(row(result.offense, "草").multiplier).toBe(0.5);
  });
  test("传入矩阵中的免疫按零处理，不伪造免疫", () => {
    const custom = structuredClone(chart);
    custom.matrix[0][0] = 0;
    expect(row(buildTypeQuery(["普通"], custom).defense, "普通").multiplier).toBe(0);
    expect(row(buildTypeQuery(["普通"], custom).offense, "普通").multiplier).toBe(0);
    expect(buildTypeQuery(["水", "地"], chart).defense.some(({ multiplier }) => multiplier === 0)).toBe(false);
  });
  test("双属性精灵只展示已确认的最终形态", () => {
    const spiritFilterRevision = snapshot.meta?.revisions?.spiritFilter;
    const matches = findFinalDualTypeSpirits(snapshot.spirits, ["地", "冰"], { spiritFilterRevision });
    expect(matches.map(({ fullName }) => fullName)).toEqual(["獠牙猪"]);
    expect(matches.every((spirit) => resolveSpiritFormRole(spirit, { spiritFilterRevision }).formRole === "final")).toBe(true);
    expect(findFinalDualTypeSpirits(snapshot.spirits, ["地"])).toEqual([]);
  });
  const combinations = ELEMENT_TYPES.flatMap((type, i) => [[type], ...ELEMENT_TYPES.slice(i + 1).map((other) => [type, other])]);
  test.each(combinations.map((types) => [types.join("/"), types]))("%s：18行无遗漏且与内核一致，选中顺序不影响结果", (_, types) => {
    const result = buildTypeQuery(types, chart);
    const reversed = buildTypeQuery([...types].reverse(), chart);
    for (const side of ["defense", "offense"]) {
      expect(result[side].map(({ type }) => type)).toEqual(ELEMENT_TYPES);
      expect(result[side].map(({ multiplier }) => multiplier)).toEqual(reversed[side].map(({ multiplier }) => multiplier));
    }
    for (const type of ELEMENT_TYPES) {
      expect(row(result.defense, type).multiplier).toBe(getTypeMultiplier(type, types, chart));
      expect(row(result.offense, type).multiplier).toBe(Math.max(...types.map((attack) => getTypeMultiplier(attack, [type], chart))));
    }
  });
});
