import { describe, expect, test } from "vitest";
import {
  TEAM_STORAGE_KEY,
  createTeamMember,
  createTeamMemberFromSpiritConfig,
  createTeamMemberFromSide,
  teamPresetsRepository,
} from "../../src/state/team-presets.js";

function memoryStorage(seed = {}) {
  const values = new Map(Object.entries(seed));
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    keys() {
      return [...values.keys()];
    },
    removeItem(key) {
      values.delete(key);
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
  };
}

function snapshot() {
  return {
    learnsets: [
      {
        skillIds: ["skill-a", "skill-b", "skill-c", "skill-d"],
        spiritId: "spirit-a",
      },
      {
        skillIds: ["skill-e"],
        spiritId: "spirit-b",
      },
    ],
    skills: [
      {
        basePower: 80,
        category: "physical",
        id: "skill-a",
        name: "风力冲击",
      },
      { basePower: 60, category: "magical", id: "skill-b", name: "水波" },
      { basePower: null, category: "status", id: "skill-c", name: "状态" },
      { basePower: null, category: "defense", id: "skill-d", name: "防御" },
      { basePower: 70, category: "physical", id: "skill-e", name: "新技能" },
    ],
    spirits: [
      { fullName: "音速犬", id: "spirit-a" },
      { fullName: "水灵", id: "spirit-b" },
    ],
  };
}

function repository(storage = memoryStorage()) {
  let id = 0;
  return teamPresetsRepository({
    idFactory: () => `id-${(id += 1)}`,
    now: () => "2026-07-24T00:00:00.000Z",
    storage,
  });
}

