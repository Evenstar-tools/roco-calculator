import { readFile, writeFile, mkdir, copyFile, stat } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { parseLuaData } from "./parse-lua-data.mjs";
import { stableId, splitFullName, sha256Hex } from "./normalize.mjs";
import { validateSnapshot } from "./validate.mjs";

const ROOT = new URL("../../", import.meta.url);
const file = (name) => new URL(name, ROOT);
const read = async (name) => JSON.parse(await readFile(file(name), "utf8"));
const RENAMES = {
  "香草甜甜（樱桃饰品）": "香草甜甜",
  "圣代甜甜（樱桃巧克力口味）": "圣代甜甜",
  "加油蟹（两只海葵的样子）": "加油蟹",
  "满月砣（下弦的样子）": "满月砣",
};
const STATS = { hp: "hp", atk: "physicalAttack", spa: "magicalAttack", def: "physicalDefense", spd: "magicalDefense", spe: "speed" };
const required = (value, message) => { if (!value) throw new Error(message); return value; };

// 固定版本纯数据模块转成可审计证据，不执行 Wiki 的 Lua。
export function importNrcModules(responses) {
  const modules = {}, sources = {};
  for (const response of responses) for (const page of response.query.pages) {
    const name = page.title.split("/").at(-1);
    const revision = page.revisions[0], raw = revision.slots.main.content;
    modules[name] = parseLuaData(raw);
    sources[name] = { title: page.title, url: `https://wiki.biligame.com/nrc/index.php?oldid=${revision.revid}`,
      revision: revision.revid, fetchedAt: response.fetchedAt ?? new Date().toISOString(), sha256: sha256Hex(raw) };
  }
  required(modules.Config.current_version === "s4-2026-09-10", "来源赛季不符");
  return { schemaVersion: 1, version: modules.Config.current_version, sources,
    spirits: Object.values(modules.Catalog).map(({ id, game_id, title, number, stage, types, stats, feature_skill_id, learnset_id, evolution_id, image, release }) =>
      ({ id, game_id, title, number, stage, types, stats, feature_skill_id, learnset_id, evolution_id, image: { head: image.head }, release })),
    skills: Object.entries(modules.Skills).map(([id, { name, desc, element, category, damage_class, energy, power, icon, game_id }]) =>
      ({ id, name, desc, element, category, damage_class, energy, power, icon, game_id })),
    learnsets: modules.Learnsets, evolutions: modules.Evolutions };
}

