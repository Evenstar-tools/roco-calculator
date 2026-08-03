import {
  STORAGE_NAMESPACE,
  finishStorageMigration,
  legacyStorageKey,
  readStorageWithLegacy,
} from "./storage-namespace.js";

const FAVORITES_STORAGE_SUFFIX = "favorites.v1";
export const FAVORITES_STORAGE_KEY =
  `${STORAGE_NAMESPACE}.${FAVORITES_STORAGE_SUFFIX}`;

function isPlainObject(value) {
  if (value === null || typeof value !== "object") {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertJsonValue(value, ancestors = new Set()) {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("收藏包含非有限数值");
    }
    return;
  }
  if (typeof value !== "object" || ancestors.has(value)) {
    throw new TypeError("收藏包含不可序列化值");
  }

  ancestors.add(value);
  if (Array.isArray(value)) {
    value.forEach((item) => assertJsonValue(item, ancestors));
  } else if (isPlainObject(value)) {
    Object.values(value).forEach((item) => assertJsonValue(item, ancestors));
  } else {
    throw new TypeError("收藏必须使用普通 JSON 对象");
  }
  ancestors.delete(value);
}

function validateFavorites(value) {
  if (!Array.isArray(value)) {
    throw new TypeError("收藏导入内容必须是数组");
  }

  const ids = new Set();
  for (const favorite of value) {
    if (
      !isPlainObject(favorite) ||
      typeof favorite.id !== "string" ||
      favorite.id.length === 0
    ) {
      throw new TypeError("每个收藏都必须包含非空 id");
    }
    if (ids.has(favorite.id)) {
      throw new TypeError(`收藏 id 重复：${favorite.id}`);
    }
    ids.add(favorite.id);
    assertJsonValue(favorite);
  }

  return value;
}

function readFavorites(storage) {
  const { key, raw } = readStorageWithLegacy(
    storage,
    FAVORITES_STORAGE_KEY,
    FAVORITES_STORAGE_SUFFIX,
  );
  if (raw === null) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    const favorites = validateFavorites(parsed);
    finishStorageMigration(storage, FAVORITES_STORAGE_KEY, key, raw);
    return favorites;
  } catch {
    return [];
  }
}

function writeFavorites(storage, favorites) {
  const validFavorites = validateFavorites(favorites);
  storage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(validFavorites));
  return validFavorites;
}

export function favoritesRepository(storage = globalThis.localStorage) {
  if (
    !storage ||
    typeof storage.getItem !== "function" ||
    typeof storage.setItem !== "function"
  ) {
    throw new TypeError("收藏仓库需要兼容 localStorage 的存储对象");
  }

  return {
    list() {
      return readFavorites(storage);
    },
    save(favorite) {
      validateFavorites([favorite]);
      const favorites = readFavorites(storage);
      const index = favorites.findIndex((item) => item.id === favorite.id);
      if (index === -1) {
        favorites.push(favorite);
      } else {
        favorites[index] = favorite;
      }
      writeFavorites(storage, favorites);
      return favorite;
    },
    remove(id) {
      const favorites = readFavorites(storage);
      const remaining = favorites.filter((favorite) => favorite.id !== id);
      if (remaining.length !== favorites.length) {
        writeFavorites(storage, remaining);
      }
      return remaining;
    },
    exportJson() {
      return JSON.stringify(readFavorites(storage));
    },
    importJson(json) {
      let favorites;
      try {
        favorites = JSON.parse(json);
      } catch {
        throw new TypeError("收藏导入 JSON 无效");
      }

      return writeFavorites(storage, favorites);
    },
    replace(favorites) {
      return writeFavorites(storage, favorites);
    },
    clear() {
      storage.removeItem(FAVORITES_STORAGE_KEY);
      storage.removeItem(legacyStorageKey(FAVORITES_STORAGE_SUFFIX));
      return [];
    },
  };
}
