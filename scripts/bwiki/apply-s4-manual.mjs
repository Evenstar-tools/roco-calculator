import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { sha256Hex, sourceRef, stableId } from "./normalize.mjs";
import { validateSnapshot } from "./validate.mjs";
import { applyS4NameCorrections } from "./apply-s4-name-corrections.mjs";

const ROOT = path.resolve(import.meta.dirname, "../..");
export const EVIDENCE_PATH = path.join(ROOT, "data/reviewed/s4-manual-2026-09-09.json");
const SNAPSHOT_PATH = path.join(ROOT, "data/snapshots/current.json");
const SOURCE_URL = "urn:rock-calculator:source:s4-manual-2026-09-09";
const METHODS = { 自学: "默认学习（等级待确认）", 血脉: "血脉（具体血脉待确认）", 技能石: "技能石" };
const STATS = { 生命: "hp", 物攻: "physicalAttack", 魔攻: "magicalAttack", 物防: "physicalDefense", 魔防: "magicalDefense", 速度: "speed", 总和: "total" };
function requireValue(ok, message) { if (!ok) throw new Error(message); }
function uniqueSkill(snapshot, name) {
  const matches = snapshot.skills.filter((skill) => skill.name === name);
  requireValue(matches.length === 1, `技能名称必须唯一：${name}`);
  return matches[0];
}

// 只留公开数据和图片摘要；不把私人会话标识、消息标识或机器路径带入仓库。
export async function importManualEvidence(inputPath) {
  const raw = await readFile(inputPath, "utf8");
  requireValue(!raw.includes("\uFFFD"), "来源编码异常");
  const input = JSON.parse(raw);
  const previous = await readFile(EVIDENCE_PATH, "utf8").then(JSON.parse).catch((error) => {
    if (error.code === "ENOENT") return {};
    throw error;
  });
  const images = await Promise.all(input.source.imageIndexFileMap.map(async (entry) => ({
    ...entry, sha256: sha256Hex(await readFile(path.join(input.source.resourceDirectory, entry.file))),
  })));
  const evidence = {
    schemaVersion: 1, capturedAt: input.capturedAt,
    source: { title: "洛克手册 S4 正式图鉴及学习面截图（32 张，经复核）", url: SOURCE_URL,
      revision: input.capturedAt, fetchedAt: "2026-09-09T20:15:00+08:00", sha256: sha256Hex(raw) },
    images, summary: input.summary, interpretation: input.interpretation,
    spirits: input.spirits.map(({ name, dexNo, currentSpiritId, raceStats, images, learnsets }) => ({
      name, dexNo, spiritId: currentSpiritId, raceStats, images, learnsets,
    })),
    supplementalImages: previous.supplementalImages ?? [],
    standaloneSkills: [...input.standaloneSkills, ...(previous.standaloneSkills ?? []).filter(({ imageIndex }) => imageIndex > 32)]
      .filter(({ name }) => name !== "麦芒"),
    corrections: [
      { id: "skill_f7eea4de117d30ed", previousName: "引力旋转", name: "引力偏转", imageIndex: 18 },
    ],
    pending: [
      { ...input.standaloneSkills.find(({ name }) => name === "麦芒"), name: "麦芒", status: "pending-bwiki",
        reason: "截图候选，BWIKI 未收录；暂不建立正式实体" },
      { name: "冰锋横扫", type: "冰", cost: 4, basePower: 0, imageIndex: 6, status: "pending-bwiki",
        reason: "截图为 0，与 BWIKI oldid=40293 的 1 冲突；正式数据保留 1" },
    ],
    bwikiCrossCheck: previous.bwikiCrossCheck ?? [],
    confirmedDifferences: input.confirmedDifferencesAgainstCurrentSnapshot.map((entry) =>
      ["技能 麦芒", "技能 冰锋横扫"].includes(entry.scope) ? { ...entry, status: "pending-bwiki" } : entry),
    limitations: input.limitations,
  };
  await mkdir(path.dirname(EVIDENCE_PATH), { recursive: true });
  await writeFile(EVIDENCE_PATH, JSON.stringify(evidence, null, 2) + "\n", "utf8");
  return evidence;
}

