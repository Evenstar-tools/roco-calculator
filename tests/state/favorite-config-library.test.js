import { describe, expect, test, vi } from "vitest";
import { getTraitView } from "../../src/domain/calculator-view-model.js";
import {
  FAVORITE_CONFIG_LIBRARY_FORMAT,
  FAVORITE_CONFIG_LIBRARY_MAX_BYTES,
  applyFavoriteConfigLibraryImport,
  buildFavoriteConfigLibrary,
  parseFavoriteConfigLibrary,
} from "../../src/state/favorite-config-library.js";
import { canonicalTraitControlKey } from "../../src/state/trait-values.js";

const IVS = {
  hp: 0,
  speed: 60,
  physicalAttack: 60,
  magicalAttack: 60,
  physicalDefense: 0,
  magicalDefense: 0,
};

function snapshot() {
  return {
    skills: [
      { id: "skill-a", name: "技能 A" },
      { id: "skill-b", name: "技能 B" },
    ],
    spirits: [
      { id: "spirit-a", fullName: "形态 A", traitIds: ["trait-ignite"] },
      { id: "spirit-b", fullName: "形态 B", traitIds: [] },
    ],
    traits: [
      {
        id: "trait-ignite",
        name: "点燃",
        description: "每层增加双攻双防。",
      },
    ],
  };
}

function config(spiritId = "spirit-a") {
  return {
    displayIvs: { ...IVS },
    natureId: "adamant",
    skills: {
      four: ["skill-a", { skillId: "skill-b" }, null, null],
      single: { skillId: "skill-a", overrides: { basePower: 999 } },
    },
    spiritId,
    traitValues: {},
    updatedAt: "2026-08-03T01:00:00.000Z",
  };
}

function library(entries) {
  return {
    format: FAVORITE_CONFIG_LIBRARY_FORMAT,
    schemaVersion: 1,
    appVersion: "1.3.1",
    versions: { data: "S3", rules: "2026-08-03" },
    exportedAt: "2026-08-03T01:02:00.000Z",
    entryCount: entries.length,
    entries,
  };
}

describe("buildFavoriteConfigLibrary", () => {
  test("exports only configured manual favorites and removes battle-only skill state", () => {
    const result = buildFavoriteConfigLibrary({
      appVersion: "1.3.1",
      favorites: [
        { id: "spirit:spirit-a", kind: "spirit", spiritId: "spirit-a" },
        { id: "spirit:spirit-b", kind: "spirit", spiritId: "spirit-b" },
      ],
      now: () => "2026-08-03T01:02:00.000Z",
      snapshot: snapshot(),
      spiritConfigs: {
        configs: {
          "spirit-a": config(),
          "not-favorite": config("not-favorite"),
        },
      },
      versions: { data: "S3", rules: "2026-08-03" },
    });

    expect(result.exportedCount).toBe(1);
    expect(result.skippedUnconfiguredCount).toBe(1);
    expect(result.library.entries).toEqual([
      {
        spiritId: "spirit-a",
        natureId: "adamant",
        displayIvs: IVS,
        skills: ["skill-a", "skill-b", null, null],
        traitValues: {},
      },
    ]);
    expect(result.library.entryCount).toBe(1);
  });

  test("exports complete remembered configurations even when they were not manually favorited", () => {
    const result = buildFavoriteConfigLibrary({
      appVersion: "1.3.2",
      favorites: [],
      now: () => "2026-08-03T01:02:00.000Z",
      snapshot: snapshot(),
      spiritConfigs: {
        configs: {
          "spirit-a": config(),
        },
      },
      versions: { data: "S3", rules: "2026-08-03" },
    });

    expect(result.exportedCount).toBe(1);
    expect(result.autoIncludedCount).toBe(1);
    expect(result.manualConfiguredCount).toBe(0);
    expect(result.library.entries[0].spiritId).toBe("spirit-a");
  });

  test("exports and parses all seven slots for a dazzling spirit", () => {
    const data = snapshot();
    data.skills.push(...["c", "d", "e", "f", "g"].map((suffix) => ({
      id: `skill-${suffix}`,
      name: `技能 ${suffix.toUpperCase()}`,
    })));
    data.traits.push({ id: "trait-dazzling", name: "夺目" });
    data.spirits.push({
      id: "rainbow-unicorn",
      fullName: "彩虹独角兽",
      traitIds: ["trait-dazzling"],
    });
    const sevenSkills = ["skill-a", "skill-b", "skill-c", "skill-d", "skill-e", "skill-f", "skill-g"];
    const result = buildFavoriteConfigLibrary({
      appVersion: "1.3.6",
      favorites: [{ kind: "spirit", spiritId: "rainbow-unicorn" }],
      snapshot: data,
      spiritConfigs: {
        configs: {
          "rainbow-unicorn": {
            ...config("rainbow-unicorn"),
            skills: { four: sevenSkills, single: "skill-a" },
          },
        },
      },
      versions: {},
    });

    expect(result.library.entries[0].skills).toEqual(sevenSkills);
    const parsed = parseFavoriteConfigLibrary(JSON.stringify(result.library), {
      snapshot: data,
    });
    expect(parsed.entries[0].skills).toEqual(sevenSkills);
  });
});