export function applyNrcCurrent(snapshot, evidence) {
  required(evidence.schemaVersion === 1 && evidence.spirits.length === 622 && evidence.skills.length === 824, "新站证据数量异常");
  const next = structuredClone(snapshot), skillIds = new Map(), petIds = new Map();
  const source = evidence.sources;
  const mark = (entity, fields, ref, rawId) => {
    entity.provenance ??= {};
    for (const field of fields) entity.provenance[field] = ref;
    entity.provenance.nrc = { id: rawId, revision: ref.revision };
    entity.source = ref;
  };
  for (const raw of evidence.skills) {
    const isTrait = raw.category === "特性", list = isTrait ? next.traits : next.skills;
    let entity = list.find(({ name }) => name === raw.name || (raw.name === "正模标本" && name === "活体标本"));
    if (!entity) {
      entity = { id: raw.name === "麦芒" ? stableId("skill", "s4-manual-2026-09-09", raw.name) : stableId(isTrait ? "trait" : "skill", "nrc", raw.id) };
      list.push(entity);
    }
    Object.assign(entity, { name: raw.name, description: raw.desc, detailUrl: `https://wiki.biligame.com/nrc/${encodeURIComponent(raw.name)}` });
    const fields = ["identity", "description"];
    if (!isTrait) {
      Object.assign(entity, { type: raw.element.replace(/系$/, ""), category: raw.category === "防御" ? "defense" : raw.category === "状态" ? "status" : raw.damage_class === "物攻" ? "physical" : "magical",
        cost: raw.energy, basePower: raw.power ?? 0, ruleId: entity.ruleId ?? null, ruleParams: entity.ruleParams ?? null });
      delete entity.calculationStatus;
      fields.push("type", "category", "cost", "basePower");
      if (raw.name === "麦芒") entity.asset ??= { sourceUrl: `/assets/skills/${entity.id}.png`, width: 128, height: 128 };
    }
    mark(entity, fields, source.Skills, raw.id);
    skillIds.set(raw.id, entity.id);
  }
  const formalNames = new Set(evidence.skills.map(({ name }) => name));
  for (const skill of next.skills) if (!formalNames.has(skill.name)) {
    skill.provenance.nrc = { status: "legacy-unconfirmed", reason: "新站正式技能表未收录；保留旧 ID 兼容已有配置，不纳入当前学习池" };
  }
  for (const raw of evidence.spirits) {
    let entity = next.spirits.find(({ fullName }) => fullName === raw.title);
    entity ??= next.spirits.find(({ fullName }) => fullName === RENAMES[raw.title]);
    if (!entity) {
      entity = { id: stableId("spirit", "nrc", raw.id), sourceCategory: raw.stage === 4 ? "首领" : "原始形态", asset: { sourceUrl: null, width: 128, height: 128 } };
      if (raw.release?.date === "2026-09-10") entity.changeInfo = { isNew: true };
      next.spirits.push(entity);
    }
    const stats = Object.fromEntries(Object.entries(STATS).map(([key, field]) => [field, raw.stats[key]]));
    stats.total = Object.values(stats).reduce((sum, value) => sum + value, 0);
    const traitId = required(skillIds.get(raw.feature_skill_id), `特性缺失：${raw.title}`);
    Object.assign(entity, { ...splitFullName(raw.title), fullName: raw.title, dexNo: raw.number,
      stage: [null, "一阶", "二阶", "三阶", "首领"][raw.stage],
      sourceCategory: raw.stage === 4 ? "首领形态" : entity.sourceCategory,
      types: raw.types.map((type) => type.replace(/系$/, "")),
      raceStats: stats, traitIds: [traitId], traitName: next.traits.find(({ id }) => id === traitId).name,
      detailUrl: `https://wiki.biligame.com/nrc/${encodeURIComponent(raw.title)}` });
    delete entity.calculationStatus;
    mark(entity, ["identity", "raceStats", "types", "stage", "traitIds"], source.Catalog, raw.id);
    if (entity.provenance.previewIdentity) entity.provenance.previewIdentity.formalIdPending = false;
    petIds.set(raw.id, entity.id);
  }
  required(petIds.size === next.spirits.length, "存在未匹配的本地精灵，禁止静默丢弃");
  const chains = new Map(next.spirits.map(({ id, fullName }) => [id, new Set([fullName])]));
  for (const branches of Object.values(evidence.evolutions)) for (const branch of branches) {
    const members = [...(branch.chain ?? []), ...(branch.lord_branches ?? [])];
    const names = members.map(({ id }) => required(next.spirits.find((pet) => pet.id === petIds.get(id)), `进化链精灵缺失：${id}`).fullName);
    for (const { id } of members) for (const name of names) chains.get(petIds.get(id)).add(name);
  }
  for (const entity of next.spirits) {
    entity.evolutionChainNames = [...chains.get(entity.id)];
    entity.provenance.evolutionChainNames = source.Evolutions;
  }
  if (next.currentPatchChanges) {
    next.currentPatchChanges.patch = { id: evidence.version, label: "S4 新站正式资料", date: "2026.09.10", status: "current", sourceUrl: source.Catalog.url };
    for (const key of ["spirits", "skills"]) {
      for (const change of next.currentPatchChanges[key]) {
        const entity = next[key].find(({ id }) => id === change.entityId);
        if (!entity) continue;
        change.entityName = entity.fullName ?? entity.name;
        for (const item of change.items) {
          const value = item.kind === "stat" && key === "spirits" ? entity.raceStats?.[item.field] : entity[item.field];
          if (value !== undefined) item.after = value;
          if (item.kind === "new" && key === "spirits") item.after = `特性·${entity.traitName}`;
        }
      }
      for (const entity of next[key].filter(({ changeInfo }) => changeInfo?.isNew)) {
        if (!next.currentPatchChanges[key].some(({ entityId }) => entityId === entity.id)) next.currentPatchChanges[key].push({
          entityId: entity.id, entityName: entity.fullName ?? entity.name, isNew: true, isFinal: entity.stage !== "首领",
          items: [{ kind: "new", label: key === "spirits" ? "新增精灵" : "新增技能", after: entity.traitName ?? entity.description }],
        });
      }
    }
  }
  next.learnsets = evidence.spirits.map((raw) => {
    const pool = required(evidence.learnsets[raw.learnset_id], `学习表缺失：${raw.title}`), acquisitions = {};
    const add = (rawId, method) => {
      const id = required(skillIds.get(rawId), `技能缺失：${rawId}`);
      acquisitions[id] ??= [];
      if (!acquisitions[id].includes(method)) acquisitions[id].push(method);
    };
    for (const { skill, level } of pool.native_skills ?? []) add(skill, `默认学习 Lv.${level}`);
    for (const { skill, blood, level } of pool.blood_skills ?? []) add(skill, `${blood}系血脉 Lv.${level}`);
    for (const skill of pool.skill_stones ?? []) add(skill, "技能石");
    if (pool.legendary && (!pool.legendary.requires || pool.legendary.requires === raw.title)) add(pool.legendary.skill, `传说技能（${pool.legendary.requires ?? raw.title}）`);
    const previous = snapshot.learnsets.find(({ spiritId }) => spiritId === petIds.get(raw.id));
    return { ...previous, spiritId: petIds.get(raw.id), skillIds: Object.keys(acquisitions), acquisitions,
      ...(previous?.defaultSkillIds ? { defaultSkillIds: previous.defaultSkillIds.filter((id) => acquisitions[id]) } : {}),
      sources: [source.Learnsets], provenance: { skillIds: source.Learnsets } };
  });
  Object.assign(next.meta, { id: evidence.version, rulesVersion: evidence.version, seasonId: "S4", bwikiRevision: String(source.Catalog.revision),
    revisions: { ...next.meta.revisions, nrcCatalog: source.Catalog.revision, nrcSkills: source.Skills.revision, nrcLearnsets: source.Learnsets.revision },
    nrcSync: { version: evidence.version, authoritativeLearnsets: true, counts: { spirits: 622, skills: 579, traits: 242, traitRecords: 245 },
      sources: Object.values(source), compatibility: "保留已发布实体 ID；降雨、午夜爆音仅留作旧配置兼容" } });
  for (const ref of Object.values(source)) {
    const index = next.meta.sources.findIndex(({ url }) => url === ref.url);
    if (index < 0) next.meta.sources.push(ref); else next.meta.sources[index] = ref;
  }
  for (const key of ["seasonAnnouncementCandidate", "s4PreviewCatalog", "s4Manual", "s4NameCorrections"]) {
    if (next.meta[key]) {
      next.meta[key].supersededBy = evidence.version;
      if (next.meta[key].pending?.length) {
        next.meta[key].historicalPending = next.meta[key].pending;
        next.meta[key].pending = [];
      }
    }
  }
  for (const key of ["spirits", "skills", "traits", "learnsets"]) next.meta.counts[key] = next[key].length;
  next.meta.contentSha256 = null;
  next.meta.contentSha256 = sha256Hex(JSON.stringify(next));
  const validation = validateSnapshot(next);
  required(validation.ok, JSON.stringify(validation));
  return next;
}

async function main() {
  const evidencePath = "data/reviewed/nrc-2026-09-10.json";
  const readSource = async (path) => ({ ...await read(path), fetchedAt: (await stat(file(path))).mtime.toISOString() });
  const evidence = process.argv.includes("--import") ? importNrcModules(await Promise.all([
    readSource("output/nrc-audit/source/fixed-modules.json"), readSource("output/nrc-audit/source/extra-modules.json"),
  ])) : await read(evidencePath);
  if (process.argv.includes("--import")) await writeFile(file(evidencePath), JSON.stringify(evidence) + "\n", "utf8");
  const next = applyNrcCurrent(await read("data/snapshots/current.json"), evidence);
  await mkdir(file("output/nrc-audit/before/"), { recursive: true });
  await copyFile(file("data/snapshots/current.json"), file("output/nrc-audit/before/current.json"), 1).catch((error) => { if (error.code !== "EEXIST") throw error; });
  if (!process.argv.includes("--check")) await writeFile(file("data/snapshots/current.json"), JSON.stringify(next, null, 2) + "\n", "utf8");
  console.log(JSON.stringify({ counts: next.meta.counts, relations: next.learnsets.reduce((sum, { skillIds }) => sum + skillIds.length, 0) }));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
