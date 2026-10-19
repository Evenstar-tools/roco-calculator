import { assertRepositoryEnvironment, storageError } from "../../state/server-storage.js";
import { getServerRelease } from "../../domain/server-environment.js";

const copyFields = (entry, fields) => Object.fromEntries(fields
  .filter((key) => entry[key] !== undefined).map((key) => [key, structuredClone(entry[key])]));

// Only explicit evolution IDs join a reference family. Similar names never do.
function referenceFamilies(spirits) {
  const parents = new Map(spirits.map(({ id }) => [id, id]));
  const find = (id) => {
    if (parents.get(id) !== id) parents.set(id, find(parents.get(id)));
    return parents.get(id);
  };
  for (const spirit of spirits) for (const id of spirit.evolutionChainIds) {
    if (!parents.has(id)) continue;
    const roots = [find(spirit.id), find(id)].sort();
    parents.set(roots[1], roots[0]);
  }
  return new Map(spirits.map(({ id }) => [id, find(id)]));
}

// Reuse the query model's shape, without inventing a Global season or acquisition method.
export function createPlaceholderQueryCatalog(snapshot) {
  const source = snapshot?.meta?.placeholderSource;
  if (snapshot?.meta?.serverId !== "global" || snapshot.meta.id !== null || snapshot.meta.rulesVersion !== null ||
      snapshot.meta.status !== "unverified" || source?.serverId !== "cn" || source.locale !== "zh-CN" ||
      source.dataVersion !== getServerRelease("cn").dataVersion ||
      !Array.isArray(snapshot.spirits) || !Array.isArray(snapshot.skills) || !Array.isArray(snapshot.learnsets)) {
    throw storageError("SERVER_DATA_UNVERIFIED", "技能参考资料必须来自明确标记的国服占位目录");
  }
  assertRepositoryEnvironment("global", snapshot);
  const spiritIds = new Set(snapshot.spirits.map(({ id }) => id));
  const skillIds = new Set(snapshot.skills.map(({ id }) => id));
  if (snapshot.learnsets.some((entry) => !spiritIds.has(entry.spiritId) || entry.skillIds.some((id) => !skillIds.has(id)))) {
    throw storageError("SERVER_DATA_UNVERIFIED", "技能参考目录包含无法对应的学习关系");
  }
  const families = referenceFamilies(snapshot.spirits);
  return {
    placeholderSource: structuredClone(snapshot.meta.placeholderSource),
    spirits: snapshot.spirits.map((spirit) => ({
      ...copyFields(spirit, ["id", "fullName", "baseName", "variantName", "dexNo", "pinyin", "initials", "aliases", "sourceCategory", "stage", "asset", "types", "evolutionChainIds"]),
      familyId: families.get(spirit.id),
      reference: { sourceId: spirit.reference.sourceId },
    })),
    skills: snapshot.skills.map((skill) => copyFields(skill,
      ["id", "name", "type", "category", "description", "iconUrl", "searchText"])),
    learnsets: snapshot.learnsets.map((entry) => ({ spiritId: entry.spiritId, skillIds: [...entry.skillIds] })),
  };
}
