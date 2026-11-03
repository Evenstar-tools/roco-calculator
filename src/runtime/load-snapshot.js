import { assertCalculationEnvironment, getServerRelease } from "../domain/server-environment.js";
import { createGlobalPlaceholderCatalog } from "./global-placeholder-catalog.js";
import { publicResourceUrl, withPublicResourceUrls } from "./public-resource-url.js";
import { restoreS5RuntimeRelations } from "../data/s5-runtime-relations.js";

const loadedSnapshots = new WeakMap();

// Runtime catalogs are static. Sharing a validated snapshot must never expose
// writable entity records to another page or server's calculator session.
export function freezeSnapshot(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freezeSnapshot(child);
  return Object.freeze(value);
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw signal.reason ?? new DOMException("数据加载已取消", "AbortError");
}

// 每次加载的环境显式传入，不从共享的当前语言或全局可变服务器读取。
export async function loadServerSnapshot(serverId = "cn", { signal, fetcher = globalThis.fetch } = {}) {
  const release = getServerRelease(serverId);
  if (!release.dataURL || !release.capabilities.calculate) {
    const error = new Error("国际服数据与规则尚未核验");
    error.code = "SERVER_DATA_UNVERIFIED";
    throw error;
  }
  throwIfAborted(signal);
  const url = publicResourceUrl(release.dataURL);
  const key = JSON.stringify([serverId, release.dataVersion, release.rulesVersion, url]);
  const cached = loadedSnapshots.get(fetcher);
  if (cached?.has(key)) return cached.get(key);
  // Each caller retains its own cancellation. Only completed requests are reused.
  const response = await fetcher(url, { signal });
  throwIfAborted(signal);
  if (!response.ok) throw new Error(`数据加载失败：${response.status}`);
  const snapshot = await response.json();
  throwIfAborted(signal);
  assertCalculationEnvironment(snapshot, { serverId });
  const loaded = freezeSnapshot(withPublicResourceUrls(restoreS5RuntimeRelations(snapshot)));
  const snapshots = loadedSnapshots.get(fetcher) ?? new Map();
  snapshots.set(key, loaded);
  if (snapshots.size > 2) snapshots.delete(snapshots.keys().next().value);
  loadedSnapshots.set(fetcher, snapshots);
  return loaded;
}

// Explicitly authorized CN reference loading; the verified Global loader remains unavailable.
export async function loadGlobalPlaceholderCatalog({ signal, fetcher = globalThis.fetch } = {}) {
  const cnSnapshot = await loadServerSnapshot("cn", { signal, fetcher });
  throwIfAborted(signal);
  return createGlobalPlaceholderCatalog(cnSnapshot);
}
