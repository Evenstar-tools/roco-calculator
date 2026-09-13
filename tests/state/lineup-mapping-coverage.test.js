import { expect, test } from "vitest";
import mapping from "../../public/data/lineup-code-map.json";
import snapshot from "../../data/snapshots/current.json";
import evidence from "../../data/reviewed/nrc-2026-09-10.json";
import { decodeLineupCode, encodeLineupCode, exportLineupCode, importLineupCode } from "../../src/state/lineup-code.js";

const empty = { bloodlineId: 1, natureId: null, talents: [null, null, null], skills: [null, null, null, null], overrides: [0, 0] };
const makeCode = member => encodeLineupCode({ members: [{ ...empty, spriteId: 3001, ...member }], magicId: null, mode: 5 });

test("every current spirit and skill has a verified game ID, with explicit legacy aliases", () => {
  for (const kind of ["spirits", "skills"]) {
    const mapped = new Set(Object.values(mapping[kind]));
    const aliases = kind === "skills" ? mapping.skillAliases ?? {} : {};
    expect(snapshot[kind].filter(entry => !mapped.has(entry.id) && !mapped.has(aliases[entry.id])).map(entry => entry.fullName ?? entry.name)).toEqual([]);
    for (const raw of evidence[kind]) {
      if (kind === "skills" && raw.category === "特性") continue;
      const local = snapshot[kind].find(entry => entry.provenance?.nrc?.id === raw.id);
      expect(local, raw.title ?? raw.name).toBeDefined();
      expect(mapping[kind][raw.game_id], raw.title ?? raw.name).toBe(local.id);
    }
  }
});

test("every mapped game ID imports and exports without changing the original ID", () => {
  for (const id of Object.keys(mapping.spirits)) {
    const code = makeCode({ spriteId: Number(id) });
    expect(exportLineupCode(importLineupCode(code, snapshot, mapping), snapshot, mapping).code, id).toBe(code);
  }
  for (const id of Object.keys(mapping.skills)) {
    const code = makeCode({ skills: [Number(id), null, null, null] });
    expect(exportLineupCode(importLineupCode(code, snapshot, mapping), snapshot, mapping).code, id).toBe(code);
  }
});

test("newly created current members export their verified IDs without source metadata", () => {
  for (const raw of evidence.spirits) {
    const team = importLineupCode(makeCode({ spriteId: raw.game_id }), snapshot, mapping);
    delete team.members[0].lineupSource;
    expect(decodeLineupCode(exportLineupCode(team, snapshot, mapping).code).members[0].spriteId, raw.title).toBe(raw.game_id);
  }
});

test.each([
  ["skill_21fab1d8d76bbbfa", 7050250, "落雨"],
  ["skill_1652bda550a6b2dc", 7170210, "午夜噪音"],
])("exports legacy skill %s with its formal game ID", (legacyId, gameId, formalName) => {
  const team = importLineupCode(makeCode({}), snapshot, mapping);
  team.members[0].skills.four = [legacyId, null, null, null];
  const exported = exportLineupCode(team, snapshot, mapping);
  expect(decodeLineupCode(exported.code).members[0].skills[0]).toBe(gameId);
  const restored = importLineupCode(exported.code, snapshot, mapping).members[0].skills.four[0];
  expect(snapshot.skills.find(skill => skill.id === restored).name).toBe(formalName);
});

test("keeps the two full-moon forms distinct and excludes unrelated official records", () => {
  expect(mapping.spirits[5064]).toBe("spirit_b49b24f5ad669162");
  expect(mapping.spirits[5065]).toBe("spirit_59a68cf08569c4a7");
  expect(mapping.spirits[3777]).toBe("spirit_6b6f44bd83a5f495");
  for (const id of [1111, 10000, 3622, 19000008, 19000009]) expect(mapping.spirits[id]).toBeUndefined();
  for (const id of [200074, 7050531, 7700001]) expect(mapping.skills[id]).toBeUndefined();
});
