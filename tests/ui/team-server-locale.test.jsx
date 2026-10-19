import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { LocaleProvider } from "../../src/i18n/LocaleContext.jsx";
import { getMissingUiMessages, clearMissingUiMessages } from "../../src/i18n/messages.js";
import { RuntimeProvider } from "../../src/runtime/RuntimeContext.jsx";
import { TeamDrawer } from "../../src/components/TeamDrawer.jsx";
import { ConfigLibraryDialog } from "../../src/components/ConfigLibraryDialog.jsx";
import { TeamExchange } from "../../src/components/TeamExchange.jsx";
import { FloatingUndoButton } from "../../src/components/FloatingUndoButton.jsx";
import { useConfigLibraryFlow } from "../../src/hooks/useConfigLibraryFlow.js";
import { parseTeamDraft, serializeTeamDraft } from "../../src/state/team-draft-exchange.js";
import mapping from "../../public/data/lineup-code-map.json";

const snapshot = { meta: { serverId: "global", id: null, rulesVersion: null }, spirits: [], skills: [], traits: [], learnsets: [] };
const teamsState = { activeTeamId: "draft", teams: [{ id: "draft", name: "Local draft", members: Array(6).fill(null) }] };
function wrapper(locale = "en", serverId = "global") {
  return function Wrapper({ children }) { return <RuntimeProvider serverId={serverId} locale={locale}><LocaleProvider locale={locale}>{children}</LocaleProvider></RuntimeProvider>; };
}
beforeEach(() => { localStorage.clear(); clearMissingUiMessages(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); history.replaceState({}, "", "/"); });

test.each(["zh-CN", "en", "ja"])("original Global team UI translates and gates unverified analysis (%s)", (locale) => {
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  const { container } = render(<><TeamDrawer open teamsState={teamsState} snapshot={snapshot} onClose={vi.fn()} spiritChoices={[]} /><FloatingUndoButton /></>, { wrapper: wrapper(locale) });
  const tabs = container.querySelectorAll(".team-drawer__pane-tabs button");
  expect(tabs[0]).toBeEnabled();
  expect(tabs[1]).toBeDisabled();
  expect(tabs[2]).toBeDisabled();
  expect(container.querySelector('.team-workbench__member-tabs button:last-child')).toBeDisabled();
  expect(container.textContent).not.toContain("Translation unavailable");
  expect(container.textContent).not.toContain("翻訳未対応");
  expect(getMissingUiMessages()).toEqual([]);
  expect(fetch).not.toHaveBeenCalled();
});

test.each(["en", "ja"])("Global draft import uses a translated tool format without fetching CN native mappings (%s)", (locale) => {
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  render(<TeamExchange mode="import" snapshot={snapshot} onCancel={vi.fn()} />, { wrapper: wrapper(locale) });
  if (locale === "en") expect(screen.getByRole("region").textContent).not.toMatch(/[\u4e00-\u9fff]/u);
  expect(screen.getByRole("textbox")).toBeVisible();
  expect(fetch).not.toHaveBeenCalled();
  expect(getMissingUiMessages()).toEqual([]);
});

test("CN path loads the actual native mapping from an absolute data URL", async () => {
  history.replaceState({}, "", "/cn/");
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => mapping });
  vi.stubGlobal("fetch", fetch);
  render(<TeamExchange mode="import" snapshot={{ spirits: [], skills: [] }} onCancel={vi.fn()} />, { wrapper: wrapper("zh-CN", "cn") });
  await screen.findByRole("button", { name: "解析阵容" });
  expect(fetch).toHaveBeenCalledWith("/data/lineup-code-map.json");
});

test.each([["en", "roco-calculator-setups-global-", "Setups exported: 0 · Favorites: 1"], ["ja", "ロコ計算機-お気に入り設定-global-", "設定 0 件とお気に入り 1 件をエクスポートしました"]])("Global export file and toast use the selected locale (%s)", async (locale, prefix, message) => {
  const share = vi.fn().mockResolvedValue(undefined), onToast = vi.fn();
  vi.stubGlobal("navigator", { share, canShare: () => true });
  const storedData = { buildFavoriteConfigLibrary: () => ({ exportedCount: 0, library: { serverId: "global", entries: [], favorites: [{ id: "spirit:cn-placeholder:first", spiritId: "cn-placeholder:first", kind: "spirit" }] } }) };
  const { result } = renderHook(() => useConfigLibraryFlow({ initialState: { versions: { data: null, rules: null } }, snapshot, storedData, onToast }), { wrapper: wrapper(locale) });
  act(() => result.current.openConfigLibraryExport());
  await act(async () => result.current.overlayProps.onExport());
  await waitFor(() => expect(share).toHaveBeenCalled());
  expect(share.mock.calls[0][0].files[0].name).toMatch(new RegExp(`^${prefix}`));
  expect(onToast).toHaveBeenCalledWith(message);
  expect(getMissingUiMessages()).toEqual([]);
});


