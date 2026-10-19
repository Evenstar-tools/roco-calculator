import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { useState } from "react";
import { AppHeader } from "../../src/components/AppHeader.jsx";
import { DisplaySettingsDialog } from "../../src/components/DisplaySettingsDialog.jsx";
import { SeasonThemeProvider } from "../../src/theme/SeasonThemeContext.jsx";
import { SEASON_THEME_STORAGE_KEY } from "../../src/state/season-theme.js";
import { getSeasonTheme } from "../../src/theme/season-themes.js";

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.removeItem(SEASON_THEME_STORAGE_KEY);
  delete document.documentElement.dataset.season;
  delete document.documentElement.dataset.theme;
  document.documentElement.style.removeProperty("--season-scene-image");
  document.documentElement.style.removeProperty("--season-character-image");
});

function ThemeSettings() {
  const [value, setValue] = useState("95");
  return <SeasonThemeProvider>
    <AppHeader />
    <DisplaySettingsDialog open />
    <input aria-label="当前技能威力" value={value} onChange={(event) => setValue(event.target.value)} />
  </SeasonThemeProvider>;
}

test("显示设置切换四季原图，保留季中标题、亮暗状态和已编辑的配置", () => {
  localStorage.removeItem(SEASON_THEME_STORAGE_KEY);
  document.documentElement.dataset.theme = "dark";
  const view = render(<ThemeSettings />);
  const selector = screen.getByRole("combobox", { name: "赛季主题" });
  expect(selector).toHaveValue("s4");
  expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
    "S1 暗夜拾光", "S2 狂欢怪谈", "S3 铅字幻梦", "S4 月涌狂想",
  ]);
  fireEvent.change(screen.getByRole("textbox", { name: "当前技能威力" }), { target: { value: "112" } });
  for (const id of ["s1", "s2", "s3", "s4"]) {
    fireEvent.change(selector, { target: { value: id } });
    const theme = getSeasonTheme(id);
    expect(document.documentElement).toHaveAttribute("data-season", id);
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(document.documentElement.style.getPropertyValue("--season-scene-image")).toBe(`url("${theme.scene}")`);
    expect(view.container.querySelector(".app-header__season-character")).toHaveAttribute("src", theme.character.src);
    expect(screen.getByRole("heading", { name: "洛克计算器 · S4「季中」" })).toBeVisible();
    expect(screen.getByRole("textbox", { name: "当前技能威力" })).toHaveValue("112");
    expect(Boolean(view.container.querySelector(".app-header__season-orbit"))).toBe(id === "s4");
    expect(localStorage.getItem(SEASON_THEME_STORAGE_KEY)).toBe(id);
  }
  fireEvent.change(selector, { target: { value: "s2" } });
  view.unmount();
  render(<ThemeSettings />);
  expect(screen.getByRole("combobox", { name: "赛季主题" })).toHaveValue("s2");
  expect(document.documentElement).toHaveAttribute("data-season", "s2");
  fireEvent.change(screen.getByRole("combobox", { name: "赛季主题" }), { target: { value: "s4" } });
  expect(document.documentElement).toHaveAttribute("data-season", "s4");
});

test("随机模式仅在进入或点击时抽取，保存模式而非本次主题，手动固定当前主题即可退出", () => {
  const random = vi.spyOn(Math, "random").mockReturnValueOnce(0).mockReturnValueOnce(0.25).mockReturnValueOnce(0.999);
  const view = render(<ThemeSettings />);
  const shuffle = screen.getByRole("button", { name: "每次进入随机主题" });
  expect(shuffle).toHaveAttribute("aria-pressed", "false");
  fireEvent.click(shuffle);
  expect(shuffle).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("combobox", { name: "赛季主题" })).toHaveValue("random");
  expect(localStorage.getItem(SEASON_THEME_STORAGE_KEY)).toBe("random");
  expect(document.documentElement).toHaveAttribute("data-season", "s1");
  fireEvent.change(screen.getByRole("textbox", { name: "当前技能威力" }), { target: { value: "112" } });
  expect(document.documentElement).toHaveAttribute("data-season", "s1");
  expect(random).toHaveBeenCalledTimes(1);
  fireEvent.click(shuffle);
  expect(document.documentElement).toHaveAttribute("data-season", "s2");
  view.unmount();
  const nextEntry = render(<ThemeSettings />);
  expect(document.documentElement).toHaveAttribute("data-season", "s4");
  expect(screen.getByRole("button", { name: "每次进入随机主题" })).toHaveAttribute("aria-pressed", "true");
  expect(random).toHaveBeenCalledTimes(3);
  fireEvent.change(screen.getByRole("combobox", { name: "赛季主题" }), { target: { value: "s4" } });
  expect(screen.getByRole("button", { name: "每次进入随机主题" })).toHaveAttribute("aria-pressed", "false");
  expect(localStorage.getItem(SEASON_THEME_STORAGE_KEY)).toBe("s4");
  nextEntry.unmount();
  render(<ThemeSettings />);
  expect(document.documentElement).toHaveAttribute("data-season", "s4");
  expect(random).toHaveBeenCalledTimes(3);
});
