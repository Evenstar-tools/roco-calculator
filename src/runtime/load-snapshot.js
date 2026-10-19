import { assertCalculationEnvironment, getServerRelease } from "../domain/server-environment.js";
import { createGlobalPlaceholderCatalog } from "./global-placeholder-catalog.js";

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
  const response = await fetcher(release.dataURL, { signal });
  throwIfAborted(signal);
  if (!response.ok) throw new Error(`数据加载失败：${response.status}`);
  const snapshot = await response.json();
  throwIfAborted(signal);
  assertCalculationEnvironment(snapshot, { serverId });
  return snapshot;
}

// Explicitly authorized CN reference loading; the verified Global loader remains unavailable.
export async function loadGlobalPlaceholderCatalog({ signal, fetcher = globalThis.fetch } = {}) {
  const cnSnapshot = await loadServerSnapshot("cn", { signal, fetcher });
  throwIfAborted(signal);
  return createGlobalPlaceholderCatalog(cnSnapshot);
}
