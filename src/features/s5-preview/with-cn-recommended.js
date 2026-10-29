import catalog from "../../../data/candidates/s5-preview-new-spirits.json";
import recommendations from "../../../data/presets/s5-popular-configs.json";
import { withCalculatorExtras } from "../../data/snapshot-extras.js";
import { withPublicResourceUrls } from "../../runtime/public-resource-url.js";
import { withS5PreviewCatalog } from "./catalog.js";

// CN only adopts the explicitly configured new identities. Do not apply the S5
// announcement, replace existing entities, or expose unfinished growth forms.
export function withCnRecommendedSpirits(snapshot) {
  if ((snapshot?.meta?.serverId ?? snapshot?.serverId ?? "cn") !== "cn") return snapshot;
  const base = withCalculatorExtras(snapshot);
  const existingIds = new Set(base.spirits.map(spirit => spirit.id));
  const wantedIds = new Set(recommendations.entries.map(entry => entry.spiritId));
  if ([...wantedIds].every(id => existingIds.has(id))) return withPublicResourceUrls(base);
  const projected = withS5PreviewCatalog(base, catalog);
  const newSpirits = projected.spirits.filter(spirit => wantedIds.has(spirit.id) && !existingIds.has(spirit.id));
  const availableIds = new Set([...existingIds, ...newSpirits.map(spirit => spirit.id)]);
  const newIds = new Set(newSpirits.map(spirit => spirit.id));
  const newLearnsets = projected.learnsets.filter(entry => newIds.has(entry.spiritId));
  const traitIds = new Set(newSpirits.flatMap(spirit => spirit.traitIds ?? []));
  const skillIds = new Set([
    ...newLearnsets.flatMap(entry => entry.skillIds),
    ...recommendations.entries.filter(entry => newIds.has(entry.spiritId)).flatMap(entry => entry.skills).filter(Boolean),
  ]);
  const existingSkillIds = new Set(base.skills.map(skill => skill.id));
  const existingTraitIds = new Set(base.traits.map(trait => trait.id));
  return withPublicResourceUrls({
    ...base,
    spirits: [...base.spirits, ...newSpirits.map(spirit => ({
      ...spirit,
      ...(spirit.evolutionChainIds ? { evolutionChainIds: spirit.evolutionChainIds.filter(id => availableIds.has(id)) } : {}),
    }))],
    skills: [...base.skills, ...projected.skills.filter(skill => skillIds.has(skill.id) && !existingSkillIds.has(skill.id))],
    traits: [...base.traits, ...projected.traits.filter(trait => traitIds.has(trait.id) && !existingTraitIds.has(trait.id))],
    learnsets: [...base.learnsets, ...newLearnsets],
  });
}
