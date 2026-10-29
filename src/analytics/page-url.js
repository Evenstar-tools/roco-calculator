const ORIGIN = "https://rococalc.top";

// 只保留固定入口；分享参数、查询词与 hash 不进入统计。
export function metricsPageUrl(value = globalThis.location?.href) {
  try {
    const url = new URL(value);
    if (url.origin !== ORIGIN) return null;
    if (/^\/en\/?$/.test(url.pathname)) return `${ORIGIN}/en/`;
    if (/^\/(?:jp|global\/ja)\/?$/.test(url.pathname)) return `${ORIGIN}/jp/`;
    if (/^\/global\/zh-CN\/?$/.test(url.pathname)) return `${ORIGIN}/global/zh-CN/`;
    if (/^\/(?:dianlu\/?)?$/.test(url.pathname)) return `${ORIGIN}/`;
  } catch { /* 无效网址不采集。 */ }
  return null;
}
