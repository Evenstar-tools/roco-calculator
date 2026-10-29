import { createMetrics } from "./metrics-core.js";
import { metricsPageUrl } from "./page-url.js";

const enabled = import.meta.env.MODE !== "pre" && import.meta.env.PROD && import.meta.env.VITE_RUM_ENABLED === "true"
  && Boolean(import.meta.env.VITE_RUM_ID) && globalThis.location?.origin === "https://rococalc.top";
let instance;

export const metrics = {
  setServer() {
    const pageUrl = metricsPageUrl();
    if (!pageUrl) { instance?.destroy(); instance = null; return; }
    instance?.page(pageUrl);
  },
  start() {
    const pageUrl = metricsPageUrl();
    if (!enabled || !pageUrl) return;
    if (!instance) instance = createMetrics({
      enabled: true,
      initialFeature: /^\/dianlu\/?$/.test(globalThis.location?.pathname ?? "") ? "deer" : "calculator",
      pageUrl,
      storage: () => globalThis.localStorage,
      loadTransport: async ({ visitorId }) => {
        const { loadRum } = await import("./rum.js");
        return loadRum({ id: import.meta.env.VITE_RUM_ID, visitorId });
      },
    });
    instance.page(pageUrl);
    return instance.start();
  },
  activity() { instance?.activity(); },
  route(feature) { this.start(); instance?.route(feature); },
  track(...args) { this.start(); instance?.track(...args); },
};
