import mapping from "../../public/data/lineup-code-map.json";
import { describe, expect, test } from "vitest";
import snapshot from "../../data/snapshots/current.json";
import fixture from "../fixtures/qiandao-lineup.json";
import { decodeLineupCode, encodeLineupCode, exportLineupCode as exportCode, importLineupCode as importCode } from "../../src/state/lineup-code.js";
import { teamPresetsRepository } from "../../src/state/team-presets.js";

const importLineupCode = (input, data) => importCode(input, data, mapping);
const exportLineupCode = (team, data) => exportCode(team, data, mapping);

describe("game / Qiandao lineup exchange", () => {
  test("matches all six screenshot members and 24 skills, then exports the exact real code", () => {
    const team = importLineupCode(fixture.code, snapshot);
    expect(team.members.map(({ spiritId, skills }) => ({ spiritId, skills: skills.four }))).toEqual(fixture.members);
    expect(team.members.map((member) => member.natureId)).toEqual(["cheerful", "peaceful", "cheerful", "grounded", "grounded", "grounded"]);
    expect(team.members.map((member) => member.bloodlineType)).toEqual(["boss", "water", "water", "fire", "fire", "ghost"]);
    expect(team.lineup).toEqual({ count: 6, magicId: 104007, mode: 5 });
    expect(Object.values(team.members[0].displayIvs)).toEqual([0, 0, 0, 0, 0, 0]);
    expect(team.members.every(member => member.ivsPending)).toBe(true);
    expect(exportLineupCode(team, snapshot).code).toBe(fixture.code);
  });

  test("accepts escaped tildes and percent-encoded official links with a Chinese name", () => {
    expect(importLineupCode(fixture.code.replace(/~/g, "\\~"), snapshot).members).toHaveLength(6);
    const url = `https://rocom.qq.com/act/a20250703array/index.html?shareData=${encodeURIComponent(fixture.code.replace(/-/g, "+"))}&name=${encodeURIComponent(fixture.name)}`;
    const team = importLineupCode(url, snapshot);
    expect(team.name).toBe(fixture.name);
    expect(importLineupCode(exportLineupCode(team, snapshot).url, snapshot)).toEqual(team);
  });

  test.each(["", fixture.code.slice(1), fixture.code + "A", fixture.code.replace(/^B/, "C"), fixture.code.replace("0f~~~", "~~~~~"), fixture.code.replace("0f~~~", "zzzzz")])("rejects malformed or unsupported input without guessing: %s", (code) => {
    expect(() => importLineupCode(code, snapshot)).toThrow();
  });

  test("preserves slots, empty skills, and a one-member lineup", () => {
    const raw = decodeLineupCode(fixture.code);
    raw.members = raw.members.slice(0, 1);
    raw.members[0].skills[1] = null;
    const code = encodeLineupCode(raw);
    const team = importLineupCode(code, snapshot);
    expect(team.members[0].skills.four[1]).toBeNull();
    expect(team.members.slice(1)).toEqual(Array(5).fill(null));
    expect(exportLineupCode(team, snapshot).code).toBe(code);
  });

  test("retains nature overrides and exports a changed nature instead of stale source data", () => {
    const raw = decodeLineupCode(fixture.code);
    raw.members[0].overrides = [1, 6];
    const code = encodeLineupCode(raw);
    const team = importLineupCode(code, snapshot);
    expect(team.members[0].natureId).toBe("grounded");
    expect(exportLineupCode(team, snapshot).code).toBe(code);
    team.members[0].natureId = "adamant";
    const updated = decodeLineupCode(exportLineupCode(team, snapshot).code);
    expect(updated.members[0].natureId).toBe(2);
    expect(updated.members[0].overrides).toEqual([0, 0]);
  });

  test("exports edited skills and bloodline, and refuses to truncate seven skills", () => {
    const team = importLineupCode(fixture.code, snapshot);
    team.members[0].skills.four[0] = team.members[0].skills.four[1];
    team.members[0].bloodlineType = "fire";
    const changed = importLineupCode(exportLineupCode(team, snapshot).code, snapshot);
    expect(changed.members[0].skills.four).toEqual(team.members[0].skills.four);
    expect(changed.members[0].bloodlineType).toBe("fire");
    team.members[0].skills.four.push(team.members[0].skills.four[0]);
    expect(() => exportLineupCode(team, snapshot)).toThrow("超过四个技能");
  });

  test("exports a manually created member without inventing IV selections", () => {
    const team = importLineupCode(fixture.code, snapshot);
    delete team.members[0].lineupSource;
    const exported = decodeLineupCode(exportLineupCode(team, snapshot).code);
    expect(exported.members[0].spriteId).toBe(3359);
    expect(exported.members[0].talents).toEqual([null, null, null]);
  });

  test("saves a whole team atomically and preserves source fields across reload, edit, and duplication", () => {
    const data = new Map();
    let writes = 0;
    let id = 0;
    const storage = { getItem: (key) => data.get(key), setItem: (key, value) => { writes++; data.set(key, value); } };
    const store = teamPresetsRepository({ storage, idFactory: () => `team-${++id}` });
    let state = store.create(store.load(snapshot), "保留的队伍");
    const before = writes;
    state = store.importTeam(state, importLineupCode(fixture.code, snapshot));
    expect(writes - before).toBe(1);
    expect(state.teams).toHaveLength(2);
    const team = store.load(snapshot).teams[1];
    expect(team.members[0].ivsPending).toBe(true);
    expect(exportLineupCode(team, snapshot).code).toBe(fixture.code);
    state = store.updateMember(state, team.id, 0, { ...team.members[0], natureId: "adamant" });
    expect(store.load(snapshot).teams[1].members[0].ivsPending).toBe(true);
    const member = { ...team.members[0], displayIvs: { ...team.members[0].displayIvs, hp: 60 } };
    delete member.lineupSource;
    state = store.updateMember(state, team.id, 0, member);
    expect(store.load(snapshot).teams[1].members[0].ivsPending).toBeUndefined();
    expect(store.load(snapshot).teams[1].members[1].ivsPending).toBe(true);
    state = store.rename(state, team.id, "新队名");
    state = store.duplicate(state, team.id);
    expect(decodeLineupCode(exportLineupCode(store.load(snapshot).teams[2], snapshot).code).members[0].talents).toEqual([1, null, null]);
    storage.setItem = () => { throw new Error("quota"); };
    expect(store.importTeam(state, importLineupCode(fixture.code, snapshot)).writeFailed).toBe(true);
    expect(store.load(snapshot).teams).toHaveLength(3);
  });
});
