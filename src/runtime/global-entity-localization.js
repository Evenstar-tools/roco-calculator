import { GLOBAL_CLIENT_TRAIT_TEXT, GLOBAL_ENTITY_TEXT } from "../data/global-entity-text.js";

const PREFIX = "cn-placeholder:";
const catalogCache = new WeakMap();
const nativeTraits = new Map(Object.entries(GLOBAL_ENTITY_TEXT.trait).flatMap(([id, entry]) =>
  entry.gameIds.map((gameId) => [gameId, { ...entry, sourceId: id }])));
for (const [gameId, entry] of Object.entries(GLOBAL_CLIENT_TRAIT_TEXT)) nativeTraits.set(Number(gameId), entry);
const nameIndexes = new Map(Object.entries(GLOBAL_ENTITY_TEXT).map(([kind, entries]) => {
  const index = new Map();
  for (const entry of Object.values(entries)) {
    if (!entry.available) continue;
    for (const name of new Set([entry.projectName, entry.name?.["zh-CN"]].filter(Boolean))) {
      const matches = index.get(name) ?? [];
      matches.push(entry);
      index.set(name, matches);
    }
  }
  return [kind, index];
}));
const unavailableNames = {
  spirit: { "zh-CN": "暂不可用的精灵", en: "Unavailable Jini", ja: "利用できないジニ" },
  skill: { "zh-CN": "暂不可用的技能", en: "Unavailable Skill", ja: "利用できないスキル" },
  trait: { "zh-CN": "特性暂不可用", en: "Trait unavailable", ja: "特性は利用できません" },
};

function displayLocale(locale) {
  if (String(locale).startsWith("ja")) return "ja";
  if (String(locale).startsWith("en")) return "en";
  return "zh-CN";
}

function sourceId(entityOrId) {
  const id = typeof entityOrId === "string" ? entityOrId
    : entityOrId?.reference?.sourceId ?? entityOrId?.sourceId ?? entityOrId?.id;
  return typeof id === "string" && id.startsWith(PREFIX) ? id.slice(PREFIX.length) : id;
}

function entryFor(kind, entityOrId) {
  return GLOBAL_ENTITY_TEXT[kind]?.[sourceId(entityOrId)];
}

/** Display lookup only. A missing client record never borrows a CN rule description. */
export function getGlobalEntityText(kind, entityOrId, field, locale, fallback = "") {
  const entry = entryFor(kind, entityOrId);
  if (!entry) return fallback;
  const language = displayLocale(locale);
  if (!entry.available) return ["name", "fullName"].includes(field) ? unavailableNames[kind]?.[language] ?? "" : "";
  return kind === "spirit" && field === "fullName" ? fullName(entry, language) : entry[field]?.[language] ?? "";
}

/** For display fragments without an ID: return only an unambiguous translated value. */
export function getGlobalEntityTextByName(kind, chineseName, field, locale, fallback = chineseName) {
  const language = displayLocale(locale);
  const candidates = nameIndexes.get(kind)?.get(chineseName) ?? [];
  const exactProjectNames = candidates.filter(entry => entry.projectName === chineseName);
  const matches = exactProjectNames.length ? exactProjectNames : candidates;
  const values = matches.map((entry) => kind === "spirit" && field === "fullName" ? fullName(entry, language) : entry[field]?.[language]);
  const texts = new Set(values.filter(Boolean));
  if (values.length > 0 && texts.size === 1 && values.every(Boolean)) return [...texts][0];
  // A bare species name can identify several forms. Keep the shared official name,
  // rather than choosing a form that the caller did not identify.
  if (kind === "spirit" && field === "fullName" && !exactProjectNames.length) {
    const baseNames = matches.map(entry => entry.name?.[language]);
    const sharedNames = new Set(baseNames.filter(Boolean));
    if (sharedNames.size === 1 && baseNames.every(Boolean)) return [...sharedNames][0];
  }
  return fallback;
}

function fullName(entry, locale) {
  const name = entry.name?.[locale] ?? "";
  const form = entry.form?.[locale];
  return form ? locale === "en" ? `${name} (${form})` : `${name}（${form}）` : name;
}

function namesForSearch(entry, previous = []) {
  return [...new Set([
    ...previous, entry.projectName,
    ...Object.values(entry.name ?? {}),
    ...Object.keys(entry.name ?? {}).map((locale) => fullName(entry, locale)),
  ].filter(Boolean))];
}

