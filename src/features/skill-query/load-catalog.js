import { unpackCatalog } from "./catalog.js";
import { getServerRelease } from "../../domain/server-environment.js";

const pending = new Map();
const cached = new Map();
const cacheKey = (release) => `${release.serverId}:${release.dataVersion}:${release.rulesVersion}`;

export const getCachedCatalog = (serverId = "cn") => {
  const release = getServerRelease(serverId);
  return release.capabilities.search ? cached.get(cacheKey(release)) ?? null : null;
};

// 菜单预取和面板共用同一次请求；失败后清除，重试不能复用失败的 Promise。
export function loadSkillCatalog(serverId = "cn") {
  const release = getServerRelease(serverId);
  if (!release.capabilities.search || !release.catalogURL) {
    const error = new Error("国际服技能资料尚未核验");
    error.code = "SERVER_DATA_UNVERIFIED";
    return Promise.reject(error);
  }
  const key = cacheKey(release);
  if (!pending.has(key)) pending.set(key, fetch(release.catalogURL)
    .then((response) => {
      if (!response.ok) throw new Error("技能资料加载失败");
      return response.json();
    })
    .then((value) => { const catalog = unpackCatalog(value); cached.set(key, catalog); return catalog; })
    .catch((error) => { pending.delete(key); throw error; }));
  return pending.get(key);
}
