import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { DisplaySettingsDialog } from "../../src/components/DisplaySettingsDialog.jsx";
import { LocaleProvider } from "../../src/i18n/LocaleContext.jsx";
import { clearMissingUiMessages, getMissingUiMessages } from "../../src/i18n/messages.js";
import { RuntimeProvider } from "../../src/runtime/RuntimeContext.jsx";

beforeEach(() => clearMissingUiMessages());

test.each([
  ["cn", "zh-CN", "赛季主题", null],
  ["global", "zh-CN", "赛季主题", "默认（无赛季装饰）"],
  ["global", "en", "Theme", "Default (no season artwork)"],
  ["global", "ja", "テーマ", "標準（シーズン装飾なし）"],
])("%s %s reuses display settings with original season names and localized controls", (serverId, locale, label, fallback) => {
  const change = vi.fn();
  const ui = (preview = false, preference = "s3") => <RuntimeProvider serverId={serverId} locale={locale}
    seasonThemeId="s1" seasonThemePreference={preference} seasonPreview={preview} onSeasonThemeChange={change}>
    <LocaleProvider locale={locale}><DisplaySettingsDialog open /></LocaleProvider>
  </RuntimeProvider>;
  const view = render(ui());
  const selector = screen.getByRole("combobox", { name: label });
  expect(selector).toHaveValue("s3");
  expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
    ...(fallback ? [fallback] : []), "S1 暗夜拾光", "S2 狂欢怪谈", "S3 铅字幻梦", "S4 月涌狂想",
  ]);
  fireEvent.change(selector, { target: { value: "s2" } });
  expect(change).toHaveBeenLastCalledWith("s2");
  view.rerender(ui(true));
  expect(selector).toHaveValue("preview");
  const preview = screen.getByRole("option", { name: /S1 暗夜拾光.*(?:预览|preview|プレビュー)/u });
  expect(preview).toBeDisabled();
  fireEvent.change(selector, { target: { value: "s1" } });
  expect(change).toHaveBeenLastCalledWith("s1");
  if (serverId !== "cn") {
    fireEvent.change(selector, { target: { value: "default" } });
    expect(change).toHaveBeenLastCalledWith("default");
  }
  view.rerender(ui(false, "default"));
  expect(selector).toHaveValue(serverId === "cn" ? "s4" : "default");
  const randomLabel = { "zh-CN": "每次进入随机主题", en: "Random theme on each visit", ja: "開くたびにテーマをランダムに選ぶ" }[locale];
  const random = screen.getByRole("button", { name: randomLabel });
  expect(random).toHaveAttribute("aria-pressed", "false");
  expect(random).toHaveAttribute("title", randomLabel);
  fireEvent.click(random);
  expect(change).toHaveBeenLastCalledWith("random");
  view.rerender(ui(false, "random"));
  expect(random).toHaveAttribute("aria-pressed", "true");
  expect(selector).toHaveValue("random");
  expect(selector.selectedOptions[0]).toBeDisabled();
  expect(selector.selectedOptions[0]).toHaveTextContent({ "zh-CN": "随机 · S1", en: "Random · S1", ja: "ランダム · S1" }[locale]);
  // The transient S1 draw must remain selectable as a fixed theme.
  fireEvent.change(selector, { target: { value: "s1" } });
  expect(change).toHaveBeenLastCalledWith("s1");
  view.rerender(ui(false, "s1"));
  expect(random).toHaveAttribute("aria-pressed", "false");
  view.rerender(ui(true, "random"));
  expect(selector).toHaveValue("preview");
  fireEvent.click(random);
  expect(change).toHaveBeenLastCalledWith("random");
  expect(getMissingUiMessages()).toEqual([]);
});
