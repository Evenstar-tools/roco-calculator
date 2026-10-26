const enabled = import.meta.env.MODE !== "pre" && import.meta.env.PROD && import.meta.env.VITE_RUM_ENABLED === "true"
  && Boolean(import.meta.env.VITE_RUM_ID) && globalThis.location?.origin === "https://rococalc.top";
const initialFeature = /^\/dianlu\/?$/.test(globalThis.location?.pathname ?? "") ? "deer" : "calculator";
let serverId = /^\/(?:en(?:\/|$)|global(?:\/|$))/.test(globalThis.location?.pathname ?? "") ? "global" : "cn";
let generation = 0;
let instance;
let starting;
const pending = [];

export const metrics = {
  setServer(next) {
    if (next === serverId) return;
    serverId = next;
    if (serverId !== "cn") {
      generation += 1;
      instance?.destroy();
      instance = null;
      starting = null;
      pending.length = 0;
    }
  },
  start() {
    if (!enabled || serverId !== "cn" || starting) return starting;
    const token = generation;
    starting = import("./metrics-core.js").then(async ({ createMetrics }) => {
      if (token !== generation || serverId !== "cn") return;
      const current = createMetrics({
        enabled: true,
        initialFeature,
        storage: () => globalThis.localStorage,
        loadTransport: async ({ visitorId }) => {
          const { loadRum } = await import("./rum.js");
          return loadRum({ id: import.meta.env.VITE_RUM_ID, visitorId });
        },
      });
      instance = current;
      await current.start();
      if (token !== generation || serverId !== "cn") { current.destroy(); return; }
      for (const [method, ...args] of pending.splice(0)) current[method](...args);
    }).catch(() => { pending.length = 0; });
    return starting;
  },
  activity() { if (serverId === "cn") instance?.activity(); },
  route(feature) {
    if (!enabled || serverId !== "cn") return;
    if (instance) instance.route(feature);
    else if (pending.length < 30) pending.push(["route", feature]);
  },
  track(...args) {
    if (!enabled || serverId !== "cn") return;
    if (instance) instance.track(...args);
    else if (pending.length < 30) pending.push(["track", ...args]);
  },
};
