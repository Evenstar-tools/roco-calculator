import { readFile, writeFile, mkdir, copyFile, stat, realpath } from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { parseLuaData } from "./parse-lua-data.mjs";
import { stableId, splitFullName, sha256Hex } from "./normalize.mjs";
import { validateSnapshot } from "./validate.mjs";
import { mergeEntityChangeInfo } from "../../src/data/entity-change-history.js";

const ROOT = new URL("../../", import.meta.url);
export const DEFAULT_NRC_IMPORT_PROFILE = JSON.parse(readFileSync(new URL("data/reviewed/nrc-s4-import-profile.json", ROOT), "utf8"));
const MODULES = ["Catalog", "Skills", "Learnsets", "Evolutions", "Config", "Index"];
const RENAMES = {
  "香草甜甜（樱桃饰品）": "香草甜甜",
  "圣代甜甜（樱桃巧克力口味）": "圣代甜甜",
  "加油蟹（两只海葵的样子）": "加油蟹",
  "满月砣（下弦的样子）": "满月砣",
};
const STATS = { hp: "hp", atk: "physicalAttack", spa: "magicalAttack", def: "physicalDefense", spd: "magicalDefense", spe: "speed" };
const STAT_LABELS = { hp: "生命", physicalAttack: "物攻", magicalAttack: "魔攻", physicalDefense: "物防", magicalDefense: "魔防", speed: "速度" };
const required = (value, message) => { if (!value) throw new Error(message); return value; };

function formalChangeItems(previous, entity, key, before, after) {
  if (!previous) return [];
  const items = [];
  const add = (kind, field, label, oldValue, newValue) => {
    // Missing preview fields are unknown, not historical zeroes or empty values.
    if (oldValue == null || newValue == null || isDeepStrictEqual(oldValue, newValue)) return;
    items.push({ kind, field, label, before: oldValue, after: newValue });
  };
  if (key === "skills") {
    for (const [field, label] of [["basePower", "威力"], ["cost", "能耗"], ["type", "属性"], ["category", "类别"]]) {
      add(["basePower", "cost"].includes(field) ? "stat" : "mechanic", field, label, previous[field], entity[field]);
    }
    add("mechanic", "description", "机制", previous.description, entity.description);
  } else {
    for (const [field, label] of Object.entries(STAT_LABELS)) {
      add("stat", field, label, previous.raceStats?.[field], entity.raceStats?.[field]);
    }
    add("mechanic", "types", "属性", previous.types?.join("、"), entity.types?.join("、"));
    const traitText = (snapshot, spirit) => {
      const traits = (spirit.traitIds ?? []).map(id => snapshot.traits.find(trait => trait.id === id));
      return traits.length && traits.every(trait => typeof trait?.description === "string")
        ? traits.map(trait => `${trait.name}：${trait.description}`).join("\n") : null;
    };
    add("trait", "traitIds", "特性", traitText(before, previous), traitText(after, entity));
    const oldPool = before.learnsets.find(pool => pool.spiritId === entity.id);
    const newPool = after.learnsets.find(pool => pool.spiritId === entity.id);
    if (oldPool && newPool && !isDeepStrictEqual([...oldPool.skillIds].sort(), [...newPool.skillIds].sort())) {
      const names = (snapshot, ids) => ids.map(id => snapshot.skills.find(skill => skill.id === id)?.name ?? id).join("、");
      add("learnset", "skillIds", "可学习技能", names(before, oldPool.skillIds), names(after, newPool.skillIds));
    }
  }
  return items;
}

