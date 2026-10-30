import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { PresetUpdateNotice } from "../../src/components/PresetUpdateNotice.jsx";
import { LocaleProvider } from "../../src/i18n/LocaleContext.jsx";
import { RuntimeProvider } from "../../src/runtime/RuntimeContext.jsx";

afterEach(() => vi.useRealTimers());

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
