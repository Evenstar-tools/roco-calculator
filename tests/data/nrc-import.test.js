// @vitest-environment node
import { readFileSync } from "node:fs";
import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { applyNrcCurrent, DEFAULT_NRC_IMPORT_PROFILE, runNrcImport } from "../../scripts/bwiki/apply-nrc-current.mjs";

// 故意使用虚构赛季；这些数值不是 S5 官方数据。
const moduleNames = ["Catalog", "Skills", "Learnsets", "Evolutions", "Config", "Index"];
function fixture() {
  const profile = {
    schemaVersion: 1, status: "reviewed", version: "fixture-next", seasonId: "S99", date: "2099-01-02",
    evidencePath: "data/reviewed/fixture.json", counts: { spirits: 1, skills: 1, traits: 1, traitRecords: 1, relations: 1 },
    sourceRevisions: Object.fromEntries(moduleNames.map((name) => [name, 1])),
  };
  const sources = Object.fromEntries(moduleNames.map((name) => [name, {
    title: `模块:Pets/data/${name}`, revision: 1, url: "https://wiki.biligame.com/nrc/index.php?oldid=1", fetchedAt: "2099-01-02T00:00:00Z",
  }]));
  const evidence = {
    schemaVersion: 1, version: profile.version, sources,
    spirits: [{ id: "pet_fixture", title: "测试精灵", number: "001", stage: 1, types: ["普通系"],
      stats: { hp: 10, atk: 20, spa: 30, def: 40, spd: 50, spe: 60 }, feature_skill_id: "trait_fixture", learnset_id: "pool", image: {} }],
    skills: [
      { id: "trait_fixture", name: "测试特性", desc: "合成测试说明", category: "特性" },
      { id: "skill_fixture", name: "测试技能", desc: "合成测试说明", category: "攻击", damage_class: "物攻", element: "普通系", energy: 2, power: 20 },
    ],
    learnsets: { pool: { native_skills: [{ skill: "skill_fixture", level: 1 }] } }, evolutions: {},
  };
  const snapshot = {
    meta: { id: "fixture-before", rulesVersion: "fixture-before", seasonId: "S98", sources: [], counts: {} },
    spirits: [{ id: "saved-pet", fullName: "测试精灵", baseName: "测试精灵", traitIds: ["saved-trait"], provenance: { nrc: { id: "pet_fixture" } } }],
    skills: [{ id: "saved-skill", name: "测试技能", provenance: { nrc: { id: "skill_fixture" } } }],
    traits: [{ id: "saved-trait", name: "测试特性", provenance: { nrc: { id: "trait_fixture" } } }],
    learnsets: [{ spiritId: "saved-pet", skillIds: ["saved-skill"], defaultSkillIds: ["saved-skill"] }],
    typeChart: { types: Array.from({ length: 18 }, (_, index) => `type${index}`), matrix: Array.from({ length: 18 }, () => Array(18).fill(1)) },
  };
  return { profile, evidence, snapshot };
}
const roots = [];
afterEach(async () => {
  for (const root of roots.splice(0)) {
    if (!path.resolve(root).startsWith(path.join(tmpdir(), "roco-nrc-import-"))) throw new Error("unexpected temporary path");
    await rm(root, { recursive: true, force: true });
  }
});
function lua(value) {
  if (value == null) return "nil";
  if (typeof value !== "object") return JSON.stringify(value);
  return Array.isArray(value) ? `{${value.map(lua).join(",")}}`
    : `{${Object.entries(value).map(([key, item]) => `[${JSON.stringify(key)}]=${lua(item)}`).join(",")}}`;
}
async function prepareFiles({ profile, evidence, snapshot }, importSource) {
  const root = await mkdtemp(path.join(tmpdir(), "roco-nrc-import-"));
  roots.push(root);
  const save = async (name, value) => {
    const target = path.join(root, name);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, JSON.stringify(value), "utf8");
  };
  await save("data/snapshots/current.json", snapshot);
  if (!importSource) await save(profile.evidencePath, evidence);
  else {
    const modules = {
      Catalog: Object.fromEntries(evidence.spirits.map((raw) => [raw.id, raw])),
      Skills: Object.fromEntries(evidence.skills.map((raw) => [raw.id, raw])),
      Learnsets: evidence.learnsets, Evolutions: evidence.evolutions,
      Config: { current_version: evidence.version }, Index: {},
    };
    for (const [name, keys] of [["fixed-modules", moduleNames.slice(0, 3)], ["extra-modules", moduleNames.slice(3)]]) {
      await save(`output/nrc-audit/source/${name}.json`, { query: { pages: keys.map((key) => ({
        title: evidence.sources[key].title,
        revisions: [{ revid: evidence.sources[key].revision, slots: { main: { content: `return ${lua(modules[key])}` } } }],
      })) } });
    }
  }
  return root;
}
async function files(root, directory = "") {
  const result = {};
  for (const entry of await readdir(path.join(root, directory), { withFileTypes: true })) {
    const relative = path.join(directory, entry.name);
    if (entry.isDirectory()) Object.assign(result, await files(root, relative));
    else result[relative] = { content: await readFile(path.join(root, relative), "utf8"), modified: (await stat(path.join(root, relative))).mtimeMs };
  }
  return result;
}

