const SESSION_TIMEOUT = 30 * 60 * 1000;
const VISITOR_KEY = "rococalc.metrics.visitor.v1";
const SESSION_KEY = "rococalc.metrics.session.v1";
const FEATURES = new Set(["calculator", "teams", "rankings", "skills", "desktop", "deer", "types", "transmission", "speed", "durability"]);
const EVENTS = new Set(["page_view", "session_start", "feature_view", "calculation_ready", "lineup_use", "download_click"]);

export function createMetrics({ enabled, storage, initialFeature = "calculator", now = Date.now, uuid = () => crypto.randomUUID(), loadTransport }) {
  let transport;
  let starting;
  let visitorId;
  let session;
  let currentFeature = initialFeature;
  const pending = [];
  const read = (key) => {
    try { return JSON.parse(storage()?.getItem(key) ?? "null"); } catch { return null; }
  };
  const write = (key, value) => {
    try { storage()?.setItem(key, JSON.stringify(value)); } catch { /* 禁用存储时仅在当前页面计数。 */ }
  };
  const emit = (name, feature, at) => {
    const event = { id: uuid(), name, feature, at, sessionId: session.id };
    if (transport) {
      try { transport.send(event); } catch { /* 统计不能中断功能。 */ }
    } else if (pending.length < 30) pending.push(event);
  };
  const touch = () => {
    const at = now();
    const stored = read(SESSION_KEY);
    if (stored?.id && Number.isFinite(stored.last)) session = stored;
    const fresh = !session || at - session.last >= SESSION_TIMEOUT || at < session.last;
    if (fresh) session = { id: uuid(), last: at };
    session.last = at;
    write(SESSION_KEY, session);
    if (fresh) emit("session_start", "calculator", at);
    return at;
  };
  return {
    start() {
      if (!enabled || starting) return starting;
      starting = Promise.resolve().then(async () => {
        try {
          visitorId = read(VISITOR_KEY);
          if (typeof visitorId !== "string" || !/^[a-zA-Z0-9_-]{4,36}$/.test(visitorId)) {
            visitorId = uuid();
            write(VISITOR_KEY, visitorId);
          }
          const at = touch();
          emit("page_view", currentFeature, at);
          emit("feature_view", currentFeature, at);
          transport = await loadTransport({ visitorId });
          for (const event of pending.splice(0)) {
            try { transport.send(event); } catch { /* 不重试，避免阻塞或重复计数。 */ }
          }
        } catch { pending.length = 0; }
      });
      return starting;
    },
    route(feature) {
      if (!enabled || !starting || !["calculator", "deer"].includes(feature) || feature === currentFeature) return;
      currentFeature = feature;
      try {
        const at = touch();
        emit("page_view", feature, at);
        emit("feature_view", feature, at);
      } catch { /* 路由统计不影响导航。 */ }
    },
    activity() {
      if (!enabled || !starting) return;
      try { touch(); } catch { /* 统计故障不影响交互。 */ }
    },
    track(name, feature = "calculator") {
      if (!enabled || !starting || !EVENTS.has(name) || !FEATURES.has(feature)) return;
      try { emit(name, feature, touch()); } catch { /* 不读取或上报业务参数。 */ }
    },
  };
}
