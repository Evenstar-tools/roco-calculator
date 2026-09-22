function compact(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase("zh-CN")
    .replace(/[\s·（）()_\-/]+/g, "");
}

function searchFields(spirit) {
  return [
    spirit.fullName,
    spirit.baseName,
    spirit.variantName,
    spirit.sourceCategory,
    spirit.dexNo,
    spirit.pinyin,
    spirit.initials,
    ...(spirit.aliases ?? []),
  ]
    .filter(Boolean)
    .map(compact);
}

function searchRank(spirit, needle) {
  const aliases = (spirit.aliases ?? []).map(compact);
  if (aliases.includes(needle)) return 0;
  if (compact(spirit.fullName) === needle) return 1;
  const fields = searchFields(spirit);
  if (fields.some((field) => field.startsWith(needle))) return 2;
  return 3;
}

export function prepareSpiritForView(spirit) {
  return {
    ...spirit,
    assetUrl:
      spirit.asset?.localUrl ??
      spirit.asset?.publicPath ??
      spirit.asset?.path ??
      spirit.asset?.sourceUrl ??
      null,
    initials: spirit.initials ?? "",
    pinyin: spirit.pinyin ?? "",
  };
}

export function createSpiritSearchIndex(spirits) {
  const entries = spirits.map((spirit) => ({
    fields: searchFields(spirit),
    spirit: prepareSpiritForView(spirit),
  }));

  return {
    search(query, limit = 50) {
      const needle = compact(query);
      if (!needle) return entries.slice(0, limit).map((entry) => entry.spirit);

      return entries
        .filter((entry) => entry.fields.some((field) => field.includes(needle)))
        .map((entry, index) => ({
          entry,
          index,
          rank: searchRank(entry.spirit, needle),
        }))
        .sort((left, right) => left.rank - right.rank || left.index - right.index)
        .slice(0, limit)
        .map(({ entry }) => entry.spirit);
    },
    values() {
      return entries.map((entry) => entry.spirit);
    },
  };
}
