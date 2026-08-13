export const MINIAPP_FAVORITES_KEY =
  "rock-calculator.miniapp.favorites.v1";

function parseFavoriteIds(value) {
  const parsed = typeof value === "string" ? JSON.parse(value) : value;
  return {
    ids: Array.isArray(parsed) ? parsed : [],
    valid: value === undefined || Array.isArray(parsed),
  };
}

function uniqueKnownIds(value, validIds) {
  const seen = new Set();
  return value.filter((spiritId) => {
    if (
      typeof spiritId !== "string" ||
      !validIds.has(spiritId) ||
      seen.has(spiritId)
    ) {
      return false;
    }
    seen.add(spiritId);
    return true;
  });
}

export function createFavoritesRepository({ storage }) {
  if (
    !storage ||
    typeof storage.get !== "function" ||
    typeof storage.set !== "function" ||
    typeof storage.remove !== "function"
  ) {
    throw new TypeError("收藏仓库需要同步 storage");
  }

  let favoriteIds = [];
  let validIds = new Set();

  function persist() {
    try {
      storage.set(MINIAPP_FAVORITES_KEY, [...favoriteIds]);
    } catch {
      // 收藏写入失败不应阻断当前计算。
    }
    return [...favoriteIds];
  }

  return {
    list() {
      return [...favoriteIds];
    },

    load(snapshot) {
      validIds = new Set(
        (snapshot?.spirits ?? []).map((spirit) => spirit.id),
      );
      try {
        const storedValue = storage.get(MINIAPP_FAVORITES_KEY);
        const parsed = parseFavoriteIds(storedValue);
        favoriteIds = uniqueKnownIds(parsed.ids, validIds);
        if (
          storedValue !== undefined &&
          (
            !parsed.valid ||
            JSON.stringify(parsed.ids) !== JSON.stringify(favoriteIds)
          )
        ) {
          persist();
        }
      } catch {
        favoriteIds = [];
        try {
          storage.remove(MINIAPP_FAVORITES_KEY);
        } catch {
          // 损坏数据清理失败时仍返回安全的空收藏。
        }
      }
      return [...favoriteIds];
    },

    toggle(spiritId) {
      if (!validIds.has(spiritId)) {
        return [...favoriteIds];
      }
      favoriteIds = favoriteIds.includes(spiritId)
        ? favoriteIds.filter((id) => id !== spiritId)
        : [...favoriteIds, spiritId];
      return persist();
    },

    replace(ids) {
      const nextIds = uniqueKnownIds(
        Array.isArray(ids) ? ids : [],
        validIds,
      );
      storage.set(MINIAPP_FAVORITES_KEY, nextIds);
      favoriteIds = nextIds;
      return [...favoriteIds];
    },

    clear() {
      favoriteIds = [];
      storage.remove(MINIAPP_FAVORITES_KEY);
      return [];
    },
  };
}
