function normalizeSearch(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/\s+/g, "");
}

function getEvolutionSearchFields(spirit, byId) {
  const names = Array.isArray(spirit.evolutionChainNames)
    ? spirit.evolutionChainNames
    : [];
  const linkedNames = Array.isArray(spirit.evolutionChainIds)
    ? spirit.evolutionChainIds
      .map((id) => byId.get(id)?.fullName)
      .filter(Boolean)
    : [];
  return [...names, ...linkedNames];
}

export function createSpiritSearchIndex(snapshot) {
  const spirits = Array.isArray(snapshot?.spirits)
    ? snapshot.spirits
    : [];
  const byId = new Map(spirits.map((spirit) => [spirit.id, spirit]));
  return {
    items: spirits.map((spirit) => ({
      spirit,
      searchText: normalizeSearch([
        spirit.fullName,
        spirit.baseName,
        spirit.variantName,
        spirit.pinyin,
        spirit.initials,
        ...getEvolutionSearchFields(spirit, byId),
      ].filter(Boolean).join("|")),
    })),
  };
}

function boundResultLimit(limit) {
  return Math.max(
    0,
    Math.min(Number.isFinite(limit) ? Math.floor(limit) : 30, 30),
  );
}

function findSpiritMatches(index, query) {
  const normalized = normalizeSearch(query);
  const matches = normalized
    ? index.items.filter((item) => item.searchText.includes(normalized))
    : index.items;
  return matches.map((item) => item.spirit);
}

export function searchSpirits(index, query, limit = 30) {
  return findSpiritMatches(index, query)
    .slice(0, boundResultLimit(limit));
}

export function searchSpiritsWithFavorites(
  index,
  query,
  favoriteIds,
  limit = 30,
) {
  const boundedLimit = boundResultLimit(limit);
  const favoriteSet = new Set(favoriteIds ?? []);
  const favoriteMatches = [];
  const otherMatches = [];

  for (const spirit of findSpiritMatches(index, query)) {
    (favoriteSet.has(spirit.id) ? favoriteMatches : otherMatches)
      .push(spirit);
  }

  return [...favoriteMatches, ...otherMatches].slice(0, boundedLimit);
}
