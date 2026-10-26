import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { StrictMode, useState } from "react";
import { AppHeader } from "../../src/components/AppHeader.jsx";
import { DisplaySettingsDialog } from "../../src/components/DisplaySettingsDialog.jsx";
import { SeasonThemeProvider, useSeasonTheme } from "../../src/theme/SeasonThemeContext.jsx";
import { CLASSIC_CALCULATOR_COLORS_STORAGE_KEY, SEASON_THEME_LAST_RANDOM_STORAGE_KEY, SEASON_THEME_STORAGE_KEY } from "../../src/state/season-theme.js";
import { serverStorageKey } from "../../src/state/server-storage.js";
import { getSeasonTheme, getSeasonThemeVariables, resolveSeasonThemeId } from "../../src/theme/season-themes.js";
import { LocaleProvider } from "../../src/i18n/LocaleContext.jsx";
import { clearMissingUiMessages, getMissingUiMessages } from "../../src/i18n/messages.js";
import { RuntimeProvider } from "../../src/runtime/RuntimeContext.jsx";

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  localStorage.removeItem(serverStorageKey("cn", SEASON_THEME_STORAGE_KEY));
  localStorage.removeItem(serverStorageKey("cn", SEASON_THEME_LAST_RANDOM_STORAGE_KEY));
  localStorage.removeItem(serverStorageKey("cn", CLASSIC_CALCULATOR_COLORS_STORAGE_KEY));
  delete document.documentElement.dataset.classicCalculatorColors;
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

test("显示设置切换五季装饰，保留季中标题、亮暗状态和已编辑的配置", () => {
  localStorage.removeItem(serverStorageKey("cn", SEASON_THEME_STORAGE_KEY));
  document.documentElement.dataset.theme = "dark";
  const view = render(<ThemeSettings />);
  const selector = screen.getByRole("combobox", { name: "赛季主题" });
  expect(selector).toHaveValue("s4");
  expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
    "S1 暗夜拾光", "S2 狂欢怪谈", "S3 铅字幻梦", "S4 月涌狂想", "S5 圣龙宝藏",
  ]);
  fireEvent.change(screen.getByRole("textbox", { name: "当前技能威力" }), { target: { value: "112" } });
  for (const id of ["s1", "s2", "s3", "s4", "s5"]) {
    fireEvent.change(selector, { target: { value: id } });
    const theme = getSeasonTheme(id);
    expect(document.documentElement).toHaveAttribute("data-season", id);
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(document.documentElement.style.getPropertyValue("--season-scene-image")).toBe(`url("${theme.scene}")`);
    if (theme.character) {
      expect(view.container.querySelector(".app-header__season-character")).toHaveAttribute("src", theme.character.src);
    } else {
      expect(view.container.querySelector(".app-header__season-character")).not.toBeInTheDocument();
      expect(document.documentElement.style.getPropertyValue("--season-character-image")).toBe("none");
    }
    expect(screen.getByRole("heading", { name: "洛克计算器 · S4「季中」" })).toBeVisible();
    expect(screen.getByRole("textbox", { name: "当前技能威力" })).toHaveValue("112");
    expect(Boolean(view.container.querySelector(".app-header__season-orbit"))).toBe(id === "s4");
    expect(localStorage.getItem(serverStorageKey("cn", SEASON_THEME_STORAGE_KEY))).toBe(id);
  }
  fireEvent.change(selector, { target: { value: "s2" } });
  view.unmount();
  render(<ThemeSettings />);
  expect(screen.getByRole("combobox", { name: "赛季主题" })).toHaveValue("s2");
  expect(document.documentElement).toHaveAttribute("data-season", "s2");
  fireEvent.change(screen.getByRole("combobox", { name: "赛季主题" }), { target: { value: "s4" } });
  expect(document.documentElement).toHaveAttribute("data-season", "s4");
});

