import { createElement, lazy } from "react";
import { metrics } from "../analytics/metrics.js";

const RELOAD_GUARD_KEY = "rock-calculator.chunk-reload.v1";
const RELOAD_GUARD_MS = 60_000;
const RETRY_DELAY_MS = 500;
const BUILD_CHECK_TIMEOUT_MS = 5000;
const chunkFailures = new WeakSet();
const failedLoaders = new Set();
let imageFailureReported = false;

export function isChunkFailure(error) {
  return Object(error) === error && chunkFailures.has(error);
}

export function reportLoadFailure(kind, outcome) {
  metrics.track("load_failure", "calculator", { kind, outcome });
}

export function reportImageFailure() {
  if (imageFailureReported) return;
  imageFailureReported = true;
  reportLoadFailure("image", "placeholder");
}

/** 发布后旧页面的分包已被删除时，页面入口脚本会与服务器当前 HTML 不一致。 */
export async function hasNewerBuild({ doc = document, fetchImpl = fetch, pathname = location.pathname } = {}) {
  const controller = new AbortController();
  let timer;
  try {
    const running = [...doc.querySelectorAll('script[type="module"][src]')]
      .map((script) => new URL(script.src, location.href))
      .find((url) => url.origin === location.origin && /\/main-[\w-]+\.js$/.test(url.pathname));
    if (!running) return false;
    const entryDirectory = new URL(".", running).pathname;
    const requestURL = new URL(pathname, location.href);
    const timeout = new Promise((resolve) => {
      timer = setTimeout(() => {
        controller.abort();
        resolve(false);
      }, BUILD_CHECK_TIMEOUT_MS);
    });
    const check = async () => {
      // build-check 让 Service Worker 放行，避免读到缓存里的旧 HTML。
      const response = await fetchImpl(`${pathname}?build-check=${Date.now()}`, { cache: "no-store", signal: controller.signal });
      if (!response.ok || !/^text\/html(?:\s*;|$)/i.test(response.headers.get("Content-Type") ?? "")) return false;
      const responseURL = new URL(response.url || requestURL.href);
      if (responseURL.origin !== requestURL.origin || responseURL.pathname !== requestURL.pathname) return false;
      const current = new DOMParser().parseFromString(await response.text(), "text/html");
      if (!current.querySelector("#root")) return false;
      const base = current.querySelector("base[href]");
      const baseURL = base ? new URL(base.getAttribute("href"), responseURL) : responseURL;
      const entries = [...current.querySelectorAll('script[type="module"][src]')]
        .map((script) => new URL(script.getAttribute("src"), baseURL))
        .filter((url) => url.origin === running.origin && new URL(".", url).pathname === entryDirectory && /\/main-[\w-]+\.js$/.test(url.pathname));
      return entries.length === 1 && entries[0].pathname !== running.pathname;
    };
    // 同时约束请求和正文读取；即使请求实现未响应 abort，也能结束检查。
    return await Promise.race([check(), timeout]);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** 只在确认有新版本时刷新；一分钟内不重复，避免新版本同样失败时循环刷新。 */
export async function reloadForNewBuild({ storage = globalThis.sessionStorage, now = Date.now, reload = () => location.reload(), check = hasNewerBuild } = {}) {
  try {
    const previous = JSON.parse(storage.getItem(RELOAD_GUARD_KEY) ?? "null");
    if (previous && now() - previous.at < RELOAD_GUARD_MS) return false;
    if (!(await check())) return false;
    storage.setItem(RELOAD_GUARD_KEY, JSON.stringify({ at: now(), pendingReport: true }));
  } catch {
    return false;
  }
  reload();
  return true;
}

/** 刷新后再上报，避免统计批次随旧页面一起丢失。 */
export function reportRecoveredReload({ storage = globalThis.sessionStorage } = {}) {
  try {
    const previous = JSON.parse(storage.getItem(RELOAD_GUARD_KEY) ?? "null");
    if (!previous?.pendingReport) return;
    storage.setItem(RELOAD_GUARD_KEY, JSON.stringify({ at: previous.at }));
    reportLoadFailure("chunk", "reload");
  } catch {
    // 统计不能中断功能。
  }
}

export async function loadWithRecovery(load, { delay = RETRY_DELAY_MS, reloadForNew = reloadForNewBuild } = {}) {
  try {
    return await load();
  } catch {
    await new Promise((resolve) => { setTimeout(resolve, delay); });
  }
  try {
    return await load();
  } catch (error) {
    // 刷新期间保持加载态，不闪错误页。
    if (await reloadForNew()) return new Promise(() => {});
    if (Object(error) === error) chunkFailures.add(error);
    throw error;
  }
}

/** React.lazy 会记住失败结果；关闭后重置，再次打开才会重新加载。 */
export function recoverableLazy(load) {
  let current;
  const reset = () => {
    current = lazy(() => loadWithRecovery(load).catch((error) => {
      failedLoaders.add(reset);
      throw error;
    }));
  };
  reset();
  return function RecoverableLazy(props) {
    return createElement(current, props);
  };
}

export function resetFailedLoads() {
  for (const reset of failedLoaders) reset();
  failedLoaders.clear();
}