describe("审核后 NRC 导入", () => {
  test("合成未来版本由审核配置驱动，保留配置引用及重复导入结果", () => {
    const { profile, evidence, snapshot } = fixture();
    const next = applyNrcCurrent(snapshot, evidence, profile);
    expect(next.meta).toMatchObject({ id: profile.version, rulesVersion: profile.version, seasonId: "S99", nrcSync: { counts: { spirits: 1, skills: 1, traits: 1, traitRecords: 1 } } });
    expect(next.spirits[0].id).toBe("saved-pet");
    expect(next.learnsets[0]).toMatchObject({ spiritId: "saved-pet", defaultSkillIds: ["saved-skill"] });
    expect(applyNrcCurrent(next, evidence, profile)).toEqual(next);
    expect(snapshot.meta.id).toBe("fixture-before");
  });
  test("正式切季保留旧记录自己的日期和前后值，不把旧 NEW 改名为新季新增", () => {
    const { profile, evidence, snapshot } = fixture();
    snapshot.spirits[0].changeInfo = { isNew: true };
    const oldPatch = { id: "fixture-before", seasonId: "S98", date: "2098.09.10" };
    const spiritRecord = { entityId: "saved-pet", entityName: "测试精灵旧名", isNew: true,
      items: [{ kind: "new", label: "新增精灵", after: "旧新增说明" }] };
    const skillRecord = { entityId: "saved-skill", entityName: "测试技能",
      items: [{ kind: "stat", field: "basePower", label: "威力", before: 5, after: 10 }] };
    snapshot.currentPatchChanges = { patch: oldPatch, spirits: [spiritRecord], skills: [skillRecord] };
    const next = applyNrcCurrent(snapshot, evidence, profile);
    expect(next.spirits[0].changeInfo).toEqual({ isNew: false });
    expect(next.currentPatchChanges).toEqual({
      patch: expect.objectContaining({ id: profile.version, seasonId: "S99", label: "S99 新站正式资料", date: "2099.01.02" }),
      spirits: [{ patch: oldPatch, ...spiritRecord, isNew: false }], skills: [{ patch: oldPatch, ...skillRecord }],
    });
    expect(applyNrcCurrent(next, evidence, profile)).toEqual(next);
    expect(snapshot.currentPatchChanges.spirits[0]).toEqual(spiritRecord);
  });
  test.each(["S98", "S99"])("%s 的 NEW 只在正式跨季时退出，新增说明及 history 原样保留", (seasonId) => {
    const { profile, evidence, snapshot } = fixture();
    snapshot.meta.seasonId = seasonId;
    const history = { patch: { id: "older", seasonId: "S97", date: "2097.01.01" }, isNew: true,
      items: [{ kind: "new", label: "新增精灵", after: "最早新增说明" }] };
    const record = { entityId: "saved-pet", entityName: "测试精灵", isNew: true,
      patch: { id: "fixture-preview", seasonId, date: "2098.09.10" },
      items: [{ kind: "new", label: "新增精灵", after: "当季新增说明" }], history: [history] };
    snapshot.spirits[0].changeInfo = structuredClone(record);
    snapshot.currentPatchChanges = { patch: record.patch, spirits: [structuredClone(record)], skills: [] };
    const next = applyNrcCurrent(snapshot, evidence, profile);
    const expected = { ...record, isNew: seasonId === profile.seasonId };
    expect(next.spirits[0].changeInfo).toEqual(expected);
    expect(next.currentPatchChanges.spirits[0]).toEqual(expected);
    expect(next.spirits[0].changeInfo.history).toEqual([history]);
    expect(applyNrcCurrent(next, evidence, profile)).toEqual(next);
    expect(snapshot.spirits[0].changeInfo).toEqual(record);
  });
  test("同赛季正式补丁调整已有 NEW 时仍保留本季新增身份", () => {
    const { profile, evidence, snapshot } = fixture();
    snapshot.meta.seasonId = profile.seasonId;
    snapshot.spirits[0].raceStats = { physicalAttack: 18 };
    const record = { entityId: "saved-pet", entityName: "测试精灵", isNew: true,
      patch: { id: "fixture-preview", seasonId: profile.seasonId, date: "2099.01.01" },
      items: [{ kind: "new", label: "新增精灵", after: "当季新增说明" }] };
    snapshot.spirits[0].changeInfo = record;
    const next = applyNrcCurrent(snapshot, evidence, profile);
    expect(next.spirits[0].changeInfo).toMatchObject({ isNew: true, items: [{ kind: "stat", before: 18, after: 20 }], history: [record] });
    expect(applyNrcCurrent(next, evidence, profile)).toEqual(next);
  });
  test("正式属性及类别变化使用文本明细，只有数值参数进入 stat 卡", () => {
    const { profile, evidence, snapshot } = fixture();
    snapshot.spirits[0].types = ["草", "火"];
    snapshot.skills[0].type = "草";
    snapshot.skills[0].category = "status";
    const next = applyNrcCurrent(snapshot, evidence, profile);
    expect(next.spirits[0].changeInfo.items).toContainEqual({ kind: "mechanic", field: "types", label: "属性", before: "草、火", after: "普通" });
    expect(next.skills[0].changeInfo.items).toEqual([
      { kind: "mechanic", field: "type", label: "属性", before: "草", after: "普通" },
      { kind: "mechanic", field: "category", label: "类别", before: "status", after: "physical" },
    ]);
  });
  test.each(["ledger", "entity", "both"])("正式值已与公告一致，%s中的公告和旧季 history 完整接续且不换日期", (location) => {
    const { profile, evidence, snapshot } = fixture();
    const oldRecord = { patch: { id: "fixture-before", seasonId: "S98", date: "2098.09.10" },
      entityId: "saved-pet", entityName: "测试精灵", isNew: false,
      items: [{ kind: "stat", field: "physicalAttack", label: "物攻", before: 10, after: 15 }] };
    const announcement = { patch: { id: "fixture-preview", seasonId: "S99", date: "预计 2099.01.02" },
      entityId: "saved-pet", entityName: "测试精灵", isNew: false,
      items: [{ kind: "stat", field: "physicalAttack", label: "物攻", before: 15, after: 20 }], history: [oldRecord] };
    snapshot.spirits[0].raceStats = { physicalAttack: 20 };
    if (location !== "ledger") snapshot.spirits[0].changeInfo = structuredClone(announcement);
    if (location !== "entity") snapshot.currentPatchChanges = { patch: announcement.patch, spirits: [structuredClone(announcement)], skills: [] };
    const before = structuredClone(snapshot);
    const next = applyNrcCurrent(snapshot, evidence, profile);
    expect(next.spirits[0].changeInfo).toEqual(location === "ledger" ? undefined : announcement);
    expect(next.currentPatchChanges.spirits).toEqual([announcement]);
    expect(next.currentPatchChanges.patch.id).toBe(profile.version);
    expect(applyNrcCurrent(next, evidence, profile)).toEqual(next);
    expect(snapshot).toEqual(before);
  });
  test("正式新值单建补丁组，保留公告及旧季每次原始前后值并保持扁平幂等", () => {
    const { profile, evidence, snapshot } = fixture();
    const oldRecord = { patch: { id: "fixture-before", seasonId: "S98", date: "2098.09.10" },
      entityId: "saved-pet", entityName: "测试精灵", items: [{ kind: "stat", field: "physicalAttack", before: 10, after: 15 }] };
    const announcement = { patch: { id: "fixture-preview", seasonId: "S99", date: "预计 2099.01.02" },
      entityId: "saved-pet", entityName: "测试精灵", items: [{ kind: "stat", field: "physicalAttack", before: 15, after: 20 }], history: [oldRecord] };
    snapshot.spirits[0].raceStats = { physicalAttack: 20 };
    snapshot.spirits[0].changeInfo = structuredClone(announcement);
    snapshot.skills[0].basePower = 10;
    const oldSkill = { entityId: "saved-skill", entityName: "测试技能", patch: oldRecord.patch,
      items: [{ kind: "stat", field: "basePower", before: 5, after: 10 }] };
    snapshot.currentPatchChanges = { patch: announcement.patch, spirits: [announcement], skills: [oldSkill] };
    evidence.spirits[0].stats.atk = 22;
    const before = structuredClone(snapshot);
    const next = applyNrcCurrent(snapshot, evidence, profile);
    expect(next.spirits[0].changeInfo).toMatchObject({ patch: { id: profile.version, date: "2099.01.02" }, isNew: false,
      items: [{ kind: "stat", field: "physicalAttack", before: 20, after: 22 }], history: [expect.objectContaining({ patch: announcement.patch, items: announcement.items }), oldRecord] });
    expect(next.spirits[0].changeInfo.history.every(record => !record.history)).toBe(true);
    expect(next.skills[0].changeInfo).toMatchObject({ patch: { id: profile.version },
      items: [{ kind: "stat", field: "basePower", before: 10, after: 20 }], history: [oldSkill] });
    expect(applyNrcCurrent(next, evidence, profile)).toEqual(next);
    expect(snapshot).toEqual(before);
  });
  test("S5 未审核、未显式指定配置或未经审核的来源修订均拒绝", () => {
    const { profile, evidence, snapshot } = fixture();
    expect(() => applyNrcCurrent(snapshot, evidence, { ...profile, seasonId: "S5", status: "candidate" })).toThrow("尚未审核");
    expect(() => applyNrcCurrent(snapshot, evidence)).toThrow("来源赛季不符");
    evidence.sources.Skills.revision = 2;
    expect(() => applyNrcCurrent(snapshot, evidence, profile)).toThrow("来源修订未经审核");
  });
  test.each(["spirits", "skills", "traits", "traitRecords", "relations"])("%s 数量不符不能落入正式快照", (key) => {
    const { profile, evidence, snapshot } = fixture();
    profile.counts[key] += 1;
    expect(() => applyNrcCurrent(snapshot, evidence, profile)).toThrow(/数量异常/);
  });
  test("改名优先沿用 NRC ID，对应存档与学习集不换 ID", () => {
    const { profile, evidence, snapshot } = fixture();
    evidence.spirits[0].title = "测试精灵新名";
    evidence.skills[0].name = "测试特性新名";
    evidence.skills[1].name = "测试技能新名";
    const next = applyNrcCurrent(snapshot, evidence, profile);
    expect(next.spirits[0]).toMatchObject({ id: "saved-pet", fullName: "测试精灵新名", traitIds: ["saved-trait"] });
    expect(next.traits[0]).toMatchObject({ id: "saved-trait", name: "测试特性新名" });
    expect(next.skills[0]).toMatchObject({ id: "saved-skill", name: "测试技能新名" });
    expect(next.learnsets[0].skillIds).toEqual(["saved-skill"]);
  });
  test("ID 和同名记录指向不同实体、重复 ID、名称复用均显式拒绝", () => {
    const { profile, evidence, snapshot } = fixture();
    snapshot.skills.push({ id: "other-skill", name: "另一技能", provenance: { nrc: { id: "other-source" } } });
    evidence.skills[1].name = "另一技能";
    expect(() => applyNrcCurrent(snapshot, evidence, profile)).toThrow("映射冲突");
    evidence.skills[1].name = "测试技能";
    evidence.skills[1].id = "other-new-source";
    expect(() => applyNrcCurrent(snapshot, evidence, profile)).toThrow("名称对应其他来源 ID");
    evidence.skills[1].id = evidence.skills[0].id;
    expect(() => applyNrcCurrent(snapshot, evidence, profile)).toThrow("ID 缺失或重复");
  });
  test("同一 NRC ID 从特性换成技能需要显式裁决，不能创建第二份身份", () => {
    const { profile, evidence, snapshot } = fixture();
    snapshot.traits.push({ id: "other-trait", name: "既有特性", provenance: { nrc: { id: "skill_fixture" } } });
    expect(() => applyNrcCurrent(snapshot, evidence, profile)).toThrow("技能/特性类别冲突");
  });
  test("攻击技能未知威力、类别、能耗及精灵未知种族值均阻断，不填默认值", () => {
    for (const field of ["power", "energy", "damage_class"]) {
      const { profile, evidence, snapshot } = fixture();
      evidence.skills[1][field] = null;
      expect(() => applyNrcCurrent(snapshot, evidence, profile)).toThrow("待核验");
    }
    const { profile, evidence, snapshot } = fixture();
    evidence.spirits[0].stats.hp = null;
    expect(() => applyNrcCurrent(snapshot, evidence, profile)).toThrow("种族值待核验");
  });
  test.each([false, true])("--check 包括 --import=%s 时文件内容、时间和目录均不改变", async (importSource) => {
    const input = fixture();
    const root = await prepareFiles(input, importSource);
    const before = await files(root);
    await expect(runNrcImport({ root, profile: input.profile, importSource, check: true, output: "candidate/must-not-exist.json" })).resolves.toMatchObject({ relations: 1 });
    expect(await files(root)).toEqual(before);
    await expect(stat(path.join(root, "output/nrc-audit/before"))).rejects.toMatchObject({ code: "ENOENT" });
  });
  test("--output 校验后仅生成候选，--import 也不写 reviewed/backup/current", async () => {
    const input = fixture();
    const root = await prepareFiles(input, true);
    const before = await files(root);
    await runNrcImport({ root, profile: input.profile, importSource: true, output: "candidate/next.json" });
    const after = await files(root);
    const candidate = JSON.parse(after[path.join("candidate", "next.json")].content);
    expect(candidate.meta.id).toBe(input.profile.version);
    delete after[path.join("candidate", "next.json")];
    expect(after).toEqual(before);
  });
  test.each(["data/snapshots/current.json", "data/reviewed/fixture.json", "output/nrc-audit/source/fixed-modules.json", "output/nrc-audit/source/extra-modules.json"])("--output 不能覆盖导入输入 %s", async (output) => {
    const input = fixture();
    const root = await prepareFiles(input, true);
    const before = await files(root);
    await expect(runNrcImport({ root, profile: input.profile, importSource: true, output })).rejects.toThrow("候选输出不能覆盖");
    expect(await files(root)).toEqual(before);
  });
  test("导入来源通过但快照完整校验失败时，证据/备份/current 均不写", async () => {
    const input = fixture();
    input.evidence.learnsets.pool.native_skills[0].skill = "missing-skill";
    const root = await prepareFiles(input, true);
    const before = await files(root);
    await expect(runNrcImport({ root, profile: input.profile, importSource: true })).rejects.toThrow("技能缺失");
    expect(await files(root)).toEqual(before);
  });
  test("默认 S4 审阅资料仍可完整回放，并保持正式 ID、非攻击零威力和幂等", () => {
    const read = (file) => JSON.parse(readFileSync(file, "utf8"));
    const current = read("data/snapshots/current.json");
    const evidence = read(DEFAULT_NRC_IMPORT_PROFILE.evidencePath);
    const next = applyNrcCurrent(current, evidence);
    expect(next.spirits.map(({ id }) => id)).toEqual(current.spirits.map(({ id }) => id));
    expect(next.skills.map(({ id }) => id)).toEqual(current.skills.map(({ id }) => id));
    expect(next.meta.nrcSync.counts).toEqual({ spirits: 622, skills: 579, traits: 242, traitRecords: 245 });
    expect(next.skills.filter(({ category }) => ["status", "defense"].includes(category)).every(({ basePower }) => basePower === 0)).toBe(true);
    expect(applyNrcCurrent(next, evidence)).toEqual(next);
  });
});
