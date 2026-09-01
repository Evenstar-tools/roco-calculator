import {
  Lightning,
  List,
  Moon,
  SlidersHorizontal,
  Sun,
  UsersThree,
} from "@phosphor-icons/react";
import { useState } from "react";
import { readThemeSetting } from "../state/display-settings.js";

export function AppHeader({
  dataVersion,
  menuButtonRef,
  menuOpen = false,
  onMenuOpen,
  onTeamsOpen,
  onThemeChange,
  teamsButtonRef,
  viewMode = "compact",
  onViewModeChange,
}) {
  const [dark, setDark] = useState(() => readThemeSetting() === "dark");

  function toggleTheme() {
    const next = !dark;
    setDark(next);
    onThemeChange?.(next ? "dark" : "light");
  }

  return (
    <header className={`app-header app-header--${viewMode}`}>
      <div className="app-header__brand">
        <h1 aria-label="洛克计算器 · S3季中">
          <span aria-hidden="true" className="app-header__title-long">
            洛克计算器 · S3季中
          </span>
          <span aria-hidden="true" className="app-header__title-short">
            S3季中
          </span>
        </h1>
        <span className="app-header__version">{dataVersion}</span>
      </div>

      <div className="app-header__actions">
        <div aria-label="界面模式" className="view-mode-switch" role="group">
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
        </button>
        <button
          aria-label="切换主题"
          className="icon-action"
          onClick={toggleTheme}
          title="切换主题"
          type="button"
        >
          {dark ? <Moon aria-hidden="true" size={20} /> : <Sun aria-hidden="true" size={20} />}
        </button>
        <button
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
        </button>
      </div>
    </header>
  );
}
