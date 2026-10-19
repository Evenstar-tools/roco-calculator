import { render, screen } from "@testing-library/react";
import { beforeEach, expect, test } from "vitest";
import { AppHeader } from "../../src/components/AppHeader.jsx";
import { LocaleProvider } from "../../src/i18n/LocaleContext.jsx";
import { clearMissingUiMessages, getMissingUiMessages } from "../../src/i18n/messages.js";
import { RuntimeProvider } from "../../src/runtime/RuntimeContext.jsx";
import { getSeasonTheme, getSeasonThemeVariables, resolveSeasonThemeId } from "../../src/theme/season-themes.js";

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
  expect(getSeasonTheme("toString")).toBe(getSeasonTheme("neutral"));
});

test("seasonPreview is accepted only on exact loopback hosts and known themes", () => {
  for (const hostname of ["localhost", "127.0.0.1", "[::1]"]) {
    for (const id of ["s1", "s2", "s3", "s4"]) {
      expect(resolveSeasonThemeId({ serverId: "global", hostname, search: `?seasonPreview=${id}` })).toBe(id);
    }
  }
  for (const hostname of ["roco.example", "localhost.example", "127.0.0.1.example", "192.168.0.1", ""]) {
    expect(resolveSeasonThemeId({ serverId: "global", hostname, search: "?seasonPreview=s1" })).toBe("neutral");
    expect(resolveSeasonThemeId({ serverId: "cn", hostname, search: "?seasonPreview=s1" })).toBe("s4");
  }
  for (const id of ["neutral", "s5", "toString", "S1", ""]) {
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
])("%s labels local S1–S3 previews without inventing official translated season names", (locale, label) => {
  const view = render(header({ locale }));
  for (const id of ["s1", "s2", "s3"]) {
    view.rerender(header({ locale, id, preview: true }));
    expect(screen.getByRole("heading", { name: new RegExp(`${id.toUpperCase()} · ${label}`) })).toBeVisible();
    expect(view.container.querySelector(".app-header__season-character")).toHaveAttribute("src", getSeasonTheme(id).character.src);
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
