import { readFile, writeFile } from "node:fs/promises";
import { sha256Hex } from "./normalize.mjs";
const read = async (path) => JSON.parse(await readFile(path, "utf8"));
const snapshot = await read("data/snapshots/current.json");
const evidence = await read("data/reviewed/nrc-2026-09-10.json");
const catalog = await read("data/form-roles/form-role-v1.json");
for (const spirit of snapshot.spirits) {
  let record = catalog.records.find(({ spiritId }) => spiritId === spirit.id);
  if (record) { record.fullName = spirit.fullName; continue; }
  const raw = evidence.spirits.find(({ title }) => title === spirit.fullName);
  if (spirit.stage !== "首领" && raw.evolution_id && !evidence.evolutions[raw.evolution_id]?.every(({ chain }) => chain.at(-1).id === raw.id)) throw new Error(`新增精灵不是已核对最终形态：${raw.title}`);
  record = { evolutionFamilyId: raw.evolution_id ?? raw.id, evolutionPosition: spirit.stage === "首领" ? null : "初始|最终",
    formRole: spirit.stage === "首领" ? "boss" : "final", formRoleStatus: "verified", fullName: spirit.fullName,
    sourceId: "nrc-catalog-7265", spiritId: spirit.id };
  catalog.records.push(record);
}
const count = (key, value) => catalog.records.filter((entry) => entry[key] === value).length;
catalog.meta.counts = { boss: count("formRole", "boss"), final: count("formRole", "final"), growth: count("formRole", "growth"),
  manual: count("formRoleStatus", "manual"), records: catalog.records.length,
  runtimeRecords: count("formRole", "final") + count("formRole", "growth"), verified: count("formRoleStatus", "verified") };
catalog.meta.normalizedRecordsSha256 = sha256Hex(JSON.stringify(catalog.records));
catalog.meta.sources = catalog.meta.sources.filter(({ id }) => id !== "nrc-catalog-7265");
catalog.meta.sources.push({ ...evidence.sources.Catalog, id: "nrc-catalog-7265" });
await writeFile("data/form-roles/form-role-v1.json", JSON.stringify(catalog, null, 2) + "\n", "utf8");
console.log(JSON.stringify(catalog.meta.counts));
