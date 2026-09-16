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
}) {
  const [dark, setDark] = useState(() => readThemeSetting() === "dark");
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
        {!pageTitle && <><div aria-label="界面模式" className="view-mode-switch" role="group">
          <button
            aria-label="精简版"
            aria-pressed={viewMode === "compact"}
            onClick={() => onViewModeChange?.("compact")}
            title="精简版"
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
            title="具体版"
            type="button"
          >
            <SlidersHorizontal aria-hidden="true" size={16} weight="bold" />
            <span>具体版</span>
          </button>
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
        </button></>}
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