describe("teamPresetsRepository", () => {
  test("migrates the previous app namespace without losing team data", () => {
    const legacyKey = "lovepvp.teams.v1";
    const legacyState = {
      activeTeamId: null,
      schemaVersion: 1,
      teams: [],
    };
    const storage = memoryStorage({
      [legacyKey]: JSON.stringify(legacyState),
    });

    expect(repository(storage).load(snapshot())).toEqual(legacyState);
    expect(JSON.parse(storage.getItem(TEAM_STORAGE_KEY))).toEqual(legacyState);
    expect(storage.getItem(legacyKey)).toBeNull();
  });

  test("creates a persisted team with exactly six slots", () => {
    const storage = memoryStorage();
    const store = repository(storage);

    const next = store.create(store.load(snapshot()), "主队");

    expect(next.activeTeamId).toBe("id-1");
    expect(next.teams).toHaveLength(1);
    expect(next.teams[0]).toMatchObject({
      id: "id-1",
      name: "主队",
    });
    expect(next.teams[0].members).toEqual(Array(6).fill(null));
    expect(JSON.parse(storage.getItem(TEAM_STORAGE_KEY))).toEqual(next);
  });

  test("preserves a seven-slot dazzling member", () => {
    const side = {
      displayIvs: {},
      nature: "neutral",
      skills: {
        four: ["a", "b", "c", "d", "e", "f", "g"],
        single: "a",
      },
      spiritId: "rainbow-unicorn",
    };

    expect(createTeamMemberFromSide(side).skills.four).toEqual(
      side.skills.four,
    );
  });

  test("renames duplicates and deletes without sharing member references", () => {
    const store = repository();
    let state = store.create(store.load(snapshot()), "主队");
    const member = createTeamMember(snapshot(), "spirit-a");
    state = store.updateMember(state, state.activeTeamId, 0, member);
    state = store.rename(state, state.activeTeamId, "雨队");
    const sourceId = state.activeTeamId;
    state = store.duplicate(state, sourceId);
    const copiedId = state.activeTeamId;

    expect(state.teams.map((team) => team.name)).toEqual([
      "雨队",
      "雨队 副本",
    ]);
    expect(state.teams[1].members[0]).toEqual(state.teams[0].members[0]);
    expect(state.teams[1].members[0]).not.toBe(state.teams[0].members[0]);

    state.teams[1].members[0].displayIvs.hp = 42;
    expect(state.teams[0].members[0].displayIvs.hp).toBe(0);

    state = store.remove(state, copiedId);
    expect(state.activeTeamId).toBe(sourceId);
    expect(state.teams).toHaveLength(1);
  });

  test("persists a complete member and restores it after refresh", () => {
    const storage = memoryStorage();
    const store = repository(storage);
    let state = store.create(store.load(snapshot()), "主队");
    const member = createTeamMember(snapshot(), "spirit-a");
    member.natureId = "adamant";
    member.displayIvs.physicalAttack = 60;
    member.skills.four[0] = {
      context: { energy: 3 },
      hitCount: 2,
      skillId: "skill-a",
    };
    state = store.updateMember(state, state.activeTeamId, 0, member);

    const restored = repository(storage).load(snapshot());

    expect(restored.teams[0].members[0]).toEqual(member);
    expect(restored.teams[0].members[0].skills.four).toHaveLength(4);
  });

  test("captures a calculator side without sharing nested references", () => {
    const side = {
      displayIvs: {
        hp: 0,
        speed: 60,
        physicalAttack: 60,
        magicalAttack: 60,
        physicalDefense: 0,
        magicalDefense: 0,
      },
      nature: "adamant",
      skills: {
        four: [
          {
            context: { energy: 3, targetSwitched: true },
            hitCount: 2,
            skillId: "skill-a",
          },
          null,
          null,
          null,
        ],
        single: {
          context: { energy: 3 },
          hitCount: 2,
          skillId: "skill-a",
        },
      },
      spiritId: "spirit-a",
    };

    const member = createTeamMemberFromSide(side);

    expect(member).toEqual({
      displayIvs: side.displayIvs,
      natureId: "adamant",
      skills: side.skills,
      spiritId: "spirit-a",
    });
    expect(member.displayIvs).not.toBe(side.displayIvs);
    expect(member.skills).not.toBe(side.skills);
    side.skills.four[0].context.energy = 1;
    expect(member.skills.four[0].context.energy).toBe(3);
  });

  test("creates a team member from a personal configuration as an independent deep copy", () => {
    const config = {
      displayIvs: {
        hp: 11,
        speed: 22,
        physicalAttack: 33,
        magicalAttack: 44,
        physicalDefense: 55,
        magicalDefense: 60,
      },
      natureId: "adamant",
      skills: {
        four: [
          {
            context: { nested: { stacks: 3 } },
            hitCount: 2,
            memoryBySkill: {
              "skill-b": {
                context: { energy: 4 },
                hitCount: 3,
                overrides: { basePower: 120 },
              },
            },
            overrides: { basePower: 100 },
            skillId: "skill-a",
          },
          "skill-b",
          null,
          null,
        ],
        single: {
          context: { currentHpPercent: 75 },
          hitCount: 2,
          memoryBySkill: {
            "skill-b": {
              context: { energy: 2 },
              overrides: { basePower: 90 },
            },
          },
          overrides: { basePower: 110 },
          skillId: "skill-a",
        },
      },
      spiritId: "spirit-a",
      updatedAt: "2026-07-29T12:00:00.000Z",
    };

    const member = createTeamMemberFromSpiritConfig(config);

    expect(member).toEqual({
      displayIvs: config.displayIvs,
      natureId: "adamant",
      skills: config.skills,
      spiritId: "spirit-a",
    });
    expect(member.skills).not.toBe(config.skills);
    member.skills.four[0].context.nested.stacks = 9;
    member.skills.four[0].memoryBySkill["skill-b"].overrides.basePower = 1;
    member.skills.single.memoryBySkill["skill-b"].context.energy = 8;
    expect(config.skills.four[0].context.nested.stacks).toBe(3);
    expect(
      config.skills.four[0].memoryBySkill["skill-b"].overrides.basePower,
    ).toBe(120);
    expect(
      config.skills.single.memoryBySkill["skill-b"].context.energy,
    ).toBe(2);
  });

  test("keeps context overrides and remembered skills isolated across save reload and duplicate", () => {
    const storage = memoryStorage();
    const store = repository(storage);
    let state = store.create(store.load(snapshot()), "主队");
    const source = createTeamMemberFromSpiritConfig({
      displayIvs: { physicalAttack: 60 },
      natureId: "adamant",
      skills: {
        four: [
          {
            context: { nested: { stacks: 2 } },
            memoryBySkill: {
              "skill-b": {
                context: { energy: 3 },
                overrides: { basePower: 120 },
              },
            },
            overrides: { basePower: 100 },
            skillId: "skill-a",
          },
        ],
        single: null,
      },
      spiritId: "spirit-a",
    });
    state = store.updateMember(state, state.activeTeamId, 0, source);
    const sourceTeamId = state.activeTeamId;
    state = store.duplicate(state, sourceTeamId);
    const reloaded = repository(storage).load(snapshot());
    const original = reloaded.teams[0].members[0];
    const copy = reloaded.teams[1].members[0];

    copy.skills.four[0].context.nested.stacks = 8;
    copy.skills.four[0].overrides.basePower = 1;
    copy.skills.four[0].memoryBySkill["skill-b"].context.energy = 9;

    expect(original.skills.four[0].context.nested.stacks).toBe(2);
    expect(original.skills.four[0].overrides.basePower).toBe(100);
    expect(
      original.skills.four[0].memoryBySkill["skill-b"].context.energy,
    ).toBe(3);
    expect(source.skills.four[0].context.nested.stacks).toBe(2);
  });

  test("uses a clean spirit default after replacing a configured member with an unremembered spirit", () => {
    const configuredA = createTeamMemberFromSpiritConfig({
      displayIvs: {
        hp: 12,
        speed: 60,
        physicalAttack: 60,
        magicalAttack: 48,
        physicalDefense: 36,
        magicalDefense: 24,
      },
      natureId: "adamant",
      skills: {
        four: [
          {
            context: { energy: 3 },
            hitCount: 4,
            overrides: { basePower: 140 },
            skillId: "skill-a",
          },
          null,
          null,
          null,
        ],
        single: {
          context: { targetSwitched: true },
          hitCount: 2,
          overrides: { basePower: 180 },
          skillId: "skill-a",
        },
      },
      spiritId: "spirit-a",
    });

    const cleanB = createTeamMember(snapshot(), "spirit-b");

    expect(configuredA.skills.four[0]).toMatchObject({
      context: { energy: 3 },
      hitCount: 4,
      overrides: { basePower: 140 },
    });
    expect(cleanB).toEqual({
      displayIvs: {
        hp: 0,
        speed: 0,
        physicalAttack: 0,
        magicalAttack: 0,
        physicalDefense: 0,
        magicalDefense: 0,
      },
      natureId: "neutral",
      skills: {
        four: ["skill-e", null, null, null],
        single: "skill-e",
      },
      spiritId: "spirit-b",
    });
    expect(JSON.stringify(cleanB)).not.toMatch(
      /context|hitCount|overrides|skill-a|adamant/,
    );
  });

  test("backs up corrupt JSON and returns an empty warning state", () => {
    const storage = memoryStorage({ [TEAM_STORAGE_KEY]: "{not-json" });
    const store = repository(storage);

    const state = store.load(snapshot());

    expect(state).toMatchObject({
      activeTeamId: null,
      schemaVersion: 1,
      teams: [],
      warning: "队伍数据损坏，已保留备份",
    });
    const backupKey = storage
      .keys()
      .find((key) => key.startsWith(`${TEAM_STORAGE_KEY}.corrupt.`));
    expect(backupKey).toBeTruthy();
    expect(storage.getItem(backupKey)).toBe("{not-json");
    expect(storage.getItem(TEAM_STORAGE_KEY)).toBe("{not-json");
  });

  test("marks missing snapshot references without dropping valid team data", () => {
    const storage = memoryStorage();
    const store = repository(storage);
    let state = store.create(store.load(snapshot()), "旧队");
    state = store.updateMember(state, state.activeTeamId, 0, {
      ...createTeamMember(snapshot(), "spirit-a"),
      skills: {
        four: ["missing-skill", null, null, null],
        single: "missing-skill",
      },
      spiritId: "missing-spirit",
    });

    const restored = repository(storage).load(snapshot());

    expect(restored.teams).toHaveLength(1);
    expect(restored.teams[0].members[0]).toMatchObject({
      needsRepair: true,
      spiritId: "missing-spirit",
    });
    expect(restored.teams[0].members[0].repairReason).toMatch(
      /精灵数据不存在/,
    );
  });
});
