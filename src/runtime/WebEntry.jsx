import { lazy, Suspense, useEffect, useState } from "react";
import { IS_PREVIEW_BUILD } from "./preview-channel.js";
import { metrics } from "../analytics/metrics.js";
import { readThemeSetting } from "../state/display-settings.js";
import { applyPageMetadata } from "../seo/page-metadata.js";
import { readGlobalLocale, readManualPreference, resolveEntry, routeFor, writeManualPreference } from "./routes.js";
import { decodeShareEnvelope } from "../state/share.js";
import { IncomingShareNotice } from "./IncomingShareNotice.jsx";
import { RuntimeProvider } from "./RuntimeContext.jsx";
import { RuntimeErrorBoundary } from "./RuntimeErrorBoundary.jsx";
import { LocaleProvider } from "../i18n/LocaleContext.jsx";
import { pickRandomSeasonThemeId, resolveSeasonPreviewId, resolveSeasonThemeId } from "../theme/season-themes.js";
import { readLastRandomSeasonTheme, readSeasonThemePreference, writeLastRandomSeasonTheme, writeSeasonThemePreference } from "../state/season-theme.js";
import { SeasonThemeProvider } from "../theme/SeasonThemeContext.jsx";

const CalculatorRouter = lazy(() => import("../CalculatorRouter.jsx").then((module) => ({ default: module.CalculatorRouter })));
const pageText = {
  en: { title: "Roco Calculator · Global", description: "Roco Kingdom damage calculator using S3 midseason stats and rules.", loading: "Loading calculator…" },
  "zh-CN": { title: "洛克计算器 · 国际服", description: "洛克王国国际服计算器，采用 S3 季中数值与规则。", loading: "正在加载计算器…" },
  ja: { title: "ロコ計算機 · グローバル", description: "S3 シーズン中盤の能力値とルールに基づくダメージ計算機。", loading: "計算機を読み込み中…" },
};

export function browserEntry() {
  let preference = null;
  let hasLegacyCnData = false;
  try {
    preference = readManualPreference(localStorage);
    // 返回历史根入口时恢复当时的服，不被后来手动选择覆盖。
    if (location.pathname === "/" && !location.hash && history.state?.rocoEntry) {
      preference = history.state.rocoEntry;
    }
    hasLegacyCnData = ["teams.v1", "spirit-configs.v2", "spirit-configs.v1", "favorites.v1"]
      .some((suffix) => localStorage.getItem(`rock-calculator.${suffix}`) !== null ||
        localStorage.getItem(`rock-calculator.servers.cn.${suffix}`) !== null);
  } catch { /* 禁用存储仍可使用明确入口。 */ }
  return resolveEntry({
    pathname: location.pathname, hash: location.hash, preference,
    languages: navigator.languages, hasLegacyCnData,
    // 只启用用户明确访问的国际服入口，沿用现有自动分流设置。
    globalReady: false,
  });
}

