import { describe, expect, test } from "vitest";
import { validateSnapshot } from "../../scripts/bwiki/validate.mjs";

const TYPES = [
  "普通",
  "草",
  "火",
  "水",
  "光",
  "地",
  "冰",
  "龙",
  "电",
  "毒",
  "虫",
  "武",
  "翼",
  "萌",
  "幽",
  "恶",
  "机械",
  "幻",
];

function spirit(baseName, variantName = null, raceStats = {}) {
  const fullName = variantName ? `${baseName}（${variantName}）` : baseName;
  return {
    id: `spirit_${baseName}_${variantName ?? "base"}`,
    dexNo: "001",
    baseName,
    variantName,
    fullName,
    types: ["普通"],
    raceStats: {
      hp: 78,
      speed: 130,
      physicalAttack: 86,
      magicalAttack: 19,
      physicalDefense: 64,
      magicalDefense: 62,
      total: 439,
      ...raceStats,
    },
    traitIds: [],
  };
}

function fixtureSnapshot(overrides = {}) {
  const baseSpirit = spirit("迪莫");
  const baseSkill = { id: "skill_hit", name: "撞击", type: "普通" };
  return {
    meta: { id: "fixture", counts: { spirits: 1, skills: 1 } },
    spirits: [baseSpirit],
    skills: [baseSkill],
    learnsets: [{ spiritId: baseSpirit.id, skillIds: [baseSkill.id] }],
    traits: [],
    typeChart: {
      types: TYPES,
      matrix: TYPES.map(() => TYPES.map(() => 1)),
    },
    overrides: [],
    ...overrides,
  };
}

