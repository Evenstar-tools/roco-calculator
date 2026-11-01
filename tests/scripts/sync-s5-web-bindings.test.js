// @vitest-environment node
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { readFileSync } from "node:fs";
import { afterEach, expect, test, vi } from "vitest";
import { createS5WebAssetPlan, downloadS5WebAssets, mergeS5LineupMapping, resolveS5AssetUrls } from "../../scripts/bwiki/sync-s5-web-bindings.mjs";
import { applyS5Bwiki } from "../../scripts/bwiki/apply-s5-bwiki.mjs";
import { withWebPreview } from "../../src/features/s5-preview/with-web-preview.js";
import { encodeLineupCode, exportLineupCode, importLineupCode } from "../../src/state/lineup-code.js";

const roots = [];
afterEach(async () => {
  for (const root of roots.splice(0)) {
    if (!path.resolve(root).startsWith(path.join(tmpdir(), "roco-s5-web-bindings-"))) throw new Error("unexpected temporary path");
    await rm(root, { recursive: true, force: true });
  }
});

function fixture() {
  const base = { spirits: [{ id: "old-pet", fullName: "旧精灵", provenance: { nrc: { id: "pet_000001" } } }], skills: [] };
  const snapshot = { spirits: [...base.spirits,
    { id: "saved-preview", fullName: "新增首领", provenance: { nrc: { id: "pet_000706" } } },
    { id: "new-base", fullName: "新形态", provenance: { nrc: { id: "pet_000620" } } },
  ], skills: [{ id: "saved-skill", name: "专属技能", provenance: { nrc: { id: "dc5a_abc" } } }] };
  const evidence = { moduleSources: { Catalog: [{ revision: 123 }], Skills: [{ revision: 124 }] }, modules: {
    Catalog: {
      pet_000001: { title: "旧精灵", game_id: 3001, image: { head: "PetAvatar_3001.png" } },
      pet_000620: { title: "新形态", game_id: 3784, image: { head: "PetAvatar_3784.png" } },
      pet_000706: { title: "新增首领", game_id: 5067, image: { head: "PetAvatar_4110.png" } },
    },
    Skills: {
      dc5a_abc: { name: "专属技能", category: "攻击", game_id: 7100370, icon: "Skill_409024.png" },
      dc5g_abc: { name: "首领特性", category: "特性", game_id: 200340, icon: "Feature_200338.png" },
    },
    SkillSeasons: { dc5a_abc: "S5", dc5g_abc: "S5" }, SeasonFeatures: { pet_000706: "dc5g_abc" },
  } };
  return { evidence, snapshot, base };
}

test("only changed/new avatar identities and S5 combat skill icons enter the Web plan", () => {
  const { evidence, snapshot, base } = fixture();
  const plan = createS5WebAssetPlan(evidence, snapshot, base);
  expect(plan.spirits.map(entry => entry.id)).toEqual(["new-base", "saved-preview"]);
  expect(plan.spirits.find(entry => entry.id === "saved-preview")).toMatchObject({ gameId: 5067, sourceFile: "PetAvatar_4110.png" });
  expect(plan.skills).toEqual([expect.objectContaining({ id: "saved-skill", sourceFile: "Skill_409024.png" })]);
  expect(JSON.stringify(plan)).not.toContain("sha256");
});

test("lineup map uses documented game IDs, preserves compatibility IDs, and omits feature IDs", () => {
  const { evidence, snapshot } = fixture();
  const mapping = { sources: {}, spirits: { 3001: "old-pet", 3999: "old-pet" }, skills: { 7100300: "saved-skill" },
    skillAliases: { "old-skill-alias": "saved-skill" }, skillExportIds: { "saved-skill": 7100300 }, magic: { 104002: "旧魔法" } };
  const original = structuredClone(mapping);
  const result = mergeS5LineupMapping(mapping, evidence, snapshot);
  expect(result.missing).toEqual([]);
  expect(result.mapping.spirits).toMatchObject({ 3001: "old-pet", 3999: "old-pet", 3784: "new-base", 5067: "saved-preview" });
  expect(result.mapping.skills).toMatchObject({ 7100300: "saved-skill", 7100370: "saved-skill" });
  expect(result.mapping.skills).not.toHaveProperty("200340");
  expect(result.mapping.skillAliases).toEqual(mapping.skillAliases);
  expect(result.mapping.skillExportIds["saved-skill"]).toBe(7100300);
  expect(mapping).toEqual(original);
  expect(mergeS5LineupMapping(result.mapping, evidence, snapshot).mapping).toEqual(result.mapping);
  expect(() => mergeS5LineupMapping({ ...mapping, spirits: { 5067: "unrelated" } }, evidence, snapshot)).toThrow("游戏 ID 冲突");
});