function preserveChangeHistory(snapshot, next, patch) {
  const previousChanges = next.currentPatchChanges;
  const changesVersion = snapshot.meta.id !== patch.id;
  const changesSeason = snapshot.meta.seasonId !== patch.seasonId;
  const recordSeason = (info, fallbackPatch = previousChanges?.patch) => {
    const recordPatch = info?.patch ?? fallbackPatch;
    return recordPatch?.seasonId ?? recordPatch?.id?.match(/^s\d+(?=[-_]|$)/i)?.[0]?.toUpperCase() ?? snapshot.meta.seasonId;
  };
  const retireOldNew = (info, fallbackPatch) => changesSeason && info?.isNew && recordSeason(info, fallbackPatch) !== patch.seasonId
    ? { ...info, isNew: false } : info;
  let hasFormalChanges = false;
  const collections = {};
  for (const key of ["spirits", "skills"]) {
    const entries = new Map((previousChanges?.[key] ?? []).map(entry => [entry.entityId, entry]));
    const previousById = new Map(snapshot[key].map(entity => [entity.id, entity]));
    for (const entity of next[key]) {
      const previous = previousById.get(entity.id);
      const entry = entries.get(entity.id);
      const previousInfo = entry ? { patch: previousChanges.patch, ...entry } : previous ? entity.changeInfo : undefined;
      const info = previous?.changeInfo?.patch
        ? !entry || isDeepStrictEqual(previousInfo, entity.changeInfo)
          ? entity.changeInfo : mergeEntityChangeInfo(previousInfo, entity.changeInfo)
        : previousInfo;
      const items = formalChangeItems(previous, entity, key, snapshot, next);
      const isNew = !previous && (key === "skills" || entity.changeInfo?.isNew);
      if (items.length || isNew) {
        hasFormalChanges = true;
        const historical = info && !info.patch ? {
          entityId: entity.id, entityName: previous?.fullName ?? previous?.name,
          patch: previousChanges?.patch ?? { id: snapshot.meta.id, seasonId: snapshot.meta.seasonId }, ...info,
        } : info;
        const changeInfo = mergeEntityChangeInfo(historical, {
          patch, entityId: entity.id, entityName: entity.fullName ?? entity.name,
          isNew: Boolean(isNew || (info?.isNew && recordSeason(info) === patch.seasonId)),
          ...(isNew ? { isFinal: entity.stage !== "首领" } : {}),
          items: isNew ? [{ kind: "new", label: key === "spirits" ? "新增精灵" : "新增技能", after: entity.traitName ?? entity.description }] : items,
        });
        entity.changeInfo = changeInfo;
        entries.set(entity.id, changeInfo);
      } else if (previous?.changeInfo?.patch) {
        // Projected announcement records may live on the entity, the ledger, or both.
        // Preserve their own date and before/after even when formal values agree.
        entity.changeInfo = info;
        entries.set(entity.id, info);
      }
      if (entity.changeInfo) entity.changeInfo = retireOldNew(entity.changeInfo, entry?.patch ?? previousChanges?.patch);
    }
    collections[key] = [...entries.values()].map(entry => retireOldNew(entry));
  }
  if (!previousChanges && !hasFormalChanges && !Object.values(collections).some(entries => entries.length)) return;
  const changesPatch = changesVersion || hasFormalChanges ? patch : previousChanges?.patch ?? patch;
  next.currentPatchChanges = { ...previousChanges, patch: changesPatch };
  for (const key of ["spirits", "skills"]) {
    next.currentPatchChanges[key] = collections[key].map(entry => changesPatch !== previousChanges?.patch && !entry.patch
      ? { patch: previousChanges?.patch, ...entry } : entry);
  }
}

export function validateNrcImportProfile(profile) {
  required(profile?.schemaVersion === 1 && profile.status === "reviewed", "导入配置尚未审核");
  required(typeof profile.version === "string" && profile.version.length > 0 &&
    /^S\d+$/.test(profile.seasonId) && /^\d{4}-\d{2}-\d{2}$/.test(profile.date), "导入配置赛季身份不完整");
  required(typeof profile.evidencePath === "string" && profile.evidencePath.length > 0, "导入配置缺少证据路径");
  for (const key of ["spirits", "skills", "traits", "traitRecords", "relations"]) {
    required(Number.isSafeInteger(profile.counts?.[key]) && profile.counts[key] > 0, `导入配置缺少预期数量：${key}`);
  }
  for (const key of MODULES) {
    required(Number.isSafeInteger(profile.sourceRevisions?.[key]) && profile.sourceRevisions[key] > 0, `导入配置缺少已审核修订：${key}`);
  }
  return profile;
}

