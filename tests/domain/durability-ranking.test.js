import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import {
  createDurabilityRanking,
  STANDARD_DURABILITY_TEMPLATES,
} from "../../src/features/team-ability/domain/durability-ranking.js";

function spirit(overrides = {}) {
  return {
    baseName: "测风蝉",
    dexNo: "9001",
    fullName: "测风蝉",
    id: "spirit_8735efa1d0793f6a",
    raceStats: {
      hp: 100,
      magicalAttack: 100,
      magicalDefense: 100,
      physicalAttack: 100,
      physicalDefense: 100,
      speed: 100,
      total: 600,
    },
    sourceCategory: "S4前瞻",
    stage: "二阶",
    types: ["翼", "机械"],
    ...overrides,
  };
}

function bossSpirit({ dexNo, fullName, hp, id }) {
  return spirit({
    dexNo,
    fullName,
    id,
    raceStats: {
      ...spirit().raceStats,
      hp,
      total: 500 + hp,
    },
    sourceCategory: "首领形态",
    stage: "首领",
  });
}

describe("createDurabilityRanking", () => {
  test("calculates an eligible final form with the shared panel and durability formulas", () => {
    const ranking = createDurabilityRanking({ spirits: [spirit()] });

    expect(ranking.template).toMatchObject({
      id: "standard-hp-v1",
      level: 60,
      natureId: "grounded",
    });
    expect(ranking.formRoleManifestVersion).toBe("form-role-v1");
    expect(ranking.rows).toHaveLength(1);
    expect(ranking.rows[0]).toMatchObject({
      durability: {
        display: {
          combined: 45574,
          magical: 91147,
          physical: 91147,
        },
      },
      formRole: "final",
      formRoleStatus: "manual",
      panelStats: {
        hp: 449,
        magicalDefense: 203,
        physicalDefense: 203,
      },
      spiritId: "spirit_8735efa1d0793f6a",
    });
  });

  test("includes a boss only when both source fields confirm it", () => {
    const boss = spirit({
      fullName: "测试首领",
      id: "boss",
      sourceCategory: "首领形态",
      stage: "首领",
    });

    const ranking = createDurabilityRanking({ spirits: [boss] });

    expect(ranking.rows).toHaveLength(1);
    expect(ranking.rows[0]).toMatchObject({
      formRole: "boss",
      formRoleStatus: "verified",
      spiritId: "boss",
    });
  });

  test("reports an unknown form instead of guessing ranking eligibility", () => {
    const unknown = spirit({
      fullName: "旧资料精灵",
      id: "unknown",
      sourceCategory: "原始形态",
      stage: "三阶",
    });

    const ranking = createDurabilityRanking({ spirits: [unknown] });

    expect(ranking.rows).toEqual([]);
    expect(ranking.excluded).toEqual([
      {
        evolutionFamilyId: null,
        formRole: "unknown",
        formRoleStatus: "manual",
        fullName: "旧资料精灵",
        reason: "UNKNOWN_FORM_ROLE",
        spiritId: "unknown",
      },
    ]);
    expect(ranking.counts).toEqual({
      eligible: 0,
      excluded: 1,
      excludedByReason: { UNKNOWN_FORM_ROLE: 1 },
      total: 1,
      visible: 0,
    });
  });

  test("uses the pinned snapshot revision for runtime spirits without source metadata", () => {
    const runtimeGrowth = spirit({
      fullName: "运行时成长形态",
      id: "runtime-growth",
      sourceCategory: "原始形态",
      stage: "三阶",
    });
    delete runtimeGrowth.source;

    const ranking = createDurabilityRanking({
      spiritFilterRevision: 41360,
      spirits: [runtimeGrowth],
    });

    expect(ranking.excluded[0]).toMatchObject({
      formRole: "growth",
      formRoleStatus: "verified",
      reason: "GROWTH_FORM",
      spiritId: "runtime-growth",
    });
    expect(ranking.counts.excludedByReason).toEqual({ GROWTH_FORM: 1 });
  });

  test("excludes an eligible role when its six race stats are incomplete", () => {
    const incomplete = spirit({ raceStats: null });

    const ranking = createDurabilityRanking({ spirits: [incomplete] });

    expect(ranking.rows).toEqual([]);
    expect(ranking.excluded).toEqual([
      {
        evolutionFamilyId: "s4-family-01",
        formRole: "final",
        formRoleStatus: "manual",
        fullName: "测风蝉",
        reason: "INCOMPLETE_RACE_STATS",
        spiritId: "spirit_8735efa1d0793f6a",
      },
    ]);
  });

  test("reports a curated growth form before considering its missing stats", () => {
    const growth = spirit({
      fullName: "量风碗",
      id: "spirit_7d159935c8b45ec3",
      raceStats: null,
    });

    const ranking = createDurabilityRanking({ spirits: [growth] });

    expect(ranking.excluded[0]).toMatchObject({
      evolutionFamilyId: "s4-family-01",
      formRole: "growth",
      formRoleStatus: "manual",
      reason: "GROWTH_FORM",
    });
  });

  test("uses competition ranks and stable dex-number tie ordering", () => {
    const ranking = createDurabilityRanking({
      spirits: [
        bossSpirit({ dexNo: "004", fullName: "低", hp: 80, id: "low" }),
        bossSpirit({ dexNo: "010", fullName: "同分乙", hp: 100, id: "tie-b" }),
        bossSpirit({ dexNo: "001", fullName: "高", hp: 120, id: "high" }),
        bossSpirit({ dexNo: "009", fullName: "同分甲", hp: 100, id: "tie-a" }),
      ],
    });

    expect(
      ranking.rows.map(({ globalRank, spiritId }) => ({
        combinedRank: globalRank.combined,
        spiritId,
      })),
    ).toEqual([
      { combinedRank: 1, spiritId: "high" },
      { combinedRank: 2, spiritId: "tie-a" },
      { combinedRank: 2, spiritId: "tie-b" },
      { combinedRank: 4, spiritId: "low" },
    ]);
  });

  test("uses name and spirit id as stable tie breakers after dex number", () => {
    const tied = [
      bossSpirit({ dexNo: "007", fullName: "贝塔", hp: 100, id: "beta" }),
      bossSpirit({ dexNo: "007", fullName: "阿尔法", hp: 100, id: "alpha-z" }),
      bossSpirit({ dexNo: "007", fullName: "阿尔法", hp: 100, id: "alpha-a" }),
    ];

    expect(
      createDurabilityRanking({ spirits: tied }).rows.map(({ spiritId }) => spiritId),
    ).toEqual(["alpha-a", "alpha-z", "beta"]);
  });

  test("search hides rows without changing global or filtered ranks", () => {
    const ranking = createDurabilityRanking({
      filter: ({ spirit: entrySpirit }) => entrySpirit.types.includes("翼"),
      query: "低",
      spirits: [
        bossSpirit({ dexNo: "001", fullName: "最高", hp: 120, id: "high" }),
        bossSpirit({
          dexNo: "002",
          fullName: "次高",
          hp: 110,
          id: "second",
        }),
        bossSpirit({ dexNo: "003", fullName: "中等", hp: 100, id: "middle" }),
        bossSpirit({ dexNo: "004", fullName: "最低", hp: 80, id: "low" }),
      ].map((entry) =>
        entry.id === "second" ? { ...entry, types: ["水"] } : entry,
      ),
    });

    expect(ranking.rows).toHaveLength(1);
    expect(ranking.rows[0]).toMatchObject({
      filteredRank: { combined: 3 },
      globalRank: { combined: 4 },
      spiritId: "low",
    });
    expect(ranking.counts).toMatchObject({
      eligible: 4,
      visible: 1,
    });
  });

  test("searches a durability row by community alias", () => {
    const ranking = createDurabilityRanking({
      query: "扛王",
      spirits: [
        bossSpirit({ dexNo: "001", fullName: "甲", hp: 120, id: "first" }),
        {
          ...bossSpirit({ dexNo: "002", fullName: "乙", hp: 110, id: "second" }),
          aliases: ["扛王"],
        },
      ],
    });

    expect(ranking.rows.map(({ spiritId }) => spiritId)).toEqual(["second"]);
  });

  test("rejects a non-durability sort metric with a machine-readable code", () => {
    expect(() =>
      createDurabilityRanking({
        sortBy: "speed",
        spirits: [spirit()],
      }),
    ).toThrow(
      expect.objectContaining({ code: "UNKNOWN_DURABILITY_METRIC" }),
    );
  });
});