test("unknown identities stay missing and no game ID is inferred from the avatar filename", () => {
  const { evidence, snapshot } = fixture();
  delete evidence.modules.Catalog.pet_000706.game_id;
  snapshot.spirits = snapshot.spirits.filter(entry => entry.id !== "new-base");
  const result = mergeS5LineupMapping({ sources: {}, spirits: {}, skills: {} }, evidence, snapshot);
  expect(result.mapping.spirits).not.toHaveProperty("4110");
  expect(result.missing).toEqual([{ kind: "spirits", nrcId: "pet_000620", name: "新形态", gameId: 3784 }]);
});

test("a renumbered source ID cannot bind another named spirit", () => {
  const { evidence, snapshot } = fixture();
  snapshot.spirits.find(entry => entry.id === "old-pet").provenance.nrc.id = "pet_000706";
  snapshot.spirits.find(entry => entry.id === "saved-preview").provenance.nrc.id = "old-ordinal";
  const result = mergeS5LineupMapping({ sources: {}, spirits: {}, skills: {} }, evidence, snapshot);
  expect(result.mapping.spirits[5067]).toBe("saved-preview");
  expect(result.mapping.spirits[3001]).toBe("old-pet");
});

test("Web assets retain source pixels, reuse completed files, and never create a miniapp tree", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "roco-s5-web-bindings-"));
  roots.push(root);
  const { evidence, snapshot, base } = fixture();
  const plan = createS5WebAssetPlan(evidence, snapshot, base);
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6hWUAAAAASUVORK5CYII=", "base64");
  const fetchImpl = vi.fn(async url => {
    if (String(url).startsWith("https://wiki.biligame.com/nrc/api.php")) {
      const titles = new URL(url).searchParams.get("titles").split("|");
      return { ok: true, json: async () => ({ query: { pages: titles.map(title => ({ title: title.replace("File:", "文件:").replaceAll("_", " "),
        imageinfo: [{ url: `https://patchwiki.biligame.com/images/nrc/test/${title.slice(5)}`, width: 128, height: 128 }] })) } }) };
    }
    return { ok: true, arrayBuffer: async () => png };
  });
  const first = await downloadS5WebAssets(plan, { root, fetchImpl });
  for (const entry of [...first.spirits, ...first.skills]) {
    expect(entry).toMatchObject({ width: 1, height: 1, bytes: png.length });
    expect(await readFile(path.join(root, "public", entry.localUrl.slice(1)))).toEqual(png);
  }
  fetchImpl.mockClear();
  expect(await downloadS5WebAssets(plan, { root, previous: first, fetchImpl })).toEqual(first);
  expect(fetchImpl.mock.calls).toHaveLength(1);
  expect(await readdir(root)).toEqual(["public"]);
  await expect(resolveS5AssetUrls([{ name: "缺图", sourceFile: "Missing.png" }], {
    fetchImpl: async () => ({ ok: true, json: async () => ({ query: { pages: [] } }) }),
  })).rejects.toThrow("BWIKI 图片缺失");
});

test("the actual S5 source IDs round-trip through the published local identity map", () => {
  const read = file => JSON.parse(readFileSync(file, "utf8"));
  const evidence = read("data/reviewed/nrc-s5-20261101.json");
  const base = read("data/snapshots/current.json");
  const snapshot = applyS5Bwiki(withWebPreview(base), evidence);
  const mapping = read("public/data/lineup-code-map.json");
  const result = mergeS5LineupMapping(mapping, evidence, snapshot);
  expect(result.missing).toEqual([]);
  expect(result.mapping).toEqual(mapping);
  const plan = createS5WebAssetPlan(evidence, snapshot, base);
  const member = { spriteId: 3001, bloodlineId: 1, natureId: null, talents: [null, null, null],
    skills: [null, null, null, null], overrides: [0, 0] };
  const check = raw => {
    const code = encodeLineupCode({ members: [{ ...member, ...raw }], magicId: null, mode: 5 });
    const imported = importLineupCode(code, snapshot, mapping);
    expect(exportLineupCode(imported, snapshot, mapping).code).toBe(code);
  };
  for (const spirit of plan.spirits) {
    expect(mapping.spirits[spirit.gameId], spirit.name).toBe(spirit.id);
    check({ spriteId: spirit.gameId });
  }
  for (const skill of plan.skills) {
    expect(mapping.skills[skill.gameId], skill.name).toBe(skill.id);
    expect(mapping.skillExportIds[skill.id], skill.name).toBe(skill.gameId);
    check({ skills: [skill.gameId, null, null, null] });
  }
  for (const name of ["阿布", "圣龙阿布", "超能阿布", "铃兰"]) {
    const placeholder = snapshot.spirits.find(spirit => spirit.fullName === name);
    expect(Object.values(mapping.spirits), name).not.toContain(placeholder.id);
  }
});