function validateEvidence(evidence, profile) {
  validateNrcImportProfile(profile);
  required(evidence?.schemaVersion === 1 && evidence.version === profile.version, "来源赛季不符");
  for (const name of MODULES) {
    const ref = evidence.sources?.[name];
    required(ref?.title === `模块:Pets/data/${name}` && ref.revision === profile.sourceRevisions[name], `来源修订未经审核：${name}`);
  }
  const spirits = evidence.spirits, skills = evidence.skills;
  required(Array.isArray(spirits) && Array.isArray(skills) && spirits.length === profile.counts.spirits &&
    skills.length === profile.counts.skills + profile.counts.traitRecords, "新站证据数量异常");
  for (const [label, rows] of [["精灵", spirits], ["技能/特性", skills]]) {
    const ids = new Set();
    for (const raw of rows) {
      required(typeof raw.id === "string" && raw.id && !ids.has(raw.id), `来源${label} ID 缺失或重复：${raw.id}`);
      ids.add(raw.id);
    }
  }
  const names = new Map();
  for (const raw of skills) {
    required(typeof raw.name === "string" && raw.name && typeof raw.desc === "string", `技能/特性资料不完整：${raw.id}`);
    const previous = names.get(raw.name);
    required(!previous || (raw.category === "特性" && previous.category === "特性" && previous.desc === raw.desc), `来源同名技能/特性冲突：${raw.name}`);
    names.set(raw.name, raw);
    if (raw.category === "特性") continue;
    required(["攻击", "防御", "状态"].includes(raw.category) && typeof raw.element === "string", `技能类别/属性待核验：${raw.name}`);
    required(Number.isSafeInteger(raw.energy) && raw.energy >= 0, `技能能耗待核验：${raw.name}`);
    if (raw.category === "攻击") {
      required(["物攻", "魔攻"].includes(raw.damage_class) && Number.isFinite(raw.power) && raw.power >= 0, `攻击技能威力/类别待核验：${raw.name}`);
    } else {
      required(raw.power == null || (Number.isFinite(raw.power) && raw.power >= 0), `技能威力无效：${raw.name}`);
    }
  }
  const traits = skills.filter(({ category }) => category === "特性");
  required(traits.length === profile.counts.traitRecords && new Set(traits.map(({ name }) => name)).size === profile.counts.traits &&
    skills.length - traits.length === profile.counts.skills, "新站证据分类数量异常");
  const titles = new Set();
  for (const raw of spirits) {
    required(typeof raw.title === "string" && raw.title && !titles.has(raw.title), `来源精灵名称缺失或重复：${raw.title}`);
    titles.add(raw.title);
    required(Object.keys(STATS).every((key) => Number.isSafeInteger(raw.stats?.[key]) && raw.stats[key] > 0), `精灵种族值待核验：${raw.title}`);
    required(/^\d+$/.test(String(raw.number)) && Number(raw.number) > 0 && [1, 2, 3, 4].includes(raw.stage) &&
      Array.isArray(raw.types) && raw.types.length >= 1 && raw.types.length <= 2 && raw.types.every((type) => typeof type === "string"), `精灵身份/属性待核验：${raw.title}`);
  }
}

function matchEntity(list, raw, { field = "name", alias, equivalentTraits = new Map() } = {}) {
  const name = field === "fullName" ? raw.title : raw.name;
  const byId = list.filter((entity) => entity.provenance?.nrc?.id === raw.id);
  const byName = list.filter((entity) => entity[field] === name || (alias && entity[field] === alias));
  required(byId.length <= 1 && byName.length <= 1, `实体映射不唯一：${name}`);
  required(!byId.length || !byName.length || byId[0] === byName[0], `实体 ID 与名称映射冲突：${name}`);
  const entity = byId[0] ?? byName[0];
  const previousId = entity?.provenance?.nrc?.id;
  const sameTrait = equivalentTraits.get(previousId);
  required(!previousId || previousId === raw.id || (raw.category === "特性" && sameTrait?.name === raw.name && sameTrait.desc === raw.desc), `名称对应其他来源 ID：${name}`);
  return entity;
}