test("all standard templates use the same level and three defensive investments", () => {
  expect(
    Object.values(STANDARD_DURABILITY_TEMPLATES).map((template) => ({
      displayIvs: template.displayIvs,
      id: template.id,
      level: template.level,
      natureId: template.natureId,
    })),
  ).toEqual([
    {
      displayIvs: {
        hp: 60,
        magicalAttack: 0,
        magicalDefense: 60,
        physicalAttack: 0,
        physicalDefense: 60,
        speed: 0,
      },
      id: "standard-hp-v1",
      level: 60,
      natureId: "grounded",
    },
    expect.objectContaining({
      id: "standard-neutral-v1",
      level: 60,
      natureId: "neutral",
    }),
    expect.objectContaining({
      id: "standard-physical-v1",
      level: 60,
      natureId: "relaxed",
    }),
    expect.objectContaining({
      id: "standard-magical-v1",
      level: 60,
      natureId: "cautious",
    }),
  ]);
});

test("current snapshot ranks only explicit final forms and corroborated bosses", () => {
  const snapshot = JSON.parse(
    readFileSync("data/snapshots/current.json", "utf8"),
  );

  const ranking = createDurabilityRanking({ spirits: snapshot.spirits });

  expect(ranking.counts).toEqual({
    eligible: 316,
    excluded: 303,
    excludedByReason: {
      GROWTH_FORM: 303,
    },
    total: 619,
    visible: 316,
  });
  expect(ranking.rows.every(({ formRole }) =>
    formRole === "final" || formRole === "boss")).toBe(true);
});
