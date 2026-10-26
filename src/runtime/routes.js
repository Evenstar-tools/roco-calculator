import { IS_PREVIEW_BUILD, previewRoute, unprefixedRoute } from "./preview-channel.js";
import { shareMetadataFromHash } from "../state/share.js";

export const MANUAL_PREFERENCE_KEY = "rock-calculator.runtime.manual-preference.v1";
export const GLOBAL_LOCALE_KEY = "rock-calculator.runtime.global-locale.v1";

const CN_ROUTE = Object.freeze({ serverId: "cn", locale: "zh-CN" });
const GLOBAL_PATHS = Object.freeze({ "zh-CN": "/global/zh-CN/", en: "/en/", ja: "/global/ja/" });

export function parseRoute(pathname = "/") {
  const path = unprefixedRoute(pathname).replace(/\/$/, "") || "/";
  if (IS_PREVIEW_BUILD && path === "/") return { ...CN_ROUTE, explicit: true };
  if (path === "/cn" || path === "/dianlu") return { ...CN_ROUTE, explicit: true };
  const locale = Object.keys(GLOBAL_PATHS).find((key) => GLOBAL_PATHS[key].slice(0, -1) === path);
  return locale
    ? { serverId: "global", locale, explicit: true }
    : { ...CN_ROUTE, explicit: false };
}

export function routeFor(serverId, locale = "en") {
  return serverId === "global" ? GLOBAL_PATHS[locale] ?? GLOBAL_PATHS.en : previewRoute(IS_PREVIEW_BUILD ? "/" : "/cn/");
}

function normalizePreference(value) {
  if (value?.serverId === "cn" && value.locale === "zh-CN") return { ...CN_ROUTE };
  if (value?.serverId === "global" && Object.hasOwn(GLOBAL_PATHS, value.locale)) {
    return { serverId: "global", locale: value.locale };
  }
  return null;
}

export function readManualPreference(storage) {
  try {
    return normalizePreference(JSON.parse((storage ?? globalThis.localStorage)?.getItem(MANUAL_PREFERENCE_KEY) ?? "null"));
  } catch {
    return null;
  }
}

export function readGlobalLocale(storage = globalThis.localStorage) {
  try {
    const locale = storage?.getItem(GLOBAL_LOCALE_KEY);
    if (Object.hasOwn(GLOBAL_PATHS, locale)) return locale;
    const preference = readManualPreference(storage);
    return preference?.serverId === "global" ? preference.locale : "en";
  } catch { return "en"; }
}

// 只由显式切服/选语言操作调用；自动分流和打开分享不能持久化为用户偏好。
export function writeManualPreference(preference, storage) {
  const value = normalizePreference(preference);
  if (!value) return false;
  try {
    const target = storage ?? globalThis.localStorage;
    if (!target) return false;
    target.setItem(MANUAL_PREFERENCE_KEY, JSON.stringify(value));
    if (value.serverId === "global") target.setItem(GLOBAL_LOCALE_KEY, value.locale);
    return true;
  } catch {
    return false;
  }
}

function preferredLocale(languages) {
  for (const language of languages ?? []) {
    if (/^ja(?:-|$)/i.test(language)) return "ja";
    if (/^zh(?:-|$)/i.test(language)) return "zh-CN";
    if (/^en(?:-|$)/i.test(language)) return "en";
  }
  return "en";
}

export function resolveEntry({ pathname = "/", hash = "", preference, languages = [], countryCode, globalReady = false, hasLegacyCnData = false } = {}) {
  const route = parseRoute(pathname);
  const result = (target, reason, conflict = null) => ({ ...target, explicit: target.explicit ?? false, reason, conflict });
  const share = shareMetadataFromHash(hash);
  const sharedRoute = share && (share.serverId === "cn" ? CN_ROUTE : { serverId: "global", locale: share.locale ?? "en" });
  if (route.explicit) {
    const conflict = sharedRoute && route.serverId !== sharedRoute.serverId
      ? { type: share.protocolVersion === 1 ? "legacy-cn-share" : "server-share", requested: { serverId: route.serverId, locale: route.locale }, target: { ...sharedRoute } }
      : null;
    return result(route, "path", conflict);
  }
  // 明确打开分享属于用户选择入口；只影响路由，数据仍须完整解码校验。
  if (sharedRoute) return result(sharedRoute, share.protocolVersion === 1 ? "legacy-share" : "share");
  // 未认证的分享协议和未知路径不参与自动分流，交回原入口报告错误。
  if (hash && hash !== "#") return result(CN_ROUTE, "unrecognized-share");
  if (pathname !== "/" && pathname !== "") return result(route, "unrecognized-path");
  const manual = normalizePreference(preference);
  if (manual) return result(manual, "preference");
  if (hasLegacyCnData) return result(CN_ROUTE, "legacy-data");
  const locale = preferredLocale(languages);
  const country = String(countryCode ?? "").toUpperCase();
  const hasCountry = /^[A-Z]{2}$/.test(country) && !["XX", "ZZ"].includes(country);
  const serverId = hasCountry ? (country === "CN" ? "cn" : "global") : (locale === "zh-CN" ? "cn" : "global");
  if (serverId === "global" && !globalReady) return result(CN_ROUTE, "auto-global-unavailable");
  return result(serverId === "global" ? { serverId, locale } : CN_ROUTE, hasCountry ? "country" : "language");
}