function localizedMetadata(entry, locale) {
  return {
    locale: displayLocale(locale), gameIds: [...entry.gameIds],
    nameStatus: entry.available ? "client_verified" : "missing_client",
    ...(entry.formStatus ? { formStatus: entry.formStatus } : {}),
    ...(entry.descriptionStatus ? { descriptionStatus: entry.descriptionStatus } : {}),
  };
}

export function localizeGlobalTrait(trait, locale) {
  const entry = entryFor("trait", trait);
  if (!entry) return trait;
  return {
    ...trait,
    name: getGlobalEntityText("trait", trait, "name", locale),
    description: getGlobalEntityText("trait", trait, "description", locale),
    catalogAvailable: entry.available,
    localization: localizedMetadata(entry, locale),
  };
}

export function localizeGlobalSpirit(spirit, locale, canonicalTraits = null) {
  const entry = entryFor("spirit", spirit);
  if (canonicalTraits === null && Array.isArray(spirit.traitIds)) {
    canonicalTraits = spirit.traitIds.map((id) => ({ id }));
  }
  const language = displayLocale(locale);
  const nativeTrait = entry ? nativeTraits.get(entry.nativeTraitGameId) : null;
  const traits = canonicalTraits ? canonicalTraits.map((trait) => ({ ...localizeGlobalTrait(trait, locale), sourceId: sourceId(trait) }))
    : entry ? nativeTrait ? [{
    sourceId: nativeTrait.sourceId ?? null, gameId: entry.nativeTraitGameId,
    name: nativeTrait.name[language], description: nativeTrait.description?.[language] ?? "",
    localization: localizedMetadata(nativeTrait, locale),
  }] : [] : (spirit.reference?.traits ?? []).map((trait) => localizeGlobalTrait(trait, locale));
  const reference = spirit.reference || entry ? {
    ...spirit.reference,
    sourceId: sourceId(spirit), traits,
    traitName: traits[0]?.name ?? (entry ? "" : spirit.reference?.traitName ?? ""),
    traitDescription: traits[0]?.description ?? (entry ? "" : spirit.reference?.traitDescription ?? ""),
  } : undefined;
  // Unknown test/custom entities are outside the real project ledger and keep their original shape.
  if (!entry) return reference ? { ...spirit, reference } : spirit;
  return {
    ...spirit,
    fullName: entry.available ? fullName(entry, language) : unavailableNames.spirit[language],
    baseName: getGlobalEntityText("spirit", spirit, "name", locale),
    variantName: getGlobalEntityText("spirit", spirit, "form", locale),
    aliases: namesForSearch(entry, spirit.aliases ?? []),
    catalogAvailable: entry.catalogAvailable ?? entry.available,
    localization: localizedMetadata(entry, locale),
    ...(Object.hasOwn(spirit, "traitName") ? { traitName: reference.traitName } : {}),
    ...(Object.hasOwn(spirit, "traitDescription") ? { traitDescription: reference.traitDescription } : {}),
    ...(reference ? { reference } : {}),
  };
}

export function localizeGlobalSkill(skill, locale) {
  const entry = entryFor("skill", skill);
  if (!entry) return skill;
  const aliases = namesForSearch(entry, skill.aliases ?? []);
  const originalSearchText = skill.localization?.originalSearchText ?? skill.searchText ?? "";
  return {
    ...skill,
    name: getGlobalEntityText("skill", skill, "name", locale),
    description: getGlobalEntityText("skill", skill, "description", locale),
    aliases,
    searchText: [...new Set([originalSearchText, ...aliases].filter(Boolean))].join(" "),
    catalogAvailable: entry.available,
    localization: { ...localizedMetadata(entry, locale), originalSearchText },
  };
}

/** Preserves IDs, reference topology, storage contract, types and all capability gates. */
export function localizeGlobalCatalog(snapshot, locale = "zh-CN") {
  if (snapshot?.meta?.serverId !== "global") return snapshot;
  const language = displayLocale(locale);
  let locales = catalogCache.get(snapshot);
  if (!locales) {
    locales = new Map();
    catalogCache.set(snapshot, locales);
  }
  if (!locales.has(language)) locales.set(language, {
    ...snapshot,
    spirits: (snapshot.spirits ?? []).map((spirit) => localizeGlobalSpirit(spirit, language,
      snapshot.meta?.id ? (spirit.traitIds ?? []).map((id) => snapshot.traits?.find((trait) => trait.id === id)).filter(Boolean) : null)),
    skills: (snapshot.skills ?? []).map((skill) => localizeGlobalSkill(skill, language)),
    traits: (snapshot.traits ?? []).map((trait) => localizeGlobalTrait(trait, language)),
  });
  return locales.get(language);
}
