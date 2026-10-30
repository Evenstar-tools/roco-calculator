import { readFileSync } from "node:fs";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { PresetUpdateNotice } from "../../src/components/PresetUpdateNotice.jsx";
import { LocaleProvider } from "../../src/i18n/LocaleContext.jsx";
import { RuntimeProvider } from "../../src/runtime/RuntimeContext.jsx";
import { ConfigLibraryDialog } from "../../src/components/ConfigLibraryDialog.jsx";
import { useConfigLibraryFlow } from "../../src/hooks/useConfigLibraryFlow.js";
import { useStoredCalculatorData } from "../../src/hooks/useStoredCalculatorData.js";
import { withCalculatorExtras } from "../../src/data/snapshot-extras.js";
import { clearMissingUiMessages, getMissingUiMessages } from "../../src/i18n/messages.js";

afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); localStorage.clear(); });

test.each([
  ["首次进入有可新增配置", { added: 3, updated: 0 }, "常用精灵配置可导入（3）"],
  ["老用户有可安全更新的预设", { added: 0, updated: 2 }, "常用精灵配置可更新（2）"],
  ["新增与更新并存时按更新表述", { added: 1, updated: 2 }, "常用精灵配置可更新（3）"],
])("%s 才显示顶部提醒，2 秒后消失且普通重绘不重弹", async (_, preview, text) => {
  vi.useFakeTimers();
  const loadPopularConfigLibrary = vi.fn().mockResolvedValue({ preview });
  const props = { loadPopularConfigLibrary, onOpen: vi.fn() };
  const { rerender } = render(<PresetUpdateNotice {...props} />);
  await act(async () => {});
  expect(screen.getByRole("status")).toHaveTextContent(text);
  await act(async () => vi.advanceTimersByTime(2000));
  expect(screen.queryByRole("status")).toBeNull();
  rerender(<PresetUpdateNotice {...props} loadPopularConfigLibrary={() => loadPopularConfigLibrary()} />);
  await act(async () => {});
  expect(loadPopularConfigLibrary).toHaveBeenCalledOnce();
  expect(props.onOpen).not.toHaveBeenCalled();
});

test.each([
  { added: 0, updated: 0, same: 231 },
  { added: 0, updated: 0, different: 1, preserved: 1 },
  { added: 0, updated: 0, favoritesAdded: 1 },
])("没有配置更新时不提醒，也不把手改差异或收藏变化当更新：%j", async (preview) => {
  render(<PresetUpdateNotice loadPopularConfigLibrary={async () => ({ preview })} onOpen={vi.fn()} />);
  await act(async () => {});
  expect(screen.queryByRole("status")).toBeNull();
});

test("读取失败静默，卸载取消后台请求", async () => {
  const loadPopularConfigLibrary = vi.fn().mockRejectedValue(new Error("offline"));
  const { unmount } = render(<PresetUpdateNotice loadPopularConfigLibrary={loadPopularConfigLibrary} />);
  await act(async () => {});
  expect(screen.queryByRole("status")).toBeNull();
  const { signal } = loadPopularConfigLibrary.mock.calls[0][0];
  unmount();
  expect(signal.aborted).toBe(true);
});

test.each([["cn", "zh-CN", "查看"], ["global", "en", "View"], ["global", "ja", "表示"]])(
  "%s/%s 点击提醒打开既有更新入口，不自动导入", async (serverId, locale, label) => {
    const onOpen = vi.fn();
    render(<RuntimeProvider serverId={serverId}><LocaleProvider locale={locale}>
      <PresetUpdateNotice loadPopularConfigLibrary={async () => ({ preview: { added: 1 } })} onOpen={onOpen} />
    </LocaleProvider></RuntimeProvider>);
    await act(async () => {});
    expect(onOpen).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).not.toHaveTextContent(/Translation unavailable|翻訳未対応/);
    fireEvent.click(screen.getByRole("button", { name: label }));
    expect(onOpen).toHaveBeenCalledOnce();
    expect(screen.queryByRole("status")).toBeNull();
  },
);

const snapshot = withCalculatorExtras(JSON.parse(readFileSync("public/data/global-runtime.json", "utf8")));
const presets = JSON.parse(readFileSync("public/data/global/presets/pvp-popular-configs.json", "utf8"));
const versions = { data: snapshot.meta.id, rules: snapshot.meta.rulesVersion };
const unknown = { ...presets.entries[0], spiritId: "cn-placeholder:spirit_future_s5_not_in_global" };