describe("snapshot validation", () => {
  test("rejects duplicate form keys even when IDs differ", () => {
    const first = spirit("丢丢", "火山附近的样子");
    const second = { ...spirit("丢丢", "火山附近的样子"), id: "spirit_other" };
    const result = validateSnapshot(fixtureSnapshot({ spirits: [first, second] }));

    expect(result.errors).toContainEqual(
      expect.objectContaining({ code: "DUPLICATE_SPIRIT_FORM" }),
    );
  });

  test("rejects a broken race-stat total", () => {
    const result = validateSnapshot(
      fixtureSnapshot({
        spirits: [spirit("卡瓦重", "火山附近的样子", { total: 438 })],
      }),
    );

    expect(result.errors).toContainEqual(
      expect.objectContaining({ code: "RACE_STAT_TOTAL_MISMATCH" }),
    );
  });

  test.each([0, -1])("rejects non-positive race stat %i", (hp) => {
    const result = validateSnapshot(
      fixtureSnapshot({
        spirits: [spirit("卡瓦重", null, { hp, total: 361 + hp })],
      }),
    );

    expect(result.errors).toContainEqual(
      expect.objectContaining({ code: "INVALID_RACE_STATS" }),
    );
  });

  test("allows null race stats only for an explicit preview placeholder", () => {
    const placeholder = {
      ...spirit("量风碗"),
      calculationStatus: "pending-race-stats",
      raceStats: null,
    };
    const accepted = validateSnapshot(
      fixtureSnapshot({
        spirits: [placeholder],
        learnsets: [{ spiritId: placeholder.id, skillIds: [] }],
      }),
    );
    expect(accepted.errors).not.toContainEqual(
      expect.objectContaining({ code: "INVALID_RACE_STATS" }),
    );

    const unmarked = validateSnapshot(
      fixtureSnapshot({
        spirits: [{ ...placeholder, calculationStatus: undefined }],
        learnsets: [{ spiritId: placeholder.id, skillIds: [] }],
      }),
    );
    expect(unmarked.errors).toContainEqual(
      expect.objectContaining({ code: "INVALID_RACE_STATS" }),
    );

    const nonEmptyLearnset = validateSnapshot(
      fixtureSnapshot({
        spirits: [placeholder],
        learnsets: [{ spiritId: placeholder.id, skillIds: ["skill_hit"] }],
      }),
    );
    expect(nonEmptyLearnset.errors).toContainEqual(
      expect.objectContaining({ code: "PENDING_SPIRIT_LEARNSET_NOT_EMPTY" }),
    );

    const missingLearnset = validateSnapshot(
      fixtureSnapshot({ spirits: [placeholder], learnsets: [] }),
    );
    expect(missingLearnset.errors).toContainEqual(
      expect.objectContaining({ code: "MISSING_PENDING_SPIRIT_LEARNSET" }),
    );
  });

  test.each([null, "ready", "pending-stats"])(
    "rejects unsupported calculation status %p",
    (calculationStatus) => {
      const result = validateSnapshot(
        fixtureSnapshot({
          spirits: [{ ...spirit("卡瓦重"), calculationStatus }],
        }),
      );

      expect(result.errors).toContainEqual(
        expect.objectContaining({ code: "INVALID_CALCULATION_STATUS" }),
      );
    },
  );

  test("requires preview placeholders to keep race stats null", () => {
    const result = validateSnapshot(
      fixtureSnapshot({
        spirits: [
          {
            ...spirit("量风碗"),
            calculationStatus: "pending-race-stats",
          },
        ],
        learnsets: [
          { spiritId: spirit("量风碗").id, skillIds: [] },
        ],
      }),
    );

    expect(result.errors).toContainEqual(
      expect.objectContaining({ code: "INVALID_PLACEHOLDER_RACE_STATS" }),
    );
  });

  test("accepts only valid preview nature and exactly three 60 individual values", () => {
    const previewDefaults = {
      natureId: "adamant",
      displayIvs: {
        hp: 60,
        speed: 60,
        physicalAttack: 60,
        magicalAttack: 0,
        physicalDefense: 0,
        magicalDefense: 0,
      },
    };
    const accepted = validateSnapshot(
      fixtureSnapshot({ spirits: [{ ...spirit("银月狼王"), previewDefaults }] }),
    );
    expect(accepted.errors).not.toContainEqual(
      expect.objectContaining({ code: "INVALID_PREVIEW_DEFAULTS" }),
    );

    const invalid = validateSnapshot(
      fixtureSnapshot({
        spirits: [{
          ...spirit("银月狼王"),
          previewDefaults: {
            ...previewDefaults,
            displayIvs: { ...previewDefaults.displayIvs, magicalAttack: 60 },
          },
        }],
      }),
    );
    expect(invalid.errors).toContainEqual(
      expect.objectContaining({ code: "INVALID_PREVIEW_DEFAULTS" }),
    );
  });

  test("rejects broken learnset references", () => {
    const result = validateSnapshot(
      fixtureSnapshot({
        learnsets: [{ spiritId: "missing_spirit", skillIds: ["missing_skill"] }],
      }),
    );

    expect(result.errors.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["UNKNOWN_SPIRIT_REFERENCE", "UNKNOWN_SKILL_REFERENCE"]),
    );
  });

  test("allows only explicit parameter-free preview skill placeholders", () => {
    const pendingSkill = {
      basePower: null,
      calculationStatus: "pending-skill-data",
      category: null,
      cost: null,
      id: "skill-preview",
      name: "广播",
      type: null,
    };
    const accepted = validateSnapshot(
      fixtureSnapshot({
        skills: [pendingSkill],
        learnsets: [{ spiritId: spirit("迪莫").id, skillIds: [pendingSkill.id] }],
      }),
    );
    expect(accepted.errors).not.toContainEqual(
      expect.objectContaining({ code: "INVALID_SKILL_CALCULATION_STATUS" }),
    );

    const inventedPower = validateSnapshot(
      fixtureSnapshot({
        skills: [{ ...pendingSkill, basePower: 1 }],
        learnsets: [{ spiritId: spirit("迪莫").id, skillIds: [pendingSkill.id] }],
      }),
    );
    expect(inventedPower.errors).toContainEqual(
      expect.objectContaining({ code: "INVALID_PENDING_SKILL_PARAMETER" }),
    );

    const unsupportedStatus = validateSnapshot(
      fixtureSnapshot({
        skills: [{ ...pendingSkill, calculationStatus: "pending" }],
        learnsets: [{ spiritId: spirit("迪莫").id, skillIds: [pendingSkill.id] }],
      }),
    );
    expect(unsupportedStatus.errors).toContainEqual(
      expect.objectContaining({ code: "INVALID_SKILL_CALCULATION_STATUS" }),
    );
  });

  test("requires a complete 18 by 18 type chart", () => {
    const result = validateSnapshot(
      fixtureSnapshot({
        typeChart: { types: TYPES.slice(0, 17), matrix: [] },
      }),
    );

    expect(result.errors).toContainEqual(
      expect.objectContaining({ code: "INVALID_TYPE_CHART" }),
    );
  });

  test("blocks unexpected entity count changes", () => {
    const result = validateSnapshot(fixtureSnapshot(), {
      expectedSpiritCount: 592,
      expectedSkillCount: 553,
    });

    expect(result.errors.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["SPIRIT_COUNT_MISMATCH", "SKILL_COUNT_MISMATCH"]),
    );
  });

  test("rejects build-machine paths from a public snapshot", () => {
    const result = validateSnapshot(
      fixtureSnapshot({
        meta: {
          id: "fixture",
          sources: [
            {
              title: "本地来源",
              url: "file:///C:/Users/example/private-source.csv",
            },
          ],
        },
      }),
    );

    expect(result.errors).toContainEqual(
      expect.objectContaining({ code: "PRIVATE_PATH_EXPOSED" }),
    );
  });
});
