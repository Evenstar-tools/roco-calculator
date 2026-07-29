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
  ]
    .filter(Boolean)
    .map(compact);
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
        .slice(0, limit)
        .map((entry) => entry.spirit);
    },
    values() {
      return entries.map((entry) => entry.spirit);
    },
  };
}
