import { version as appVersion } from "../../package.json";

const PAGE_URL = "https://rococalc.top/";

// 所有上报均经过同一出口；不发送 URL 参数、来源页、接口明细或错误正文。
export function filterRumRequest(request) {
  const url = new URL(request.url, PAGE_URL);
  if (url.origin !== "https://rumt-zh.com"
    || !["/collect/pv", "/collect/events", "/rateConfig"].includes(url.pathname)) return false;
  url.searchParams.delete("originFrom");
  url.searchParams.delete("referer");
  url.searchParams.set("from", PAGE_URL);
  return { ...request, url: url.href };
}

export async function loadRum({ id, version = appVersion, visitorId }) {
  const { default: Aegis } = await import("aegis-web-sdk");
  const sdk = new Aegis({
    id,
    version,
    aid: visitorId,
    uin: "",
    hostUrl: "https://rumt-zh.com",
    pageUrl: PAGE_URL,
    urlHandler: () => PAGE_URL,
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
    onBeforeRequest: filterRumRequest,
  });
  return {
    send(event) {
      sdk.reportEvent({
        name: event.name,
        originFrom: PAGE_URL,
        ext1: event.feature,
        ext2: event.sessionId,
        ext3: JSON.stringify({ id: event.id, at: event.at }),
      });
    },
    destroy: () => sdk.destroy(),
  };
}