// 固定版本纯数据模块转成可审计证据，不执行 Wiki 的 Lua。
export function importNrcModules(responses, profile = DEFAULT_NRC_IMPORT_PROFILE) {
  validateNrcImportProfile(profile);
  const modules = {}, sources = {};
  for (const response of responses) for (const page of response.query.pages) {
    const name = page.title.split("/").at(-1);
    required(MODULES.includes(name) && !modules[name], `来源模块未知或重复：${name}`);
    const revision = page.revisions[0], raw = revision.slots.main.content;
    modules[name] = parseLuaData(raw);
    sources[name] = { title: page.title, url: `https://wiki.biligame.com/nrc/index.php?oldid=${revision.revid}`,
      revision: revision.revid, fetchedAt: response.fetchedAt ?? new Date().toISOString(), sha256: sha256Hex(raw) };
  }
  required(MODULES.every((name) => modules[name]), "来源模块不完整");
  required(modules.Config.current_version === profile.version, "来源赛季不符");
  const evidence = { schemaVersion: 1, version: modules.Config.current_version, sources,
    spirits: Object.values(modules.Catalog).map(({ id, game_id, title, number, stage, types, stats, feature_skill_id, learnset_id, evolution_id, image, release }) =>
      ({ id, game_id, title, number, stage, types, stats, feature_skill_id, learnset_id, evolution_id, image: { head: image?.head }, release })),
    skills: Object.entries(modules.Skills).map(([id, { name, desc, element, category, damage_class, energy, power, icon, game_id }]) =>
      ({ id, name, desc, element, category, damage_class, energy, power, icon, game_id })),
    learnsets: modules.Learnsets, evolutions: modules.Evolutions };
  validateEvidence(evidence, profile);
  return evidence;
}

