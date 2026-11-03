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
      nameText: normalizeSearch(spirit.fullName),
      ownText: normalizeSearch([
        spirit.fullName,
        spirit.baseName,
        spirit.variantName,
        spirit.pinyin,
        spirit.initials,
        ...(spirit.aliases ?? []),
      ].filter(Boolean).join("|")),
      searchText: normalizeSearch([
        spirit.fullName,
        spirit.baseName,
        spirit.variantName,
        spirit.pinyin,
        spirit.initials,
        ...(spirit.aliases ?? []),
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

// 名字完全一致优先，其次名字开头、名字包含、别名拼音，最后才是同族进化链命中。
function matchRank(item, normalized) {
  if (item.nameText === normalized) return 0;
  if (item.nameText.startsWith(normalized)) return 1;
  if (item.nameText.includes(normalized)) return 2;
  return item.ownText.includes(normalized) ? 3 : 4;
}

function findRankedMatches(index, query) {
  const normalized = normalizeSearch(query);
  if (!normalized) return index.items.map((item) => ({ spirit: item.spirit, rank: 4 }));
  return index.items
    .filter((item) => item.searchText.includes(normalized))
    .map((item, order) => ({ spirit: item.spirit, rank: matchRank(item, normalized), order }))
    .sort((left, right) => left.rank - right.rank || left.order - right.order);
}

function findSpiritMatches(index, query) {
  return findRankedMatches(index, query).map((match) => match.spirit);
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
  const exactMatches = [];
  const favoriteMatches = [];
  const otherMatches = [];

  // 输入完整名字时直接给到该精灵；其余仍让收藏排在前面。
  for (const { spirit, rank } of findRankedMatches(index, query)) {
    (rank === 0 ? exactMatches : favoriteSet.has(spirit.id) ? favoriteMatches : otherMatches)
      .push(spirit);
  }

  return [...exactMatches, ...favoriteMatches, ...otherMatches].slice(0, boundedLimit);
}