test("Global favorites-only backup can be exported without inventing a setup", () => {
  const onExport = vi.fn();
  const { rerender } = render(<ConfigLibraryDialog mode="export" onExport={onExport} snapshot={snapshot}
    exportSummary={{ exportedCount: 0, library: { entries: [], favorites: [{ id: "spirit:cn-placeholder:first", spiritId: "cn-placeholder:first" }] } }} />, { wrapper: wrapper("en") });
  expect(screen.getByText("Ready to export · Setups: 0 · Favorites: 1")).toBeVisible();
  expect(screen.getByRole("button", { name: "Export", exact: true })).toBeEnabled();
  screen.getByRole("button", { name: "Export", exact: true }).click();
  expect(onExport).toHaveBeenCalledTimes(1);
  rerender(<ConfigLibraryDialog mode="export" snapshot={snapshot} exportSummary={{ exportedCount: 0, library: { entries: [], favorites: [] } }} />);
  expect(screen.getByRole("button", { name: "Export", exact: true })).toBeDisabled();
});

test.each([
  ["zh-CN", "复制队伍草稿", "预览队伍草稿", "确认导入为新队伍"],
  ["en", "Copy team draft", "Preview team draft", "Import as a new team"],
  ["ja", "チーム下書きをコピー", "チーム下書きを確認", "新しいチームとしてインポート"],
])("Global team JSON copy and confirmed import preserve unknown fields across locales (%s)", async (locale, copyLabel, previewLabel, confirmLabel) => {
  const team = { ...teamsState.teams[0], name: "中文草稿", future: { value: null, rain: 42 }, members: [{ spiritId: "cn-placeholder:中文ID", natureId: null, future: false }, ...Array(5).fill(null)] };
  const writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("navigator", { clipboard: { writeText } });
  const onImport = vi.fn(() => true), onCancel = vi.fn(), fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  const { rerender, container } = render(<TeamExchange mode="export" team={team} snapshot={snapshot} onCancel={onCancel} />, { wrapper: wrapper(locale) });
  fireEvent.click(screen.getByRole("button", { name: copyLabel }));
  await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
  const exported = writeText.mock.calls[0][0];
  expect(parseTeamDraft(exported)).toEqual(team);
  rerender(<TeamExchange mode="import" snapshot={snapshot} onImport={onImport} onCancel={onCancel} />);
  fireEvent.change(screen.getByRole("textbox"), { target: { value: exported } });
  fireEvent.click(screen.getByRole("button", { name: previewLabel }));
  expect(screen.getByText(team.name)).toBeVisible();
  expect(onImport).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: confirmLabel }));
  expect(onImport).toHaveBeenCalledWith(team);
  fireEvent.click(container.querySelector("header button"));
  expect(onCancel).toHaveBeenCalledTimes(1);
  expect(fetch).not.toHaveBeenCalled();
  expect(getMissingUiMessages()).toEqual([]);
});

test("Global JSON file import previews without writing and stale file completion cannot replace edited text", async () => {
  let finish;
  const pending = new Promise((resolve) => { finish = resolve; });
  const onImport = vi.fn();
  const text = serializeTeamDraft(teamsState.teams[0]);
  const { container } = render(<TeamExchange mode="import" snapshot={snapshot} onImport={onImport} />, { wrapper: wrapper() });
  const fileInput = container.querySelector('input[type="file"]');
  fireEvent.change(fileInput, { target: { files: [{ size: text.length, text: async () => text }] } });
  expect(await screen.findByText("Local draft")).toBeVisible();
  expect(onImport).not.toHaveBeenCalled();
  fireEvent.change(fileInput, { target: { files: [{ size: text.length, text: () => pending }] } });
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "{invalid" } });
  await act(async () => finish(text));
  expect(screen.getByRole("textbox")).toHaveValue("{invalid");
  fireEvent.click(screen.getByRole("button", { name: "Preview team draft" }));
  expect(screen.getByRole("alert")).toHaveTextContent("Could not parse");
  expect(screen.queryByRole("button", { name: "Import as a new team" })).not.toBeInTheDocument();
  expect(onImport).not.toHaveBeenCalled();
});

test.each(["cn", "broken", "version"])("Global draft UI refuses %s input before any import callback", (kind) => {
  const onImport = vi.fn();
  const value = JSON.parse(serializeTeamDraft(teamsState.teams[0]));
  if (kind === "cn") value.serverId = "cn";
  if (kind === "version") value.schemaVersion = 9;
  render(<TeamExchange mode="import" snapshot={snapshot} onImport={onImport} />, { wrapper: wrapper() });
  fireEvent.change(screen.getByRole("textbox"), { target: { value: kind === "broken" ? "{invalid" : JSON.stringify(value) } });
  fireEvent.click(screen.getByRole("button", { name: "Preview team draft" }));
  expect(screen.getByRole("alert")).toHaveTextContent("Nothing was imported.");
  expect(screen.queryByRole("button", { name: "Import as a new team" })).not.toBeInTheDocument();
  expect(onImport).not.toHaveBeenCalled();
});
