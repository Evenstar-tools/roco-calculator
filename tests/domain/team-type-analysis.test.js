import { describe, expect, test } from "vitest";
import { analyzeTeamDefensiveTypes } from "../../src/domain/team-type-analysis.js";

const spirits = [
  {
    asset: { localUrl: "/assets/spirits/water.png" },
    fullName: "水灵",
    id: "water",
    types: ["水"],
  },
  { fullName: "水地灵", id: "water-ground", types: ["水", "地"] },
  { fullName: "龙灵", id: "dragon", types: ["龙"] },
];

function row(result, type) {
  return result.rows.find((item) => item.type === type);
}

describe("analyzeTeamDefensiveTypes", () => {
  test("counts each member once using the final dual-type multiplier", () => {
    const result = analyzeTeamDefensiveTypes({
      members: [
        { spiritId: "water" },
        { spiritId: "water-ground" },
        { spiritId: "dragon" },
        null,
        null,
        null,
      ],
      spirits,
    });

    expect(row(result, "草")).toMatchObject({
      neutralCount: 0,
      resistanceCount: 1,
      weakCount: 2,
    });
    expect(row(result, "草").weakMembers).toEqual([
      expect.objectContaining({
        assetUrl: "/assets/spirits/water.png",
        name: "水灵",
        multiplier: 2,
        slotIndex: 0,
      }),
      expect.objectContaining({ name: "水地灵", multiplier: 3, slotIndex: 1 }),
    ]);
    expect(result).toMatchObject({ configuredCount: 3, skippedCount: 0 });
  });

  test("skips broken members and keeps every row count balanced", () => {
    const result = analyzeTeamDefensiveTypes({
      members: [
        { spiritId: "water" },
        { needsRepair: true, spiritId: "dragon" },
        { spiritId: "missing" },
        null,
      ],
      spirits,
    });

    expect(result).toMatchObject({ configuredCount: 1, skippedCount: 2 });
    result.rows.forEach((item) => {
      expect(
        item.weakCount +
          item.resistanceCount +
          item.neutralCount +
          item.immunityCount,
      ).toBe(result.configuredCount);
    });
  });

  test("uses the provided snapshot matrix", () => {
    const result = analyzeTeamDefensiveTypes({
      members: [{ spiritId: "water" }],
      spirits,
      typeChart: {
        matrix: [
          [1, 3],
          [0.25, 1],
        ],
        types: ["电", "水"],
      },
    });

    expect(row(result, "电")).toMatchObject({
      weakCount: 1,
      weakMembers: [expect.objectContaining({ multiplier: 3 })],
    });
  });

  test("sorts priority risks by weak count and preserves type order on ties", () => {
    const result = analyzeTeamDefensiveTypes({
      members: [{ spiritId: "water" }, { spiritId: "water-ground" }],
      spirits,
    });

    expect(result.riskRows[0].type).toBe("草");
    expect(result.riskRows.every((item) => item.weakCount > 0)).toBe(true);
  });
});