test("随机按钮再次点击关闭并固定当前主题，重新进入保持固定", () => {
  const random = vi.spyOn(Math, "random").mockReturnValue(0);
  const view = render(<ThemeSettings />);
  const shuffle = screen.getByRole("button", { name: "每次进入随机主题" });
  expect(shuffle).toHaveAttribute("aria-pressed", "false");
  fireEvent.click(shuffle);
  expect(shuffle).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("combobox", { name: "赛季主题" })).toHaveValue("random");
  expect(localStorage.getItem(serverStorageKey("cn", SEASON_THEME_STORAGE_KEY))).toBe("random");
  expect(document.documentElement).toHaveAttribute("data-season", "s1");
  fireEvent.change(screen.getByRole("textbox", { name: "当前技能威力" }), { target: { value: "112" } });
  expect(document.documentElement).toHaveAttribute("data-season", "s1");
  expect(random).toHaveBeenCalledTimes(1);
  fireEvent.click(shuffle);
  expect(shuffle).toHaveAttribute("aria-pressed", "false");
  expect(document.documentElement).toHaveAttribute("data-season", "s1");
  expect(localStorage.getItem(serverStorageKey("cn", SEASON_THEME_STORAGE_KEY))).toBe("s1");
  view.unmount();
  render(<ThemeSettings />);
  expect(document.documentElement).toHaveAttribute("data-season", "s1");
  expect(screen.getByRole("button", { name: "每次进入随机主题" })).toHaveAttribute("aria-pressed", "false");
  expect(random).toHaveBeenCalledTimes(1);
});

test("从固定主题开启随机时必定切到其他主题，仍可手动固定本次抽中的同季", () => {
  localStorage.setItem(serverStorageKey("cn", SEASON_THEME_STORAGE_KEY), "s1");
  vi.spyOn(Math, "random").mockReturnValue(0);
  render(<ThemeSettings />);
  const shuffle = screen.getByRole("button", { name: "每次进入随机主题" });
  fireEvent.click(shuffle);
  expect(document.documentElement.dataset.season).not.toBe("s1");
  const drawn = document.documentElement.dataset.season;
  fireEvent.change(screen.getByRole("combobox", { name: "赛季主题" }), { target: { value: drawn } });
  expect(shuffle).toHaveAttribute("aria-pressed", "false");
  expect(document.documentElement.dataset.season).toBe(drawn);
  expect(localStorage.getItem(serverStorageKey("cn", SEASON_THEME_STORAGE_KEY))).toBe(drawn);
});

test("随机模式重新进入时避开上一页的主题，重绘和亮暗切换保持本页抽取", () => {
  localStorage.setItem(serverStorageKey("cn", SEASON_THEME_STORAGE_KEY), "random");
  vi.spyOn(Math, "random").mockReturnValue(0);
  let view = render(<ThemeSettings />);
  let previous = document.documentElement.dataset.season;
  for (let visit = 0; visit < 5; visit += 1) {
    document.documentElement.dataset.theme = visit % 2 ? "dark" : "light";
    view.rerender(<ThemeSettings />);
    expect(document.documentElement.dataset.season).toBe(previous);
    fireEvent.change(screen.getByRole("textbox", { name: "当前技能威力" }), { target: { value: String(100 + visit) } });
    expect(document.documentElement.dataset.season).toBe(previous);
    view.unmount();
    view = render(<ThemeSettings />);
    expect(document.documentElement.dataset.season).not.toBe(previous);
    expect(localStorage.getItem(serverStorageKey("cn", SEASON_THEME_STORAGE_KEY))).toBe("random");
    previous = document.documentElement.dataset.season;
  }
});

