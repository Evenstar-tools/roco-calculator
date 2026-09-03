import { describe, expect, test } from "vitest";
import { calculateDurability } from "../../src/features/team-ability/domain/durability.js";
import { getNatureMultipliers } from "../../src/domain/natures.js";
import { calculateAllPanelStats } from "../../src/domain/stat.js";

describe("calculateDurability", () => {
  test("calculates the workbook golden durability values without rounding raw data", () => {
    expect(
      calculateDurability({
        maxHp: 366,
        physicalDefense: 172,
        magicalDefense: 221,
      }),
    ).toEqual({
      formulaVersion: "panel-durability-v1",
      raw: {
        physical: 62952,
        magical: 80886,
        combined: 35400.48854961832,
      },
      display: {
        physical: 62952,
        magical: 80886,
        combined: 35400,
      },
    });
  });

  test.each([
    ["missing HP", undefined, 172, 221],
    ["zero defense", 366, 0, 221],
    ["negative defense", 366, 172, -1],
    ["NaN", Number.NaN, 172, 221],
    ["infinity", 366, Number.POSITIVE_INFINITY, 221],
  ])("rejects %s with INVALID_PANEL_STAT", (_label, maxHp, physicalDefense, magicalDefense) => {
    expect(() =>
      calculateDurability({ maxHp, physicalDefense, magicalDefense }),
    ).toThrow(
      expect.objectContaining({
        code: "INVALID_PANEL_STAT",
      }),
    );
  });

  test.each([
    ["HP nature", 419, 172, 221, 72068, 92599, 40526.78880407125, 40527],
    ["physical-defense nature", 366, 196, 221, 71736, 80886, 38018.359712230216, 38018],
    ["magical-defense nature", 366, 172, 255, 62952, 93330, 37594.28571428572, 37594],
    ["zero durability investments", 315, 139, 188, 43785, 59220, 25173.02752293578, 25173],
    ["equal defenses", 400, 200, 200, 80000, 80000, 40000, 40000],
    ["Giant Drum Elephant regression", 510, 283, 181, 144330, 92310, 56301.14224137931, 56301],
  ])(
    "matches the %s golden row",
    (_label, maxHp, physicalDefense, magicalDefense, physical, magical, combinedRaw, combinedDisplay) => {
      const result = calculateDurability({
        maxHp,
        physicalDefense,
        magicalDefense,
      });

      expect(result.raw.physical).toBe(physical);
      expect(result.raw.magical).toBe(magical);
      expect(result.raw.combined).toBeCloseTo(combinedRaw, 10);
      expect(result.display.combined).toBe(combinedDisplay);
      if (_label === "Giant Drum Elephant regression") {
        expect(result.raw.combined).not.toBeCloseTo(67503.178, 3);
      }
    },
  );

  test("matches every cell in the workbook 4-nature by 8-investment golden grid", () => {
    const raceStats = {
      hp: 85,
      magicalAttack: 86,
      magicalDefense: 116,
      physicalAttack: 84,
      physicalDefense: 72,
      speed: 95,
    };
    const investmentRows = [
      [60, 60, 60],
      [60, 60, 0],
      [60, 0, 60],
      [0, 60, 60],
      [60, 0, 0],
      [0, 60, 0],
      [0, 0, 60],
      [0, 0, 0],
    ];
    const grids = {
      grounded: [
        [72068, 92599, 40527],
        [72068, 78772, 37636],
        [58241, 92599, 35754],
        [61576, 79118, 34627],
        [58241, 78772, 33484],
        [61576, 67304, 32156],
        [49762, 79118, 30548],
        [49762, 67304, 28609],
      ],
      relaxed: [
        [71736, 80886, 38018],
        [71736, 68808, 35121],
        [57462, 80886, 33596],
        [61740, 69615, 32721],
        [57462, 68808, 31313],
        [61740, 59220, 30227],
        [49455, 69615, 28914],
        [49455, 59220, 26949],
      ],
      cautious: [
        [62952, 93330, 37594],
        [62952, 79056, 35045],
        [50874, 93330, 32926],
        [54180, 80325, 32356],
        [50874, 79056, 30954],
        [54180, 68040, 30162],
        [43785, 80325, 28338],
        [43785, 68040, 26641],
      ],
      neutral: [
        [62952, 80886, 35400],
        [62952, 68808, 32875],
        [50874, 80886, 31231],
        [54180, 69615, 30468],
        [50874, 68808, 29249],
        [54180, 59220, 28294],
        [43785, 69615, 26879],
        [43785, 59220, 25173],
      ],
    };

    for (const [natureId, expectedRows] of Object.entries(grids)) {
      const actualRows = investmentRows.map(
        ([hp, physicalDefense, magicalDefense]) => {
          const panel = calculateAllPanelStats({
            displayIvs: {
              hp,
              magicalAttack: 0,
              magicalDefense,
              physicalAttack: 0,
              physicalDefense,
              speed: 0,
            },
            natureMultipliers: getNatureMultipliers(natureId),
            raceStats,
          });
          const { display } = calculateDurability({
            magicalDefense: panel.magicalDefense,
            maxHp: panel.hp,
            physicalDefense: panel.physicalDefense,
          });
          return [display.physical, display.magical, display.combined];
        },
      );
      expect(actualRows, natureId).toEqual(expectedRows);
    }
  });
});