describe("parseFavoriteConfigLibrary", () => {
  test("previews additions, overwrites, duplicate entries, missing skills and missing spirits", () => {
    const first = {
      spiritId: "spirit-a",
      natureId: "adamant",
      displayIvs: IVS,
      skills: ["skill-a", "missing-skill", null, null],
      traitValues: { "trait.unknown.deadbeef": true },
    };
    const replacement = { ...first, natureId: "smart" };
    const parsed = parseFavoriteConfigLibrary(
      JSON.stringify(library([
        first,
        { ...first, spiritId: "missing-spirit" },
        replacement,
      ])),
      {
        currentVersions: { data: "S4", rules: "2026-08-04" },
        existingFavorites: [],
        existingSpiritConfigs: { configs: { "spirit-a": config() } },
        snapshot: snapshot(),
      },
    );

    expect(parsed.entries).toHaveLength(1);
    expect(parsed.entries[0]).toMatchObject({
      natureId: "smart",
      skills: ["skill-a", null, null, null],
      traitValues: {},
    });
    expect(parsed.preview).toMatchObject({
      added: 0,
      duplicateEntries: 1,
      favoritesAdded: 1,
      missingSkills: 1,
      missingSpirits: 1,
      overwritten: 1,
      unknownTraitFields: 1,
    });
    expect(parsed.warnings).toHaveLength(2);
  });

  test("keeps the last valid duplicate when a later duplicate is invalid", () => {
    const valid = {
      spiritId: "spirit-a",
      natureId: "adamant",
      displayIvs: IVS,
      skills: ["skill-a", null, null, null],
      traitValues: {},
    };
    const parsed = parseFavoriteConfigLibrary(JSON.stringify(library([
      valid,
      { ...valid, natureId: "not-a-nature" },
    ])), { snapshot: snapshot(), currentVersions: {} });

    expect(parsed.entries).toEqual([valid]);
    expect(parsed.preview.duplicateEntries).toBe(1);
    expect(parsed.preview.invalidEntries).toBe(1);
    expect(parsed.issueDetails).toEqual(expect.arrayContaining([
      expect.objectContaining({
        action: "已跳过，继续使用文件中上一条有效配置",
        entryIndex: 2,
        spiritId: "spirit-a",
        type: "invalidEntries",
      }),
    ]));
  });

  test("rejects invalid entries instead of silently fixing nature or IVs", () => {
    const parsed = parseFavoriteConfigLibrary(JSON.stringify(library([
      {
        spiritId: "spirit-a",
        natureId: "not-a-nature",
        displayIvs: { ...IVS, hp: 61 },
        skills: [null, null, null, null],
        traitValues: {},
      },
    ])), { snapshot: snapshot(), currentVersions: {} });

    expect(parsed.entries).toEqual([]);
    expect(parsed.preview.invalidEntries).toBe(1);
    expect(parsed.issueDetails).toEqual([
      expect.objectContaining({
        entryIndex: 1,
        reason: expect.stringContaining("性格"),
        spiritId: "spirit-a",
        spiritName: "形态 A",
        type: "invalidEntries",
      }),
    ]);
  });

  test("pads legacy four-skill entries when the current spirit has seven slots", () => {
    const data = snapshot();
    data.traits.push({ id: "trait-dazzling", name: "夺目" });
    data.spirits.push({
      id: "rainbow-unicorn",
      fullName: "彩虹独角兽",
      traitIds: ["trait-dazzling"],
    });
    const parsed = parseFavoriteConfigLibrary(JSON.stringify(library([{
      spiritId: "rainbow-unicorn",
      natureId: "timid",
      displayIvs: IVS,
      skills: ["skill-a", "skill-b", null, null],
      traitValues: {},
    }])), { snapshot: data, currentVersions: {} });

    expect(parsed.entries[0].skills).toEqual([
      "skill-a",
      "skill-b",
      null,
      null,
      null,
      null,
      null,
    ]);
    expect(parsed.preview.invalidEntries).toBe(0);
    expect(parsed.preview.repairedEntries).toBe(1);
    expect(parsed.issueDetails).toEqual([
      expect.objectContaining({
        action: "已保留原四技能，并补齐 3 个空技能槽",
        entryIndex: 1,
        spiritId: "rainbow-unicorn",
        spiritName: "彩虹独角兽",
        type: "repairedEntries",
      }),
    ]);
  });

  test("keeps valid trait values but ignores values outside current bounds", () => {
    const data = snapshot();
    const stackControl = getTraitView(
      data,
      data.spirits[0],
      "attacker",
    ).inputs.find((control) => control.contextKey === "attackerTraitStacks");
    const traitKey = canonicalTraitControlKey(stackControl);
    const parsed = parseFavoriteConfigLibrary(JSON.stringify(library([
      {
        spiritId: "spirit-a",
        natureId: "adamant",
        displayIvs: IVS,
        skills: [null, null, null, null],
        traitValues: { [traitKey]: 999 },
      },
    ])), { snapshot: data, currentVersions: {} });

    expect(parsed.entries[0].traitValues).toEqual({});
    expect(parsed.preview.unknownTraitFields).toBe(1);
  });

  test("converts legacy favorite arrays without inventing empty configs", () => {
    const parsed = parseFavoriteConfigLibrary(JSON.stringify([
      { kind: "spirit", spiritId: "spirit-b" },
      {
        kind: "spirit",
        spiritId: "spirit-a",
        state: {
          sides: {
            attacker: {
              ...config(),
              nature: "adamant",
            },
          },
        },
      },
    ]), { snapshot: snapshot(), currentVersions: {} });

    expect(parsed.format).toBe("legacy-favorites");
    expect(parsed.entries.map((entry) => entry.spiritId)).toEqual(["spirit-a"]);
    expect(parsed.favoriteSpiritIds).toEqual(["spirit-b", "spirit-a"]);
  });

  test("rejects unsupported schemas and oversized entry sets", () => {
    expect(() => parseFavoriteConfigLibrary(
      "{broken",
      { snapshot: snapshot(), currentVersions: {} },
    )).toThrow(/无法解析/);

    expect(() => parseFavoriteConfigLibrary(JSON.stringify({
      ...library([]),
      schemaVersion: 99,
    }), { snapshot: snapshot(), currentVersions: {} })).toThrow(/版本/);

    expect(() => parseFavoriteConfigLibrary(JSON.stringify(library(
      Array.from({ length: 2001 }, () => ({ })),
    )), { snapshot: snapshot(), currentVersions: {} })).toThrow(/2000/);

    const oversized = " ".repeat(FAVORITE_CONFIG_LIBRARY_MAX_BYTES + 1);
    expect(() => parseFavoriteConfigLibrary(
      oversized,
      { snapshot: snapshot(), currentVersions: {} },
    )).toThrow(/5 MB/);
  });
});

