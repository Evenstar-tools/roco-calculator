import { describe, expect, test } from "vitest";
import {
  analyzeTeamDefensiveTypes,
  analyzeTeamMatchups,
  analyzeTeamTypes,
} from "../../src/domain/team-type-analysis.js";

const spirits = [
  {
    asset: { localUrl: "/assets/spirits/water.png" },
    fullName: "水灵",
    id: "water",
    types: ["水"],
  },
  { fullName: "水地灵", id: "water-ground", types: ["水", "地"] },
  { fullName: "龙灵", id: "dragon", types: ["龙"] },
  { fullName: "首领灵", id: "boss", stage: "首领", types: ["光"] },
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

describe("analyzeTeamTypes", () => {
  test("returns defense cells and the best carried attack for every type", () => {
    const result = analyzeTeamTypes({
      members: [
        {
          skills: {
            four: ["fire-hit", "water-hit", "grass-status", null],
          },
          spiritId: "water",
        },
      ],
      skills: [
        {
          category: "physical",
          id: "fire-hit",
          name: "火焰冲击",
          type: "火",
        },
        {
          category: "magical",
          id: "water-hit",
          name: "水之波纹",
          type: "水",
        },
        {
          category: "status",
          id: "grass-status",
          name: "催眠粉",
          type: "草",
        },
      ],
      spirits,
    });

    const member = result.members[0];
    expect(member.defense.find(({ type }) => type === "草")).toMatchObject({
      multiplier: 2,
      type: "草",
    });
    expect(member.offense.find(({ type }) => type === "草")).toMatchObject({
      multiplier: 2,
      skillId: "fire-hit",
      skillName: "火焰冲击",
      skillType: "火",
      type: "草",
    });
  });

  test("adds Wish Power from the configured elemental bloodline only when enabled", () => {
    const input = {
      members: [
        {
          bloodlineType: "fire",
          skills: { four: ["water-hit", null, null, null] },
          spiritId: "water",
        },
      ],
      skills: [
        {
          category: "magical",
          id: "water-hit",
          name: "水之波纹",
          type: "水",
        },
      ],
      spirits,
    };

    const withoutWish = analyzeTeamTypes(input);
    const withWish = analyzeTeamTypes({ ...input, includeWishPower: true });

    expect(
      withoutWish.members[0].offense.find(({ type }) => type === "草"),
    ).toMatchObject({ multiplier: 0.5, skillName: "水之波纹" });
    expect(
      withWish.members[0].offense.find(({ type }) => type === "草"),
    ).toMatchObject({
      multiplier: 2,
      skillName: "愿力冲击",
      skillType: "火",
      sourceKind: "wish-power",
    });
  });

  test("resolves a boss bloodline from its legal Wish Power replacement", () => {
    const result = analyzeTeamTypes({
      includeWishPower: true,
      learnsets: [
        {
          skillIds: ["calculator_wish_power_bug"],
          spiritId: "boss",
        },
      ],
      members: [
        {
          bloodlineType: "boss",
          skills: { four: [null, null, null, null] },
          spiritId: "boss",
        },
      ],
      skills: [
        {
          category: "dual",
          id: "calculator_wish_power_bug",
          name: "愿力冲击",
          type: "虫",
        },
      ],
      spirits,
    });

    expect(
      result.members[0].offense.find(({ type }) => type === "恶"),
    ).toMatchObject({
      multiplier: 2,
      skillId: "calculator_wish_power_bug",
      skillName: "愿力冲击",
      skillType: "虫",
      sourceKind: "wish-power",
    });
  });

  test("uses the boss bloodline default for a legacy boss member", () => {
    const result = analyzeTeamTypes({
      includeWishPower: true,
      learnsets: [
        {
          skillIds: ["calculator_wish_power_bug"],
          spiritId: "boss",
        },
      ],
      members: [
        {
          skills: { four: [null, null, null, null] },
          spiritId: "boss",
        },
      ],
      skills: [
        {
          category: "dual",
          id: "calculator_wish_power_bug",
          name: "愿力冲击",
          type: "虫",
        },
      ],
      spirits,
    });

    expect(
      result.members[0].offense.find(({ type }) => type === "恶"),
    ).toMatchObject({
      multiplier: 2,
      skillId: "calculator_wish_power_bug",
      sourceKind: "wish-power",
    });
  });
});

describe("analyzeTeamMatchups", () => {
  test("traces each 6x6 cell to the best carried skill", () => {
    const result = analyzeTeamMatchups({
      attackers: [
        {
          skills: { four: ["fire-hit", "water-hit", null, null] },
          spiritId: "water",
        },
      ],
      defenders: [
        {
          skills: { four: [] },
          spiritId: "dragon",
        },
      ],
      skills: [
        {
          category: "physical",
          id: "fire-hit",
          name: "火焰冲击",
          type: "火",
        },
        {
          category: "magical",
          id: "water-hit",
          name: "水之波纹",
          type: "水",
        },
      ],
      spirits,
    });

    expect(result.cells[0][0]).toMatchObject({
      attackerSlotIndex: 0,
      defenderSlotIndex: 0,
      multiplier: 0.5,
      skillId: "fire-hit",
      skillName: "火焰冲击",
    });
  });
});
