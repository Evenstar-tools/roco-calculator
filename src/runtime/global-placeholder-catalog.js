import { assertCalculationEnvironment } from "../domain/server-environment.js";

export const GLOBAL_PLACEHOLDER_ID_PREFIX = "cn-placeholder:";

const placeholderId = (id) => `${GLOBAL_PLACEHOLDER_ID_PREFIX}${id}`;
const copy = (value) => value === undefined ? undefined : structuredClone(value);

function pick(source, keys) {
  return Object.fromEntries(keys.filter((key) => source[key] !== undefined)
    .map((key) => [key, copy(source[key])]));
}

// A display-only projection. CN entity IDs identify the reference, never a verified Global entity.
export function createGlobalPlaceholderCatalog(cnSnapshot) {
  const source = assertCalculationEnvironment(cnSnapshot, { serverId: "cn" });
  const traits = new Map((cnSnapshot.traits ?? []).map((trait) => [trait.id, trait]));
  return {
    meta: {
      serverId: "global", id: null, rulesVersion: null, status: "unverified",
      placeholderSource: { serverId: "cn", dataVersion: source.dataVersion, locale: "zh-CN" },
    },
    spirits: (cnSnapshot.spirits ?? []).map((spirit) => {
      const references = (spirit.traitIds ?? []).map((id) => traits.get(id)).filter(Boolean)
        .map((trait) => ({ sourceId: trait.id, ...pick(trait, ["name", "description"]) }));
      return {
        ...pick(spirit, ["fullName", "baseName", "variantName", "dexNo", "pinyin", "initials", "aliases", "sourceCategory", "stage", "asset", "types"]),
        id: placeholderId(spirit.id),
        evolutionChainIds: (spirit.evolutionChainIds ?? []).map(placeholderId),
        reference: {
          sourceId: spirit.id,
          traitName: references[0]?.name ?? spirit.traitName ?? "",
          traitDescription: references[0]?.description ?? spirit.traitDescription ?? "",
          traits: references,
        },
      };
    }),
    skills: (cnSnapshot.skills ?? []).map((skill) => ({
      ...pick(skill, ["name", "type", "category", "description", "iconUrl", "searchText"]),
      id: placeholderId(skill.id),
      reference: { sourceId: skill.id, ...pick(skill, ["basePower", "cost"]) },
    })),
    learnsets: (cnSnapshot.learnsets ?? []).map((learnset) => ({
      spiritId: placeholderId(learnset.spiritId),
      skillIds: (learnset.skillIds ?? []).map(placeholderId),
    })),
    traits: [],
    rules: [],
    typeChart: { types: [], matrix: [] },
  };
}
