import React from "react";
import { IS_PREVIEW_BUILD } from "./runtime/preview-channel.js";
import { metrics } from "./analytics/metrics.js";
import { createRoot } from "react-dom/client";
import { WebEntry } from "./runtime/WebEntry.jsx";
import { installInputSelection } from "./input-selection.js";
import "./styles.css";

let lastMetricsActivity = 0;
const noteActivity = () => {
  const now = Date.now();
  if (now - lastMetricsActivity < 1000) return;
  lastMetricsActivity = now;
  metrics.activity();
};
for (const type of ["pointerdown", "keydown", "scroll"]) window.addEventListener(type, noteActivity, { passive: true });
if (import.meta.hot) import.meta.hot.dispose(() => {
  for (const type of ["pointerdown", "keydown", "scroll"]) window.removeEventListener(type, noteActivity);
});

const removeInputSelection = installInputSelection(document);
if (import.meta.hot) import.meta.hot.dispose(removeInputSelection);

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <WebEntry />
  </React.StrictMode>,
);

const isDesktopApp = window.location.protocol === "app:";

if ("serviceWorker" in navigator && import.meta.env.PROD && !isDesktopApp && !IS_PREVIEW_BUILD) {
  const cacheVisitedAssets = () => {
    const urls = performance.getEntriesByType("resource").map(({ name }) => name)
      .filter((name) => { const url = new URL(name); return url.origin === location.origin && (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/global-assets/assets/")); });
    navigator.serviceWorker.controller?.postMessage({ type: "CACHE_VISITED_ASSETS", urls });
  };
  navigator.serviceWorker.addEventListener("controllerchange", cacheVisitedAssets);
  // 动态模块可能在接管瞬间仍在下载；补缓存这批完成较晚的已访问资源。
  if ("PerformanceObserver" in window) {
    const observer = new PerformanceObserver(() => cacheVisitedAssets());
    observer.observe({ type: "resource", buffered: true });
  }
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").then(() => navigator.serviceWorker.ready).then(cacheVisitedAssets).catch(() => {
      // 离线缓存失败不阻断计算器主流程。
    });
  });
}
