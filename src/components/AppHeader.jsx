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
  const [dark, setDark] = useState(() => readThemeSetting() === "dark");
  const [portrait, setPortrait] = useState(() => window.matchMedia("(max-width: 620px) and (orientation: portrait)").matches);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 620px) and (orientation: portrait)");
    const update = () => setPortrait(media.matches);
    media.addEventListener("change", update);
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
    <header className={`app-header app-header--${viewMode}${pageTitle ? " app-header--tool" : ""}`}>
      {!pageTitle && <div aria-hidden="true" className="app-header__season">
        <span className="app-header__season-scene" />
        <span className="app-header__season-orbit" />
        <img
          alt=""
          className="app-header__season-wolf"
          decoding="async"
          draggable="false"
          height="406"
          src="/assets/season/s4-silver-wolf.webp"
          width="486"
        />
        <span className="app-header__season-star" />
      </div>}
      <div className="app-header__brand">
        {pageTitle ? <h1>洛克计算器 · <span className="app-header__season-title">{pageTitle}</span></h1> : <h1 aria-label="洛克计算器 · S4「月涌狂想」">
          <span aria-hidden="true" className="app-header__title-long">
            洛克计算器 · <span className="app-header__season-title">S4「月涌狂想」</span>
          </span>
          <span aria-hidden="true" className="app-header__title-short">
            <span className="app-header__season-title">S4「月涌狂想」</span>
          </span>
        </h1>}
      </div>

      <div className="app-header__actions">
        {!pageTitle && <><div aria-label="界面模式" className="view-mode-switch" data-portrait={portrait || undefined} role="group">
          {portrait ? <button
            aria-label={`当前${viewMode === "compact" ? "精简版" : "具体版"}，切换到${viewMode === "compact" ? "具体版" : "精简版"}`}
            data-guide-target="detailed-mode"
            onClick={() => onViewModeChange?.(viewMode === "compact" ? "detailed" : "compact")}
            title="Tab 短按切换，长按临时切换，松开返回" type="button"
            style={{ display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "center", width: 42, height: 38, minHeight: 38, padding: 3, gap: 2 }}>
            {viewMode === "compact" ? <Lightning aria-hidden="true" size={12} weight="fill" /> : <SlidersHorizontal aria-hidden="true" size={12} weight="bold" />}
            <span style={{ display: "block", fontSize: 10, lineHeight: 1 }}>{viewMode === "compact" ? "精简" : "具体"}</span>
          </button> : <>
          <button
            aria-label="精简版"
            aria-pressed={viewMode === "compact"}
            onClick={() => onViewModeChange?.("compact")}
            title="精简版 · Tab 短按切换，长按临时切换"
            type="button"
          >
            <Lightning aria-hidden="true" size={16} weight="fill" />
            <span>精简版</span>
          </button>
          <button
            aria-label="具体版"
            aria-pressed={viewMode === "detailed"}
            data-guide-target="detailed-mode"
            onClick={() => onViewModeChange?.("detailed")}
            title="具体版 · Tab 短按切换，长按临时切换"
            type="button"
          >
            <SlidersHorizontal aria-hidden="true" size={16} weight="bold" />
            <span>具体版</span>
          </button>
          </>}
        </div>
        <button
          aria-label="打开队伍"
          className="team-action"
          onClick={onTeamsOpen}
          ref={teamsButtonRef}
          title="队伍"
          type="button"
        >
          <UsersThree aria-hidden="true" size={19} weight="fill" />
          <span>队伍</span>
        </button>{toolbox ? <Toolbox {...toolbox} /> : null}</>}
        <button
          aria-label="切换主题"
          className="icon-action"
          onClick={toggleTheme}
          title="切换主题"
          type="button"
        >
          {dark ? <Moon aria-hidden="true" size={20} /> : <Sun aria-hidden="true" size={20} />}
        </button>
        {toolAction}
        {!pageTitle && <button
          aria-controls="app-menu"
          aria-expanded={menuOpen}
          aria-label={menuOpen ? "关闭菜单" : "打开菜单"}
          className="icon-action"
          onClick={onMenuOpen}
          ref={menuButtonRef}
          title="菜单"
          type="button"
        >
          <List aria-hidden="true" size={24} weight="bold" />
        </button>}
      </div>
    </header>
  );
}
