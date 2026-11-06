import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { grantPluginEntry, PluginAccess, usePluginAccess } from "../../src/runtime/PluginAccess.jsx";

const testUrl = window.location.href;
function desktopSession() {
  const storage = sessionStorage;
  globalThis.jsdom.reconfigure({ url: "app://calculator/" });
  vi.stubGlobal("sessionStorage", storage);
  return storage;
}

function AccessState() {
  return <span data-testid="plugin-access">{usePluginAccess() ? "已解锁" : "未解锁"}</span>;
}
function content(inputProps = {}) {
  return <><input aria-label="搜索" defaultValue="龙骑士" {...inputProps} /><AccessState /></>;
}
const search = () => screen.getByLabelText("搜索");
const access = () => screen.getByTestId("plugin-access");
const enter = (options = {}) => fireEvent.keyDown(search(), { key: "Enter", ...options });
afterEach(() => {
  cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals();
  globalThis.jsdom.reconfigure({ url: testUrl });
  sessionStorage.clear();
});

test.each([{ type: "search" }, { role: "combobox" }, { "data-search": true }])(
  "搜索入口 %j 精确输入口令并按 Enter 才解锁，输入本身不发放介绍页凭据", props => {
    const cookieBefore = document.cookie;
    render(<PluginAccess enabled>{content(props)}</PluginAccess>);
    expect(access()).toHaveTextContent("未解锁");
    expect(screen.queryByRole("status")).toBeNull();
    enter();
    expect(access()).toHaveTextContent("已解锁");
    expect(screen.getByRole("status")).toHaveTextContent("某处的大门已开启");
    expect(document.cookie).toBe(cookieBefore);
  },
);

test("相似口令、前后空白及普通改名输入不会解锁或吞掉 Enter", () => {
  const onKeyDown = vi.fn();
  render(<PluginAccess enabled>{content({ "data-search": true, onKeyDown })}
    <input aria-label="队伍名称" defaultValue="龙骑士" /></PluginAccess>);
  for (const value of ["", "龙骑", "龙骑士 ", " 龙骑士", "龙骑士a", "a龙骑士", "longqishi"]) {
    fireEvent.change(search(), { target: { value } });
    expect(enter()).toBe(true);
    expect(access()).toHaveTextContent("未解锁");
  }
  expect(onKeyDown).toHaveBeenCalledTimes(7);
  expect(fireEvent.keyDown(screen.getByLabelText("队伍名称"), { key: "Enter" })).toBe(true);
  expect(access()).toHaveTextContent("未解锁");
  expect(screen.queryByRole("status")).toBeNull();
});

test.each([{ isComposing: true }, { keyCode: 229 }, { repeat: true }, { key: "Escape" }])(
  "输入法或非独立 Enter %j 不解锁，也不干预原输入处理", options => {
    const onKeyDown = vi.fn();
    render(<PluginAccess enabled>{content({ type: "search", onKeyDown })}</PluginAccess>);
    expect(enter(options)).toBe(true);
    expect(onKeyDown).toHaveBeenCalledOnce();
    expect(access()).toHaveTextContent("未解锁");
    expect(screen.queryByRole("status")).toBeNull();
  },
);

test.each([{ disabled: true }, { readOnly: true }])("不可编辑搜索框 %j 不解锁", props => {
  render(<PluginAccess enabled>{content({ type: "search", ...props })}</PluginAccess>);
  expect(enter()).toBe(true);
  expect(access()).toHaveTextContent("未解锁");
});

test("有效 Enter 在捕获阶段消费，不误选搜索候选或继续冒泡", () => {
  const picker = vi.fn(), parent = vi.fn();
  render(<PluginAccess enabled><div onKeyDown={parent}>
    {content({ role: "combobox", onKeyDown: picker })}
  </div></PluginAccess>);
  expect(enter()).toBe(false);
  expect(picker).not.toHaveBeenCalled();
  expect(parent).not.toHaveBeenCalled();
  expect(access()).toHaveTextContent("已解锁");
});

test("再次输入口令会重新计时，提示消失后入口仍在当前挂载期间解锁", () => {
  vi.useFakeTimers();
  render(<PluginAccess enabled>{content({ type: "search" })}</PluginAccess>);
  enter();
  act(() => vi.advanceTimersByTime(2000));
  enter();
  act(() => vi.advanceTimersByTime(2000));
  expect(screen.getByRole("status")).toHaveTextContent("某处的大门已开启");
  act(() => vi.advanceTimersByTime(200));
  expect(screen.queryByRole("status")).toBeNull();
  expect(access()).toHaveTextContent("已解锁");
});

test("enabled false 不监听或消费事件，已有解锁及提示也不向子项开放", () => {
  const child = content({ type: "search" });
  const { rerender } = render(<PluginAccess enabled={false}>{child}</PluginAccess>);
  expect(enter()).toBe(true);
  expect(access()).toHaveTextContent("未解锁");
  rerender(<PluginAccess enabled>{child}</PluginAccess>);
  enter();
  expect(access()).toHaveTextContent("已解锁");
  rerender(<PluginAccess enabled={false}>{child}</PluginAccess>);
  expect(enter()).toBe(true);
  expect(access()).toHaveTextContent("未解锁");
  expect(screen.queryByRole("status")).toBeNull();
});

test("卸载移除全局监听，重新挂载从未解锁开始", () => {
  const { unmount } = render(<PluginAccess enabled>{content({ type: "search" })}</PluginAccess>);
  enter();
  unmount();
  const outside = document.createElement("input");
  outside.type = "search";
  outside.value = "龙骑士";
  document.body.append(outside);
  expect(fireEvent.keyDown(outside, { key: "Enter" })).toBe(true);
  outside.remove();
  render(<PluginAccess enabled>{content({ type: "search" })}</PluginAccess>);
  expect(access()).toHaveTextContent("未解锁");
  expect(screen.queryByRole("status")).toBeNull();
});

test("app口令与提示保持原样，会话凭据不解锁菜单，刷新挂载恢复隐藏", () => {
  const storage = desktopSession();
  const credential = String(Date.now() + 30_000);
  storage.setItem("roco-cn-plugin-entry", credential);
  const view = render(<PluginAccess enabled>{content({ type: "search" })}</PluginAccess>);
  expect(access()).toHaveTextContent("未解锁");
  expect(screen.queryByRole("status")).toBeNull();
  enter();
  expect(access()).toHaveTextContent("已解锁");
  expect(screen.getByRole("status")).toHaveTextContent("某处的大门已开启");
  expect(storage.getItem("roco-cn-plugin-entry")).toBe(credential);
  view.unmount();
  render(<PluginAccess enabled>{content({ type: "search" })}</PluginAccess>);
  expect(access()).toHaveTextContent("未解锁");
  expect(screen.queryByRole("status")).toBeNull();
});

test("app主动进入插件只写30秒到期时间会话凭据，不使用网页Cookie", () => {
  const storage = desktopSession();
  const now = vi.spyOn(Date, "now").mockReturnValue(1000);
  const cookie = vi.spyOn(document, "cookie", "set");
  grantPluginEntry();
  expect(storage.getItem("roco-cn-plugin-entry")).toBe("31000");
  now.mockReturnValue(2000);
  grantPluginEntry();
  expect(storage.getItem("roco-cn-plugin-entry")).toBe("32000");
  expect(cookie).not.toHaveBeenCalled();
});
