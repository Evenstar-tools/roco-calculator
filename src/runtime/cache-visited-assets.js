/** Keep visited lazy resources available after the service worker takes control. */
export function observeVisitedAssets(serviceWorker, {
  origin = globalThis.location.origin,
  performance = globalThis.performance,
  PerformanceObserver = globalThis.PerformanceObserver,
} = {}) {
  let lastController = null;
  const reported = new Set();
  const send = (entries) => {
    const controller = serviceWorker.controller;
    if (!controller) return;
    if (controller !== lastController) { reported.clear(); lastController = controller; }
    const urls = [];
    for (const { name } of entries) {
      let url;
      try { url = new URL(name); } catch { continue; }
      if (url.origin !== origin || !(url.pathname.startsWith("/assets/") || url.pathname.startsWith("/global-assets/assets/"))) continue;
      url.hash = "";
      if (reported.has(url.href)) continue;
      reported.add(url.href);
      urls.push(url.href);
    }
    if (urls.length) controller.postMessage({ type: "CACHE_VISITED_ASSETS", urls });
  };
  // 初次接管或新 SW 接管时补全历史；日常资源事件只处理刚完成的一批。
  const cacheVisitedAssets = () => send(performance.getEntriesByType("resource"));
  serviceWorker.addEventListener("controllerchange", cacheVisitedAssets);
  if (PerformanceObserver) {
    const observer = new PerformanceObserver((list) => send(list.getEntries()));
    observer.observe({ type: "resource", buffered: true });
  }
  return cacheVisitedAssets;
}