export function applyNrcCurrent(snapshot, evidence, profile = DEFAULT_NRC_IMPORT_PROFILE) {
  validateEvidence(evidence, profile);
  const next = structuredClone(snapshot), skillIds = new Map(), petIds = new Map();
  const source = evidence.sources;
  const equivalentTraits = new Map(evidence.skills.filter(({ category }) => category === "特性").map((raw) => [raw.id, raw]));
  const mark = (entity, fields, ref, rawId) => {
    entity.provenance ??= {};
    for (const field of fields) entity.provenance[field] = ref;
    entity.provenance.nrc = { id: rawId, revision: ref.revision };
    entity.source = ref;
  };
  for (const raw of evidence.skills) {
    const isTrait = raw.category === "特性", list = isTrait ? next.traits : next.skills;
    required(!(isTrait ? next.skills : next.traits).some((entity) => entity.provenance?.nrc?.id === raw.id), `来源 ID 的技能/特性类别冲突：${raw.name}`);
    let entity = matchEntity(list, raw, { alias: raw.name === "正模标本" ? "活体标本" : undefined, equivalentTraits });
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
    skill.provenance ??= {};
    skill.provenance.nrc = { ...skill.provenance.nrc, status: "legacy-unconfirmed", reason: "新站正式技能表未收录；保留旧 ID 兼容已有配置，不纳入当前学习池" };
  }
  for (const raw of evidence.spirits) {
    let entity = matchEntity(next.spirits, raw, { field: "fullName", alias: RENAMES[raw.title] });
    if (!entity) {
      entity = { id: stableId("spirit", "nrc", raw.id), sourceCategory: raw.stage === 4 ? "首领" : "原始形态", asset: { sourceUrl: null, width: 128, height: 128 } };
      if (raw.release?.date === profile.date) entity.changeInfo = { isNew: true };
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
  required(next.learnsets.reduce((sum, { skillIds }) => sum + skillIds.length, 0) === profile.counts.relations, "学习关系数量异常");
  preserveChangeHistory(snapshot, next, { id: evidence.version, seasonId: profile.seasonId,
    label: `${profile.seasonId} 新站正式资料`, date: profile.date.replaceAll("-", "."), status: "current", sourceUrl: source.Catalog.url });
  Object.assign(next.meta, { id: evidence.version, rulesVersion: evidence.version, seasonId: profile.seasonId, bwikiRevision: String(source.Catalog.revision),
    revisions: { ...next.meta.revisions, nrcCatalog: source.Catalog.revision, nrcSkills: source.Skills.revision, nrcLearnsets: source.Learnsets.revision },
    nrcSync: { version: evidence.version, authoritativeLearnsets: true, counts: { spirits: profile.counts.spirits, skills: profile.counts.skills, traits: profile.counts.traits, traitRecords: profile.counts.traitRecords },
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

// 所有解析与校验完成后才写文件；--check 包含来源导入时也保持只读。
export async function runNrcImport({ root = ROOT, profile = DEFAULT_NRC_IMPORT_PROFILE, profilePath, importSource = false, check = false, output } = {}) {
  validateNrcImportProfile(profile);
  const rootPath = root instanceof URL ? root : pathToFileURL(`${path.resolve(root)}${path.sep}`);
  const file = (name) => new URL(name, rootPath);
  const read = async (name) => JSON.parse(await readFile(file(name), "utf8"));
  const readSource = async (name) => ({ ...await read(name), fetchedAt: (await stat(file(name))).mtime.toISOString() });
  const evidence = importSource ? importNrcModules(await Promise.all([
    readSource("output/nrc-audit/source/fixed-modules.json"), readSource("output/nrc-audit/source/extra-modules.json"),
  ]), profile) : await read(profile.evidencePath);
  const next = applyNrcCurrent(await read("data/snapshots/current.json"), evidence, profile);
  if (!check && output) {
    const rootDirectory = fileURLToPath(rootPath);
    const outputPath = path.resolve(rootDirectory, output);
    const canonical = async (target) => {
      const resolved = await realpath(target).catch(async (error) => {
        if (error.code !== "ENOENT") throw error;
        const parent = await realpath(path.dirname(target)).catch((parentError) => {
          if (parentError.code !== "ENOENT") throw parentError;
          return path.dirname(target);
        });
        return path.join(parent, path.basename(target));
      });
      return process.platform === "win32" ? resolved.toLowerCase() : resolved;
    };
    const protectedPaths = ["data/snapshots/current.json", profile.evidencePath, "data/reviewed/nrc-s4-import-profile.json",
      "output/nrc-audit/source/fixed-modules.json", "output/nrc-audit/source/extra-modules.json"]
      .map((name) => path.resolve(rootDirectory, name));
    if (profilePath) protectedPaths.push(path.resolve(profilePath));
    required(!(await Promise.all(protectedPaths.map(canonical))).includes(await canonical(outputPath)), "候选输出不能覆盖当前快照、证据或导入输入");
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, JSON.stringify(next, null, 2) + "\n", "utf8");
  } else if (!check) {
    await mkdir(file("output/nrc-audit/before/"), { recursive: true });
    await copyFile(file("data/snapshots/current.json"), file("output/nrc-audit/before/current.json"), 1).catch((error) => { if (error.code !== "EEXIST") throw error; });
    if (importSource) await writeFile(file(profile.evidencePath), JSON.stringify(evidence) + "\n", "utf8");
    await writeFile(file("data/snapshots/current.json"), JSON.stringify(next, null, 2) + "\n", "utf8");
  }
  return { counts: next.meta.counts, relations: next.learnsets.reduce((sum, { skillIds }) => sum + skillIds.length, 0) };
}

async function main() {
  const args = process.argv.slice(2);
  let profile = DEFAULT_NRC_IMPORT_PROFILE, profilePath, output;
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--profile") {
      required(args[index + 1] && !args[index + 1].startsWith("--"), "--profile 需要审核配置路径");
      profilePath = path.resolve(args[++index]);
      profile = JSON.parse(await readFile(profilePath, "utf8"));
    } else if (args[index] === "--output") {
      required(args[index + 1] && !args[index + 1].startsWith("--"), "--output 需要候选 JSON 路径");
      output = args[++index];
    } else required(["--import", "--check"].includes(args[index]), `未知参数：${args[index]}`);
  }
  console.log(JSON.stringify(await runNrcImport({ profile, profilePath, output, importSource: args.includes("--import"), check: args.includes("--check") })));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