function globalLibrary(locale, library) {
  let current;
  const fetcher = vi.fn(async () => ({ ok: true, text: async () => JSON.stringify(library) }));
  vi.stubGlobal("fetch", fetcher);
  vi.stubEnv("BASE_URL", "/global-assets/");
  function Library() {
    const storedData = useStoredCalculatorData(snapshot, { serverId: "global", onToast: vi.fn() });
    const flow = useConfigLibraryFlow({ initialState: { versions }, snapshot, storedData, onToast: vi.fn() });
    current = { flow, storedData };
    return <><PresetUpdateNotice loadPopularConfigLibrary={flow.loadPopularConfigLibrary} onOpen={flow.openPopularConfigLibrary} />
      <ConfigLibraryDialog {...flow.overlayProps} /></>;
  }
  return {
    element: <RuntimeProvider serverId="global" locale={locale}><LocaleProvider locale={locale}><Library /></LocaleProvider></RuntimeProvider>,
    fetcher,
    current: () => current,
  };
}

test.each([
  ["en", "Recommended setups: 2 to import", "View", "Import setups (2)"],
  ["ja", "おすすめ設定を読み込めます（2件）", "表示", "設定を読み込む（2）"],
])("%s Global reminder uses only valid Global entries and stays silent after import and remount", async (locale, notice, viewLabel, importLabel) => {
  clearMissingUiMessages();
  const harness = globalLibrary(locale, { ...presets, entries: [...presets.entries.slice(0, 2), unknown] });
  const view = render(harness.element);
  expect(await screen.findByRole("status")).toHaveTextContent(notice);
  const [url, { signal }] = harness.fetcher.mock.calls[0];
  expect(url).toBe("/global-assets/data/global/presets/pvp-popular-configs.json");
  expect(signal).toBeInstanceOf(AbortSignal);
  fireEvent.click(within(screen.getByRole("status")).getByRole("button", { name: viewLabel }));
  const button = await screen.findByRole("button", { name: importLabel, exact: true });
  const parsed = harness.current().flow.overlayProps.parsed;
  expect(parsed.entries.map((entry) => entry.spiritId)).toEqual(presets.entries.slice(0, 2).map((entry) => entry.spiritId));
  expect(parsed.changes.map((entry) => entry.spiritId)).not.toContain(unknown.spiritId);
  expect(parsed.favoriteSpiritIds).not.toContain(unknown.spiritId);
  fireEvent.click(button);
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  let preview;
  await act(async () => { preview = await harness.current().flow.loadPopularConfigLibrary(); });
  expect(preview.preview).toMatchObject({ added: 0, updated: 0, same: 2 });
  view.unmount();
  render(harness.element);
  await act(async () => {});
  expect(screen.queryByRole("status")).toBeNull();
  expect(harness.fetcher.mock.calls.every(([path]) => path === url)).toBe(true);
  expect(getMissingUiMessages()).toEqual([]);
});

test("unknown-only Global presets never produce a reminder", async () => {
  const harness = globalLibrary("en", { ...presets, entries: [unknown] });
  render(harness.element);
  await act(async () => {});
  expect(harness.fetcher).toHaveBeenCalledOnce();
  expect(screen.queryByRole("status")).toBeNull();
});

test("Global safe updates count unchanged presets while keeping manual edits untouched", async () => {
  const library = { ...presets, entries: structuredClone(presets.entries.slice(0, 2)) };
  const harness = globalLibrary("en", library);
  render(harness.element);
  await screen.findByRole("status");
  let parsed;
  await act(async () => {
    parsed = await harness.current().flow.loadPopularConfigLibrary();
    harness.current().storedData.importFavoriteConfigLibrary(parsed);
  });
  const editedId = library.entries[1].spiritId;
  const saved = harness.current().storedData.getSpiritConfiguration(editedId);
  const editedHp = (saved.displayIvs.hp + 1) % 61;
  act(() => harness.current().storedData.rememberSide({ ...saved, displayIvs: { ...saved.displayIvs, hp: editedHp } }));
  library.entries[0].natureId = library.entries[0].natureId === "neutral" ? "cheerful" : "neutral";
  library.entries[1].natureId = library.entries[1].natureId === "neutral" ? "cheerful" : "neutral";
  await act(async () => { parsed = await harness.current().flow.loadPopularConfigLibrary(); });
  expect(parsed.preview).toMatchObject({ added: 0, updated: 1, preserved: 1 });
  await act(async () => harness.current().storedData.importFavoriteConfigLibrary(parsed));
  expect(harness.current().storedData.getSpiritConfiguration(editedId).displayIvs.hp).toBe(editedHp);
  expect(harness.current().storedData.getSpiritConfiguration(library.entries[0].spiritId).natureId).toBe(library.entries[0].natureId);
});
