import React from "react";
import { metrics } from "./analytics/metrics.js";
import { createRoot } from "react-dom/client";
import { CalculatorRouter } from "./CalculatorRouter.jsx";
import { installInputSelection } from "./input-selection.js";
import "./styles.css";

void metrics.start();
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
    <CalculatorRouter />
  </React.StrictMode>,
);

const isDesktopApp = window.location.protocol === "app:";

if ("serviceWorker" in navigator && import.meta.env.PROD && !isDesktopApp) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // 离线缓存失败不阻断计算器主流程。
    });
  });
}
