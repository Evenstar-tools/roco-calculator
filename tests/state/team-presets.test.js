import { describe, expect, test } from "vitest";
import {
  TEAM_STORAGE_KEY,
  createTeamMember,
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
    ],
    spirits: [{ fullName: "音速犬", id: "spirit-a" }],
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
