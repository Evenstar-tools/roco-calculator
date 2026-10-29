import { version as appVersion } from "../../package.json";
import { eventMetadata } from "./metrics-core.js";
import { metricsPageUrl } from "./page-url.js";

const PAGE_URL = "https://rococalc.top/";

// 所有上报均经过同一出口；不发送 URL 参数、来源页、接口明细或错误正文。
export function filterRumRequest(request, pageUrl = PAGE_URL) {
  if (metricsPageUrl(pageUrl) !== pageUrl) return false;
  const url = new URL(request.url, PAGE_URL);
  if (url.origin !== "https://rumt-zh.com"
    || !["/collect/pv", "/collect/events", "/rateConfig"].includes(url.pathname)) return false;
  url.searchParams.delete("originFrom");
  url.searchParams.delete("referer");
  url.searchParams.set("from", pageUrl);
  return { ...request, url: url.href };
}

export async function loadRum({ id, version = appVersion, visitorId }) {
  const { default: Aegis } = await import("aegis-web-sdk");
  // 每个固定入口保留一个传输实例，延迟批次始终归属于事件发生的入口。
  // 三种语言共享设备和会话，不因语言切换重启会话。
  const clients = new Map();
  const clientFor = (pageUrl) => {
    if (clients.has(pageUrl)) return clients.get(pageUrl);
    const sdk = new Aegis({
      id,
      version,
      aid: visitorId,
      uin: "",
      hostUrl: "https://rumt-zh.com",
      pageUrl,
      urlHandler: () => pageUrl,
      spa: false,
      onError: false,
      reportApiSpeed: false,
      reportAssetSpeed: false,
      pagePerformance: false,
      webVitals: false,
      offlineLog: false,
      reportRetry: false,
      apiLog: false,
      assetLog: false,
      pageLoadLog: false,
      slowPageLoadLog: false,
      slowApiLog: false,
      slowAssetLog: false,
      clickElementLog: false,
      consoleLog: false,
      fingerId: false,
      whiteListUrl: "",
      onBeforeRequest: (request) => filterRumRequest(request, pageUrl),
    });
    clients.set(pageUrl, sdk);
    return sdk;
  };
  return {
    send(event) {
      const pageUrl = event.pageUrl ?? PAGE_URL;
      if (metricsPageUrl(pageUrl) !== pageUrl) return;
      clientFor(pageUrl).reportEvent({
        name: event.name,
        originFrom: pageUrl,
        ext1: event.feature,
        ext2: event.sessionId,
        ext3: JSON.stringify({ id: event.id, at: event.at, ...eventMetadata(event.name, event) }),
      });
    },
    destroy: () => { for (const sdk of clients.values()) sdk.destroy(); clients.clear(); },
  };
}