describe("applyFavoriteConfigLibraryImport", () => {
  test("commits both stores and rolls both back if the second write fails", () => {
    let favorites = [{ id: "spirit:local", kind: "spirit", spiritId: "local" }];
    let configs = { configs: { local: config("local") }, schemaVersion: 2 };
    const favoritesRepository = {
      list: () => structuredClone(favorites),
      replace: vi.fn((next) => {
        if (next.some((favorite) => favorite.spiritId === "spirit-a")) {
          throw new Error("disk full");
        }
        favorites = structuredClone(next);
        return favorites;
      }),
    };
    const spiritConfigsRepository = {
      load: () => structuredClone(configs),
      replace: vi.fn((next) => {
        configs = structuredClone(next);
        return configs;
      }),
    };
    const parsed = parseFavoriteConfigLibrary(JSON.stringify(library([
      {
        spiritId: "spirit-a",
        natureId: "adamant",
        displayIvs: IVS,
        skills: ["skill-a", null, null, null],
        traitValues: {},
      },
    ])), { snapshot: snapshot(), currentVersions: {} });

    expect(() => applyFavoriteConfigLibraryImport({
      favoritesRepository,
      parsed,
      snapshot: snapshot(),
      spiritConfigsRepository,
    })).toThrow(/disk full/);
    expect(favorites).toEqual([
      { id: "spirit:local", kind: "spirit", spiritId: "local" },
    ]);
    expect(configs.configs.local.spiritId).toBe("local");
    expect(configs.configs["spirit-a"]).toBeUndefined();
  });
});
