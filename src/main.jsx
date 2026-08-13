import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.jsx";
import "./styles.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
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