export function applyS4Manual(snapshot, evidence) {
  requireValue(evidence.schemaVersion === 1 && evidence.spirits.length === 10 && evidence.images.length === 32,
    "正式资料清单结构或数量异常");
  const relationships = evidence.spirits.flatMap((spirit) => Object.values(spirit.learnsets).flat());
  requireValue(relationships.length === 463 && new Set(relationships).size === 241, "正式学习面应为 463 条关系、241 个技能名");
  requireValue(new Set(evidence.spirits.map(({ spiritId }) => spiritId)).size === 10 &&
    new Set(evidence.spirits.map(({ dexNo }) => dexNo)).size === 10, "精灵身份或图鉴编号重复");
  const next = structuredClone(snapshot);
  // 仅撤回本批未提交的两项截图覆盖；已发布的名称修正不在本门槛回退范围内。
  const maimangId = stableId("skill", "s4-manual-2026-09-09", "麦芒");
  requireValue(!next.learnsets.some(({ skillIds }) => skillIds.includes(maimangId)), "待核麦芒意外存在学习关系，请先人工核对");
  next.skills = next.skills.filter(({ id }) => id !== maimangId);
  const iceSweep = uniqueSkill(next, "冰锋横扫");
  if (iceSweep.provenance?.basePower?.url === `${SOURCE_URL}:image:6`) {
    iceSweep.basePower = 1;
    for (const key of ["type", "cost", "basePower"]) {
      if (iceSweep.provenance[key]?.url === `${SOURCE_URL}:image:6`) iceSweep.provenance[key] = structuredClone(iceSweep.source);
    }
    if (iceSweep.provenance.name?.url === `${SOURCE_URL}:image:6`) delete iceSweep.provenance.name;
  }
  const source = sourceRef(evidence.source);
  const imageSource = (index) => {
    const entry = [...evidence.images, ...(evidence.supplementalImages ?? [])].find((image) => image.index === index);
    requireValue(entry?.sha256, `缺少图 ${index} 来源`);
    return { ...source, url: `${SOURCE_URL}:image:${index}`, sha256: entry.sha256, sourceFile: entry.file };
  };
  for (const correction of evidence.corrections) {
    if (correction.name === "冰锋横扫" || correction.id === iceSweep.id) continue;
    const skill = correction.id ? next.skills.find(({ id }) => id === correction.id) : uniqueSkill(next, correction.name);
    requireValue(skill && (!correction.previousName || [correction.previousName, correction.name].includes(skill.name)), "覆盖技能身份漂移");
    requireValue(!next.skills.some((entry) => entry.id !== skill.id && entry.name === correction.name), "禁止创建同名技能");
    for (const key of ["name", "type", "cost", "basePower"]) {
      if (correction[key] === undefined) continue;
      skill[key] = correction[key];
      skill.provenance = { ...skill.provenance, [key]: imageSource(correction.imageIndex) };
    }
  }
  for (const record of evidence.standaloneSkills) {
    if (record.name === "麦芒") continue;
    requireValue(record.spiritBinding === null, "独立技能资料不允许推断精灵绑定");
    const id = stableId("skill", "s4-manual-2026-09-09", record.name);
    const existing = next.skills.find((skill) => skill.id === id || skill.name === record.name);
    requireValue(!existing || existing.id === id, `${record.name} 已由其他来源建立，请先核对身份`);
    const ref = imageSource(record.imageIndex);
    const entry = { id, name: record.name, type: record.element, category: "physical", cost: record.cost,
      basePower: record.basePower, description: record.description, ruleId: null, ruleParams: null,
      asset: { sourceUrl: `/assets/skills/${id}.png`, width: 128, height: 128, status: "screenshot-crop" },
      source: ref, provenance: Object.fromEntries(["identity", "type", "category", "cost", "basePower", "description", "asset"].map((key) => [key, ref])) };
    if (existing) Object.assign(existing, entry); else next.skills.push(entry);
  }
  const midnight = uniqueSkill(next, "午夜噪音");
  requireValue(midnight.id === "skill_15fb272dc50faf16" && midnight.type === "幽" && midnight.category === "magical" &&
    midnight.cost === 4 && midnight.basePower === 20, "午夜噪音实体字段漂移");
  for (const record of evidence.spirits) {
    const spirit = next.spirits.find(({ id }) => id === record.spiritId);
    requireValue(spirit?.fullName === record.name, `精灵身份漂移：${record.name}`);
    requireValue(Object.entries(STATS).every(([label, key]) => record.raceStats[label] === spirit.raceStats?.[key]), `种族值不匹配：${record.name}`);
    requireValue(Number.isInteger(record.dexNo) && record.dexNo > 0, `图鉴号异常：${record.name}`);
    spirit.dexNo = record.dexNo;
    spirit.provenance = { ...spirit.provenance, dexNo: imageSource(1),
      previewIdentity: { ...spirit.provenance.previewIdentity, formalIdPending: false } };
    const learnset = next.learnsets.find(({ spiritId }) => spiritId === record.spiritId);
    requireValue(learnset, `缺少学习面：${record.name}`);
    const acquisitions = {};
    const categorySources = {};
    for (const [category, label] of Object.entries(METHODS)) {
      const names = record.learnsets[category];
      requireValue(Array.isArray(names) && new Set(names).size === names.length, `${record.name} ${category} 缺失或重复`);
      categorySources[label] = imageSource(record.images[category]);
      for (const name of names) {
        const skill = uniqueSkill(next, name);
        (acquisitions[skill.id] ??= []).push(label);
      }
    }
    const skillIds = Object.keys(acquisitions);
    // 默认四槽不是自学池；保留仍合法的既有配置，只迁移证据明确的午夜噪音。
    const defaultSkillIds = (learnset.defaultSkillIds ?? []).map((id) =>
      record.name === "摇铃魔偶" && id === "skill_1652bda550a6b2dc" ? midnight.id : id
    ).filter((id) => skillIds.includes(id));
    Object.assign(learnset, { skillIds, defaultSkillIds: [...new Set(defaultSkillIds)], acquisitions,
      sources: Object.values(record.images).map(imageSource),
      provenance: { skillIds: source, acquisitions: source, categorySources } });
  }
  next.meta.counts = { ...next.meta.counts, skills: next.skills.length };
  next.meta.diff = { ...next.meta.diff,
    skillsAdded: next.meta.diff.skillsAdded + next.skills.length - snapshot.skills.length };
  next.meta.sources = [...next.meta.sources.filter(({ url }) => url !== source.url), source];
  next.meta.s4Manual = { source, spiritCount: 10, relationshipCount: 463, uniqueSkillCount: 241,
    idStrategy: "保留现有稳定 ID，只补正式图鉴号；引力偏转沿用前瞻实体 ID",
    limitations: evidence.limitations };
  next.meta.contentSha256 = null;
  next.meta.contentSha256 = sha256Hex(JSON.stringify(next));
  const validation = validateSnapshot(next);
  requireValue(validation.ok, `快照校验失败：${JSON.stringify(validation.errors)}`);
  return snapshot.meta.s4NameCorrections ? applyS4NameCorrections(next) : next;
}

async function main() {
  const args = process.argv.slice(2);
  requireValue(args.length === 0 || (args.length === 2 && args[0] === "--import"), "用法：node scripts/bwiki/apply-s4-manual.mjs [--import <核验来源.json>]");
  const evidence = args[0] === "--import" ? await importManualEvidence(args[1]) : JSON.parse(await readFile(EVIDENCE_PATH, "utf8"));
  const raw = await readFile(SNAPSHOT_PATH);
  const text = new TextDecoder("utf-8", { fatal: true }).decode(raw);
  requireValue(!text.includes("\uFFFD"), "快照编码异常");
  const next = applyS4Manual(JSON.parse(text), evidence);
  const newline = text.includes("\r\n") ? "\r\n" : "\n";
  const output = (JSON.stringify(next, null, 2) + "\n").replace(/\n/g, newline);
  await writeFile(SNAPSHOT_PATH, (raw[0] === 0xef ? "\uFEFF" : "") + output, "utf8");
  console.log(JSON.stringify({ spirits: 10, relationships: 463, skills: next.skills.length, hash: next.meta.contentSha256 }));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