test("StrictMode 初始化不提前写随机记录，提交后保存显示主题且开关不会被重复执行", () => {
  localStorage.setItem(serverStorageKey("cn", SEASON_THEME_STORAGE_KEY), "random");
  localStorage.setItem(serverStorageKey("cn", SEASON_THEME_LAST_RANDOM_STORAGE_KEY), "s1");
  const observedPreviousThemes = [];
  vi.spyOn(Math, "random").mockImplementation(() => {
    observedPreviousThemes.push(localStorage.getItem(serverStorageKey("cn", SEASON_THEME_LAST_RANDOM_STORAGE_KEY)));
    return 0;
  });
  const writes = vi.spyOn(Storage.prototype, "setItem");
  render(<StrictMode><ThemeSettings /></StrictMode>);
  expect(observedPreviousThemes.length).toBeGreaterThan(0);
  expect(observedPreviousThemes.every((id) => id === "s1")).toBe(true);
  expect(document.documentElement.dataset.season).toBe("s2");
  expect(localStorage.getItem(serverStorageKey("cn", SEASON_THEME_LAST_RANDOM_STORAGE_KEY))).toBe("s2");
  expect(writes.mock.calls.filter(([key]) => key === serverStorageKey("cn", SEASON_THEME_LAST_RANDOM_STORAGE_KEY))
    .every(([, id]) => id === "s2")).toBe(true);
  const shuffle = screen.getByRole("button", { name: "每次进入随机主题" });
  fireEvent.click(shuffle);
  expect(shuffle).toHaveAttribute("aria-pressed", "false");
  expect(document.documentElement.dataset.season).toBe("s2");
  fireEvent.click(shuffle);
  expect(shuffle).toHaveAttribute("aria-pressed", "true");
  expect(document.documentElement.dataset.season).toBe("s1");
  expect(localStorage.getItem(serverStorageKey("cn", SEASON_THEME_LAST_RANDOM_STORAGE_KEY))).toBe("s1");
});

test("存储读写均失败时按钮仍能开启、关闭和手动固定主题", () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
  vi.spyOn(Math, "random").mockReturnValue(0.999);
  render(<ThemeSettings />);
  expect(document.documentElement.dataset.season).toBe("s4");
  const shuffle = screen.getByRole("button", { name: "每次进入随机主题" });
  fireEvent.click(shuffle);
  expect(document.documentElement.dataset.season).toBe("s5");
  fireEvent.click(shuffle);
  expect(shuffle).toHaveAttribute("aria-pressed", "false");
  expect(document.documentElement.dataset.season).toBe("s5");
  fireEvent.change(screen.getByRole("combobox", { name: "赛季主题" }), { target: { value: "s2" } });
  expect(document.documentElement.dataset.season).toBe("s2");
  fireEvent.click(screen.getByRole("checkbox", { name: "计算界面保持经典配色" }));
  expect(document.documentElement).toHaveAttribute("data-classic-calculator-colors", "true");
});

test("经典配色可独立记忆，保留赛季背景、随机模式、亮暗和输入", () => {
  localStorage.setItem(serverStorageKey("cn", SEASON_THEME_STORAGE_KEY), "s5");
  document.documentElement.dataset.theme = "dark";
  const random = vi.spyOn(Math, "random").mockReturnValue(0);
  const view = render(<ThemeSettings />);
  const checkbox = screen.getByRole("checkbox", { name: "计算界面保持经典配色" });
  expect(checkbox).not.toBeChecked();
  fireEvent.click(checkbox);
  expect(checkbox).toBeChecked();
  expect(document.documentElement).toHaveAttribute("data-classic-calculator-colors", "true");
  expect(document.documentElement).toHaveAttribute("data-season", "s5");
  expect(localStorage.getItem(serverStorageKey("cn", CLASSIC_CALCULATOR_COLORS_STORAGE_KEY))).toBe("1");
  fireEvent.change(screen.getByRole("textbox", { name: "当前技能威力" }), { target: { value: "112" } });
  fireEvent.change(screen.getByRole("combobox", { name: "赛季主题" }), { target: { value: "s2" } });
  expect(checkbox).toBeChecked();
  expect(document.documentElement).toHaveAttribute("data-season", "s2");
  fireEvent.click(screen.getByRole("button", { name: "每次进入随机主题" }));
  const drawn = document.documentElement.dataset.season;
  fireEvent.click(checkbox);
  expect(localStorage.getItem(serverStorageKey("cn", CLASSIC_CALCULATOR_COLORS_STORAGE_KEY))).toBe("0");
  expect(document.documentElement).toHaveAttribute("data-classic-calculator-colors", "false");
  fireEvent.click(checkbox);
  expect(document.documentElement.dataset.season).toBe(drawn);
  expect(localStorage.getItem(serverStorageKey("cn", SEASON_THEME_STORAGE_KEY))).toBe("random");
  expect(random).toHaveBeenCalledTimes(1);
  expect(document.documentElement).toHaveAttribute("data-theme", "dark");
  expect(screen.getByRole("textbox", { name: "当前技能威力" })).toHaveValue("112");
  view.unmount();
  render(<ThemeSettings />);
  expect(screen.getByRole("checkbox", { name: "计算界面保持经典配色" })).toBeChecked();
  expect(document.documentElement).toHaveAttribute("data-classic-calculator-colors", "true");
});

