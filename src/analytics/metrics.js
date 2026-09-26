const enabled = import.meta.env.PROD && import.meta.env.VITE_RUM_ENABLED === "true"
  && Boolean(import.meta.env.VITE_RUM_ID) && globalThis.location?.origin === "https://rococalc.top";
const initialFeature = /^\/dianlu\/?$/.test(globalThis.location?.pathname ?? "") ? "deer" : "calculator";
let instance;
let starting;
const pending = [];

export const metrics = {
  start() {
    if (!enabled || starting) return starting;
    starting = import("./metrics-core.js").then(async ({ createMetrics }) => {
      instance = createMetrics({
        enabled: true,
        initialFeature,
        storage: () => globalThis.localStorage,
        loadTransport: async ({ visitorId }) => {
          const { loadRum } = await import("./rum.js");
          return loadRum({ id: import.meta.env.VITE_RUM_ID, visitorId });
        },
      });
      await instance.start();
      for (const [method, ...args] of pending.splice(0)) instance[method](...args);
    }).catch(() => { pending.length = 0; });
    return starting;
  },
  activity() { instance?.activity(); },
  route(feature) {
    if (!enabled) return;
    if (instance) instance.route(feature);
    else if (pending.length < 30) pending.push(["route", feature]);
  },
  track(...args) {
    if (!enabled) return;
    if (instance) instance.track(...args);
    else if (pending.length < 30) pending.push(["track", ...args]);
  },
};
