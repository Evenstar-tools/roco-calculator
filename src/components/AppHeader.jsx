import { useLocale } from "../i18n/LocaleContext.jsx";
import { useRuntime } from "../runtime/RuntimeContext.jsx";
import {
  Lightning,
  List,
  Moon,
  SlidersHorizontal,
  Sun,
  UsersThree,
} from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { readThemeSetting } from "../state/display-settings.js";
import { Toolbox } from "./Toolbox.jsx";
import { getSeasonTheme, resolveSeasonThemeId } from "../theme/season-themes.js";

export function AppHeader({
  menuButtonRef,
  menuOpen = false,
  onMenuOpen,
  onTeamsOpen,
  onThemeChange,
  teamsButtonRef,
  viewMode = "compact",
  onViewModeChange,
  pageTitle,
  toolAction,
  toolbox,
}) {
  const { t } = useLocale();
  const { serverId, seasonThemeId, seasonPreview } = useRuntime();
  const season = getSeasonTheme(seasonThemeId ?? resolveSeasonThemeId({ serverId }));
  const previewTitle = seasonPreview && season.id !== "neutral" && !(serverId === "cn" && season.id === "s4")
    ? t("{season} · 装饰预览", { season: season.id.toUpperCase() }) : null;
  const showCnSeasonTitle = serverId === "cn";
  const [dark, setDark] = useState(() => readThemeSetting() === "dark");
  const [portrait, setPortrait] = useState(() => window.matchMedia("(max-width: 620px) and (orientation: portrait)").matches);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 620px) and (orientation: portrait)");
    const update = () => setPortrait(media.matches);
    media.addEventListener("change", update);
    update();
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    const observer = new MutationObserver(() => setDark(document.documentElement.dataset.theme === "dark"));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  function toggleTheme() {
    const next = !dark;
    setDark(next);
    onThemeChange?.(next ? "dark" : "light");
  }

  return (
    <header className={`app-header app-header--${viewMode}${pageTitle ? " app-header--tool" : ""}${previewTitle ? " app-header--season-preview" : ""}`}>
      {!pageTitle && season.scene && <div aria-hidden="true" className="app-header__season">
        <span className="app-header__season-scene" />
        {season.ornaments === "orbit-star" && <span className="app-header__season-orbit" />}
        {season.character && <img
          alt=""
          className={`app-header__season-character${season.id === "s4" ? " app-header__season-wolf" : ""}`}
          decoding="async"
          draggable="false"
          height={season.character.height}
          src={season.character.src}
          width={season.character.width}
        />}
        {season.ornaments === "orbit-star" && <span className="app-header__season-star" />}
      </div>}
      <div className="app-header__brand">
        {pageTitle ? <h1>{t("洛克计算器 · ")}<span className="app-header__season-title">{pageTitle}</span></h1> : previewTitle ? <h1 aria-label={t("洛克计算器") + " · " + previewTitle}>
          <span aria-hidden="true" className="app-header__title-long">{t("洛克计算器")} · <span className="app-header__season-title">{previewTitle}</span></span>
          <span aria-hidden="true" className="app-header__title-short"><span className="app-header__season-title">{previewTitle}</span></span>
        </h1> : !showCnSeasonTitle ? <h1 aria-label={t("洛克计算器") + " · " + t("国际服")}>
          <span aria-hidden="true" className="app-header__title-long">{t("洛克计算器")} · <span className="app-header__season-title">{t("国际服")}</span></span>
          <span aria-hidden="true" className="app-header__title-short"><span className="app-header__season-title">{t("国际服")}</span></span>
        </h1> : <h1 aria-label={t("洛克计算器 · S4「季中」")}>
          <span aria-hidden="true" className="app-header__title-long">{t("洛克计算器 · ")}<span className="app-header__season-title">{t("S4「季中」")}</span>
          </span>
          <span aria-hidden="true" className="app-header__title-short">
            <span className="app-header__season-title">{t("S4「季中」")}</span>
          </span>
        </h1>}
      </div>

      <div className="app-header__actions">
        {!pageTitle && <><div aria-label={t("界面模式")} className="view-mode-switch" data-portrait={portrait || undefined} role="group">
          {portrait ? <button
            aria-label={t("当前{current}，切换到{next}", { current: t(viewMode === "compact" ? "精简版" : "具体版"), next: t(viewMode === "compact" ? "具体版" : "精简版") })}
            data-guide-target="detailed-mode"
            onClick={() => onViewModeChange?.(viewMode === "compact" ? "detailed" : "compact")}
            title={t("Tab 短按切换，长按临时切换，松开返回")} type="button"
            style={{ display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "center", width: 42, height: 38, minHeight: 38, padding: 3, gap: 2 }}>
            {viewMode === "compact" ? <Lightning aria-hidden="true" size={12} weight="fill" /> : <SlidersHorizontal aria-hidden="true" size={12} weight="bold" />}
            <span style={{ display: "block", fontSize: 10, lineHeight: 1 }}>{t(viewMode === "compact" ? "精简" : "具体")}</span>
          </button> : <>
          <button
            aria-label={t("精简版")}
            aria-pressed={viewMode === "compact"}
            onClick={() => onViewModeChange?.("compact")}
            title={t("精简版 · Tab 短按切换，长按临时切换")}
            type="button"
          >
            <Lightning aria-hidden="true" size={16} weight="fill" />
            <span>{t("精简版")}</span>
          </button>
          <button
            aria-label={t("具体版")}
            aria-pressed={viewMode === "detailed"}
            data-guide-target="detailed-mode"
            onClick={() => onViewModeChange?.("detailed")}
            title={t("具体版 · Tab 短按切换，长按临时切换")}
            type="button"
          >
            <SlidersHorizontal aria-hidden="true" size={16} weight="bold" />
            <span>{t("具体版")}</span>
          </button>
          </>}
        </div>
        <button
          aria-label={t("打开队伍")}
          className="team-action"
          onClick={onTeamsOpen}
          ref={teamsButtonRef}
          title={t("队伍")}
          type="button"
        >
          <UsersThree aria-hidden="true" size={19} weight="fill" />
          <span>{t("队伍")}</span>
        </button>{toolbox ? <Toolbox {...toolbox} /> : null}</>}
        <button
          aria-label={t("切换主题")}
          className="icon-action"
          onClick={toggleTheme}
          title={t("切换主题")}
          type="button"
        >
          {dark ? <Moon aria-hidden="true" size={20} /> : <Sun aria-hidden="true" size={20} />}
        </button>
        {toolAction}
        {!pageTitle && <button
          aria-controls="app-menu"
          aria-expanded={menuOpen}
          aria-label={t(menuOpen ? "关闭菜单" : "打开菜单")}
          className="icon-action"
          onClick={onMenuOpen}
          ref={menuButtonRef}
          title={t("菜单")}
          type="button"
        >
          <List aria-hidden="true" size={24} weight="bold" />
        </button>}
      </div>
    </header>
  );
}
