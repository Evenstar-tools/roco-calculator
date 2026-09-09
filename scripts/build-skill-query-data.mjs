import { readFile, writeFile, mkdir } from "node:fs/promises";
import { familyIds } from "../src/features/skill-query/catalog.js";

const read = async (path) => JSON.parse(await readFile(path, "utf8"));
const source = await read("data/skill-query/s3-source.json");
const wikiSeasons = await read("data/skill-query/bwiki-seasons.json");
const baseline = await read("data/snapshots/seasons/s3-2026-07-15.json");
const manifest = await read("data/skill-query/seasons.json");
if (!manifest.seasons.length || new Set(manifest.seasons.map(({ id }) => id)).size !== manifest.seasons.length || !manifest.seasons.some(({ id }) => id === manifest.currentSeason)) {
  throw new Error("赛季清单缺失、重复或当前赛季无效");
}
const normalize = (name) => name.replace(/·本来的样子$/, "").replace(/·黑化的样子$/, "").replace(/·(.+)$/, "（$1）");
const spiritNames = new Map(baseline.spirits.map((spirit) => [spirit.fullName, spirit.id]));
const unresolved = [...new Set(source.skills.flatMap((skill) => skill.learners))].filter((name) => !spiritNames.has(normalize(name)));
if (unresolved.length) throw new Error(`未关联精灵：${unresolved.join("、")}`);
const sourceSkills = new Map(source.skills.map((skill) => [skill.name, skill]));
const baselineSkills = new Set(baseline.skills.map((skill) => skill.id));
const supplements = [];
const sourceRelations = new Map();
for (const record of source.skills) {
  const skill = baseline.skills.find((entry) => entry.name === record.name);
  if (!skill) throw new Error(`未关联技能：${record.name}`);
  for (const name of record.learners) {
    const spiritId = spiritNames.get(normalize(name));
    const methods = [];
    for (const [key, values] of Object.entries(record.methods)) {
      for (const value of values) {
        const learnerName = key === "bloodline" ? value.replace(/（[^（）]*血脉）$/, "") : value;
        if (normalize(learnerName) !== normalize(name)) continue;
        methods.push(key === "default" ? "默认学习" : key === "stone" ? "技能石" : value.match(/（([^（）]*血脉)）$/)?.[1] ?? "血脉");
      }
    }
    if (!sourceRelations.has(spiritId)) sourceRelations.set(spiritId, new Map());
    sourceRelations.get(spiritId).set(skill.id, methods);
    if (!baseline.learnsets.find((entry) => entry.spiritId === spiritId)?.skillIds.includes(skill.id)) supplements.push({ spiritId, skillId: skill.id, sourceRow: record.sourceRow });
  }
}
const mergedLearnsets = (snapshot) => snapshot.learnsets.map((entry) => {
  if (snapshot.meta.nrcSync?.authoritativeLearnsets) return entry;
  const additions = sourceRelations.get(entry.spiritId) ?? new Map();
  const skillIds = [...new Set([...entry.skillIds, ...additions.keys()])];
  return { spiritId: entry.spiritId, skillIds, acquisitions: Object.fromEntries(skillIds.map((id) => [id,
    [...new Set([...(entry.acquisitions?.[id] ?? []), ...(additions.get(id) ?? [])])],
  ])) };
});
const compact = (snapshot, season) => {
  const families = familyIds(snapshot.spirits);
  return {
  id: season,
  skills: snapshot.skills.filter((skill) => skill.provenance?.nrc?.status !== "legacy-unconfirmed").map((skill) => {
    const record = sourceSkills.get(skill.name);
    return { id: skill.id, name: skill.name, type: skill.type, category: skill.category,
      cost: skill.cost ?? null, basePower: skill.basePower ?? null, description: skill.description,
      introducedSeason: wikiSeasons.records[skill.name] ?? record?.introducedSeason ?? (baselineSkills.has(skill.id) ? null : season),
      detailUrl: skill.detailUrl };
  }),
  spirits: snapshot.spirits.map(({ id, fullName, types, stage }) => ({ id, fullName, types, stage, familyId: families.get(id) })),
  learnsets: mergedLearnsets(snapshot),
}; };
const seasons = await Promise.all(manifest.seasons.map(async ({ id, snapshot }) => compact(await read(snapshot), id)));
for (const season of seasons) {
  const skills = new Set(season.skills.map(({ id }) => id));
  const spirits = new Set(season.spirits.map(({ id }) => id));
  if (skills.size !== season.skills.length || spirits.size !== season.spirits.length || season.learnsets.some((entry) => !spirits.has(entry.spiritId) || entry.skillIds.some((id) => !skills.has(id)))) {
    throw new Error(`${season.id} 存在重复身份或未关联的学习记录`);
  }
}
const firstSeen = new Map();
for (const season of seasons) {
  for (const skill of season.skills) {
    if (!firstSeen.has(skill.id)) firstSeen.set(skill.id, skill.introducedSeason ?? season.id);
    skill.introducedSeason = firstSeen.get(skill.id);
  }
}
const data = { schemaVersion: 1, currentSeason: manifest.currentSeason, source: source.source, seasons };
// 传输只保存整数索引，途径文本共用词表；打开面板后还原，避免重复 ID 和文本占体积。
const methodTexts = [];
const methodIndex = new Map();
const packed = { ...data, seasons: data.seasons.map((season) => {
  const skillIndex = new Map(season.skills.map((skill, index) => [skill.id, index]));
  const spiritIndex = new Map(season.spirits.map((spirit, index) => [spirit.id, index]));
  const intern = (text) => {
    if (!methodIndex.has(text)) { methodIndex.set(text, methodTexts.length); methodTexts.push(text); }
    return methodIndex.get(text);
  };
  const relations = season.learnsets.map((entry) => [spiritIndex.get(entry.spiritId), entry.skillIds.map((id) => [skillIndex.get(id), ...(entry.acquisitions[id] ?? []).map(intern)])]);
  const { learnsets: _learnsets, ...metadata } = season;
  return { ...metadata, relations };
}) };
packed.methodTexts = methodTexts;
const sharedSkills = [];
const sharedRelations = [];
const sharedSpirits = [];
const pool = (items, entry) => {
  const key = JSON.stringify(entry);
  let index = items.findIndex((item) => JSON.stringify(item) === key);
  if (index < 0) { index = items.length; items.push(entry); }
  return index;
};
for (const season of packed.seasons) {
  season.skills = season.skills.map((skill) => pool(sharedSkills, skill));
  season.relations = season.relations.map((relation) => pool(sharedRelations, relation));
  season.spirits = season.spirits.map((spirit) => pool(sharedSpirits, spirit));
}
packed.sharedSkills = sharedSkills;
packed.sharedRelations = sharedRelations;
packed.sharedSpirits = sharedSpirits.map(({ id, fullName, types, stage, familyId }) => [id, fullName, types, stage, familyId]);
await mkdir("public/data/skill-query", { recursive: true });
await writeFile("public/data/skill-query/catalog.json", JSON.stringify(packed) + "\n", "utf8");
const report = { sourceSkills: source.skills.length, mappedSourceSkills: source.skills.filter((skill) => baseline.skills.some((entry) => entry.name === skill.name)).length, unresolved, sourceSupplements: supplements,
  seasons: data.seasons.map((season) => ({ id: season.id, skills: season.skills.length, spirits: season.spirits.length, relations: season.learnsets.reduce((sum, set) => sum + set.skillIds.length, 0) })) };
await mkdir("output/skill-query", { recursive: true });
await writeFile("output/skill-query/data-report.json", JSON.stringify(report, null, 2) + "\n", "utf8");
console.log(JSON.stringify({ ...report, sourceSupplements: supplements.length }));