export function WebEntry({ initialEntry = null, initialSnapshot = null }) {
  const [entry, setEntry] = useState(() => initialEntry ?? browserEntry());
  const [cnVisited, setCnVisited] = useState(entry.serverId === "cn");
  const [globalVisited, setGlobalVisited] = useState(entry.serverId === "global");
  const [globalLocale, setGlobalLocale] = useState(() => entry.serverId === "global" ? entry.locale : readGlobalLocale());
  const [theme, setTheme] = useState(readThemeSetting);
  const [seasonPreferences, setSeasonPreferences] = useState(() => ({
    cn: readSeasonThemePreference("cn"), global: readSeasonThemePreference("global"),
  }));
  const [randomSeasonThemes, setRandomSeasonThemes] = useState(() => ({
    cn: seasonPreferences.cn === "random" ? pickRandomSeasonThemeId(Math.random, readLastRandomSeasonTheme("cn")) : null,
    global: seasonPreferences.global === "random" ? pickRandomSeasonThemeId(Math.random, readLastRandomSeasonTheme("global")) : null,
  }));
  const [urlHash, setUrlHash] = useState(() => location.hash);
  const [urlShare, setUrlShare] = useState(null);
  const [manualShare, setManualShare] = useState(null);
  const [shareRequests, setShareRequests] = useState({ cn: 0, global: 0 });
  const isDesktop = location.protocol === "app:";
  const global = !isDesktop && entry.serverId === "global";
  const copy = pageText[entry.locale] ?? pageText.en;
  const cnSeasonThemeId = resolveSeasonThemeId({ serverId: "cn", preference: seasonPreferences.cn, randomThemeId: randomSeasonThemes.cn, search: location.search, hostname: location.hostname });
  const globalSeasonThemeId = resolveSeasonThemeId({ serverId: "global", preference: seasonPreferences.global, randomThemeId: randomSeasonThemes.global, search: location.search, hostname: location.hostname });
  const previewId = resolveSeasonPreviewId({ search: location.search, hostname: location.hostname });
  const isSeasonPreview = (id) => id !== "neutral" && previewId === id;
  const checkUrlShare = !isDesktop && Boolean(entry.conflict);
  const checkedUrlShare = urlShare?.hash === urlHash ? urlShare : null;
  const incoming = manualShare ?? checkedUrlShare;
  const conflictServer = incoming?.envelope?.serverId !== entry.serverId ? incoming?.envelope?.serverId : null;

  useEffect(() => {
    if (!urlHash || !checkUrlShare) return undefined;
    let cancelled = false;
    decodeShareEnvelope(urlHash).then(
      (envelope) => { if (!cancelled) setUrlShare({ hash: urlHash, envelope }); },
      (error) => { if (!cancelled) setUrlShare({ hash: urlHash, error }); },
    );
    return () => { cancelled = true; };
  }, [urlHash, checkUrlShare]);

  useEffect(() => {
    const update = () => {
      const next = browserEntry();
      if (next.serverId === "cn") setCnVisited(true);
      else { setGlobalVisited(true); setGlobalLocale(next.locale); }
      setTheme(readThemeSetting());
      setEntry(next);
      setUrlHash(location.hash);
      setManualShare(null);
    };
    window.addEventListener("popstate", update);
    window.addEventListener("hashchange", update);
    return () => {
      window.removeEventListener("popstate", update);
      window.removeEventListener("hashchange", update);
    };
  }, []);

  useEffect(() => {
    history.replaceState({ ...history.state, rocoEntry: { serverId: global ? "global" : "cn", locale: global ? entry.locale : "zh-CN" } }, "");
    document.documentElement.lang = global ? entry.locale : "zh-CN";
    document.documentElement.dataset.server = global ? "global" : "cn";
    if (!isDesktop && !IS_PREVIEW_BUILD) {
      document.querySelector('link[rel="manifest"]')?.setAttribute("href", global ? `/manifest-global-${entry.locale}.webmanifest` : "/manifest.webmanifest");
      document.querySelector('meta[name="apple-mobile-web-app-title"]')?.setAttribute("content", global ? copy.title : "洛克计算器");
    }
    metrics.setServer(global ? "global" : "cn");
    if (global) applyPageMetadata({ ...copy, canonical: `https://rococalc.top${routeFor("global", entry.locale)}` });
    else void metrics.start();
  }, [global, entry.locale, copy, isDesktop]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    // Commit the draw only after rendering; locale changes keep both in-memory selections.
    if (cnVisited && seasonPreferences.cn === "random") writeLastRandomSeasonTheme(randomSeasonThemes.cn, "cn");
    if (globalVisited && seasonPreferences.global === "random") writeLastRandomSeasonTheme(randomSeasonThemes.global, "global");
  }, [cnVisited, globalVisited, seasonPreferences.cn, seasonPreferences.global, randomSeasonThemes.cn, randomSeasonThemes.global]);

  function changeSeasonTheme(serverId, value) {
    const preference = writeSeasonThemePreference(value, serverId);
    if (preference === "random") {
      const randomThemeId = pickRandomSeasonThemeId(Math.random, serverId === "global" ? globalSeasonThemeId : cnSeasonThemeId);
      setRandomSeasonThemes((current) => ({ ...current, [serverId]: randomThemeId }));
    }
    const url = new URL(location.href);
    url.searchParams.delete("seasonPreview");
    history.replaceState(history.state, "", `${url.pathname}${url.search}${url.hash}`);
    setSeasonPreferences((current) => ({ ...current, [serverId]: preference }));
  }

  function navigate(serverId, locale, { remember = true, hash = "", replace = false } = {}) {
    if ((IS_PREVIEW_BUILD && serverId === "global") || (import.meta.env.MODE === "global" && serverId === "cn")) {
      if (remember) writeManualPreference({ serverId, locale: serverId === "cn" ? "zh-CN" : locale });
      window.location.assign(`${routeFor(serverId, locale)}${hash}`);
      return;
    }
    const next = { serverId, locale: serverId === "cn" ? "zh-CN" : locale };
    if (serverId === "global") setTheme(readThemeSetting());
    if (remember) writeManualPreference(next);
    const url = `${routeFor(next.serverId, next.locale)}${location.search}${hash}`;
    window.history.replaceState({ ...history.state, rocoEntry: { serverId: entry.serverId, locale: entry.locale } }, "");
    window.history[replace ? "replaceState" : "pushState"]({ rocoEntry: next }, "", url);
    if (serverId === "cn") setCnVisited(true);
    else { setGlobalVisited(true); setGlobalLocale(next.locale); }
    setEntry(resolveEntry({ pathname: routeFor(next.serverId, next.locale), hash }));
    setUrlHash(hash);
    if (serverId !== entry.serverId) setManualShare(null);
    // 同页切服立即停用采集；旧异步 SDK 请求也由传输出口再次检查。
    document.documentElement.dataset.server = serverId;
    metrics.setServer(serverId);
    window.scrollTo(0, 0);
  }

  function clearUrlShare() {
    history.replaceState(history.state, "", `${location.pathname}${location.search}`);
    setUrlHash("");
    setUrlShare(null);
    setEntry((current) => ({ ...current, conflict: null }));
  }

  function dismissShare() {
    if (manualShare) setManualShare(null);
    else clearUrlShare();
  }

  function openMatchingServer() {
    if (!incoming?.envelope || !conflictServer) return;
    const locale = incoming.envelope.locale ?? (conflictServer === "cn" ? "zh-CN" : "en");
    // 目标服由原分享校验链消费。原页保留在内存中，存储不可用时也不丢现场。
    setShareRequests((current) => ({ ...current, [conflictServer]: current[conflictServer] + 1 }));
    navigate(conflictServer, locale, { remember: false, hash: incoming.hash });
  }

  const entryNotice = <IncomingShareNotice locale={global ? entry.locale : "zh-CN"}
    loading={!manualShare && Boolean(urlHash) && checkUrlShare && !checkedUrlShare}
    error={incoming?.error} targetServer={conflictServer}
    onOpen={openMatchingServer} onCancel={dismissShare} />;

  return <>
    {(entry.conflict || manualShare) && <div className="entry-share-notice__cn">{entryNotice}</div>}
    {(cnVisited || isDesktop) && <SeasonThemeProvider serverId="cn" active={!global}
      seasonThemeId={cnSeasonThemeId} preference={seasonPreferences.cn} onSeasonThemeChange={(value) => changeSeasonTheme("cn", value)}>
      <div hidden={global} inert={global || undefined}>
      <RuntimeErrorBoundary locale="zh-CN"><Suspense fallback={<p role="status">正在加载计算器…</p>}>
        <RuntimeProvider serverId="cn" locale="zh-CN" seasonThemeId={cnSeasonThemeId} seasonPreview={isSeasonPreview(cnSeasonThemeId)} seasonThemePreference={seasonPreferences.cn} onSeasonThemeChange={(value) => changeSeasonTheme("cn", value)} shareRequestId={shareRequests.cn} onServerChange={isDesktop ? undefined : () => navigate("global", globalLocale)}
          onShareConflict={(envelope, hash) => setManualShare({ envelope, hash })}><LocaleProvider locale="zh-CN">
        <CalculatorRouter initialSnapshot={initialSnapshot} active={!global && !entry.conflict && !conflictServer}
          onOpenGlobal={isDesktop ? undefined : () => navigate("global", globalLocale)} />
        </LocaleProvider></RuntimeProvider>
      </Suspense></RuntimeErrorBoundary>
    </div></SeasonThemeProvider>}
    {globalVisited && !isDesktop && <SeasonThemeProvider serverId="global" active={global}
      seasonThemeId={globalSeasonThemeId} preference={seasonPreferences.global} onSeasonThemeChange={(value) => changeSeasonTheme("global", value)}>
      <div hidden={!global} inert={!global || undefined}><RuntimeErrorBoundary locale={globalLocale}><Suspense fallback={<p role="status">{copy.loading}</p>}>
      <RuntimeProvider serverId="global" locale={globalLocale} seasonThemeId={globalSeasonThemeId} seasonPreview={isSeasonPreview(globalSeasonThemeId)} seasonThemePreference={seasonPreferences.global} onSeasonThemeChange={(value) => changeSeasonTheme("global", value)} shareRequestId={shareRequests.global}
        onLocaleChange={(locale) => navigate("global", locale, { hash: location.hash })}
        onServerChange={() => navigate("cn", "zh-CN")}
        onShareConflict={(envelope, hash) => setManualShare({ envelope, hash })}>
        <LocaleProvider locale={globalLocale}>
          <CalculatorRouter active={global && !entry.conflict && !conflictServer} />
        </LocaleProvider>
      </RuntimeProvider>
    </Suspense></RuntimeErrorBoundary></div></SeasonThemeProvider>}
  </>;
}