beforeEach(() => clearMissingUiMessages());

test("unconfirmed Global has no season art; CN retains S4", () => {
  expect(resolveSeasonThemeId({ serverId: "global" })).toBe("neutral");
  expect(resolveSeasonThemeId({ serverId: "cn" })).toBe("s4");
  expect(getSeasonThemeVariables("neutral")).toEqual({
    "--season-scene-image": "none", "--season-character-image": "none",
  });
  expect(getSeasonThemeVariables("s4")).toEqual({
    "--season-scene-image": 'url("/assets/season/s4-moon-night.webp")',
    "--season-character-image": 'url("/assets/season/s4-silver-wolf.webp")',
  });
  expect(getSeasonThemeVariables("s5")).toEqual({
    "--season-scene-image": 'url("/assets/season/s5-dragon-treasure.webp")',
    "--season-character-image": "none",
  });
  expect(getSeasonTheme("toString")).toBe(getSeasonTheme("neutral"));
});

test("seasonPreview is accepted only on exact loopback hosts and known themes", () => {
  for (const hostname of ["localhost", "127.0.0.1", "[::1]"]) {
    for (const id of ["s1", "s2", "s3", "s4", "s5"]) {
      expect(resolveSeasonThemeId({ serverId: "global", hostname, search: `?seasonPreview=${id}` })).toBe(id);
    }
  }
  for (const hostname of ["roco.example", "localhost.example", "127.0.0.1.example", "192.168.0.1", ""]) {
    expect(resolveSeasonThemeId({ serverId: "global", hostname, search: "?seasonPreview=s1" })).toBe("neutral");
    expect(resolveSeasonThemeId({ serverId: "cn", hostname, search: "?seasonPreview=s1" })).toBe("s4");
  }
  for (const id of ["neutral", "unknown-season", "toString", "S1", ""]) {
    expect(resolveSeasonThemeId({ serverId: "global", hostname: "localhost", search: `?seasonPreview=${id}` })).toBe("neutral");
  }
});

const header = ({ locale = "en", id = "neutral", preview = false, serverId = "global" } = {}) => (
  <RuntimeProvider serverId={serverId} locale={locale} seasonThemeId={id} seasonPreview={preview}>
    <LocaleProvider locale={locale}><AppHeader /></LocaleProvider>
  </RuntimeProvider>
);

test.each([
  ["zh-CN", "装饰预览"], ["en", "Theme preview"], ["ja", "装飾プレビュー"],
])("%s labels local season previews without inventing official translated season names", (locale, label) => {
  const view = render(header({ locale }));
  for (const id of ["s1", "s2", "s3", "s5"]) {
    view.rerender(header({ locale, id, preview: true }));
    expect(screen.getByRole("heading", { name: new RegExp(`${id.toUpperCase()} · ${label}`) })).toBeVisible();
    const character = getSeasonTheme(id).character;
    if (character) expect(view.container.querySelector(".app-header__season-character")).toHaveAttribute("src", character.src);
    else expect(view.container.querySelector(".app-header__season-character")).not.toBeInTheDocument();
    expect(view.container.querySelector(".app-header__season-orbit")).not.toBeInTheDocument();
    expect(view.container.querySelector(".app-header__season-star")).not.toBeInTheDocument();
    expect(view.container.querySelector(".app-header__season-wolf")).not.toBeInTheDocument();
  }
  view.rerender(header({ locale }));
  expect(view.container.querySelector(".app-header__season")).not.toBeInTheDocument();
  expect(getMissingUiMessages()).toEqual([]);
});

test("S4 keeps the original short title, character dimensions and orbit decoration", () => {
  const { container } = render(header({ locale: "zh-CN", id: "s4", serverId: "cn" }));
  expect(container.querySelector(".app-header__title-short")).toHaveTextContent("S4「季中」");
  expect(container.querySelector(".app-header__season-wolf")).toHaveAttribute("src", "/assets/season/s4-silver-wolf.webp");
  expect(container.querySelector(".app-header__season-wolf")).toHaveAttribute("width", "486");
  expect(container.querySelector(".app-header__season-wolf")).toHaveAttribute("height", "406");
  expect(container.querySelector(".app-header__season-orbit")).toBeInTheDocument();
  expect(container.querySelector(".app-header__season-star")).toBeInTheDocument();
});

test("Global S4 preview remains explicitly a decoration preview", () => {
  render(header({ id: "s4", preview: true }));
  expect(screen.getByRole("heading", { name: "Roco Calculator · S4 · Theme preview" })).toBeVisible();
  expect(screen.queryByText("S4 Midseason")).not.toBeInTheDocument();
});

function ClassicProbe({ name }) {
  const { classicCalculatorColorsEnabled, onClassicCalculatorColorsChange } = useSeasonTheme();
  return <button aria-label={name} aria-pressed={classicCalculatorColorsEnabled}
    onClick={() => onClassicCalculatorColorsChange(!classicCalculatorColorsEnabled)}>{name}</button>;
}

test("inactive server themes cannot overwrite the active page and classic colors stay independent", () => {
  const workspaces = (activeServer, locale = "en") => <>
    <SeasonThemeProvider serverId="cn" active={activeServer === "cn"} seasonThemeId="s2" preference="s2">
      <ClassicProbe name="CN colors" />
    </SeasonThemeProvider>
    <SeasonThemeProvider serverId="global" active={activeServer === "global"} seasonThemeId="neutral" preference="default">
      <div lang={locale}><ClassicProbe name="Global colors" /></div>
    </SeasonThemeProvider>
  </>;
  const view = render(workspaces("cn"));
  expect(document.documentElement.dataset.season).toBe("s2");
  fireEvent.click(screen.getByRole("button", { name: "CN colors" }));
  expect(document.documentElement.dataset.classicCalculatorColors).toBe("true");
  view.rerender(workspaces("global"));
  expect(document.documentElement.dataset.season).toBe("neutral");
  expect(document.documentElement.dataset.classicCalculatorColors).toBe("false");
  fireEvent.click(screen.getByRole("button", { name: "Global colors" }));
  view.rerender(workspaces("global", "ja"));
  expect(screen.getByRole("button", { name: "Global colors" })).toHaveAttribute("aria-pressed", "true");
  expect(document.documentElement.dataset.season).toBe("neutral");
  fireEvent.click(screen.getByRole("button", { name: "Global colors" }));
  view.rerender(workspaces("cn"));
  expect(document.documentElement.dataset.season).toBe("s2");
  expect(document.documentElement.dataset.classicCalculatorColors).toBe("true");
  expect(localStorage.getItem(serverStorageKey("cn", CLASSIC_CALCULATOR_COLORS_STORAGE_KEY))).toBe("1");
  expect(localStorage.getItem(serverStorageKey("global", CLASSIC_CALCULATOR_COLORS_STORAGE_KEY))).toBe("0");
});
