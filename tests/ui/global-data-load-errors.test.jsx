import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { App } from "../../src/App.jsx";
import DeerPage from "../../src/features/deer/DeerPage.jsx";
import { RuntimeProvider } from "../../src/runtime/RuntimeContext.jsx";
import { LocaleProvider } from "../../src/i18n/LocaleContext.jsx";
import { translateUi } from "../../src/i18n/messages.js";

const wrap = (locale, children) => <RuntimeProvider serverId="global" locale={locale}><LocaleProvider locale={locale}>{children}</LocaleProvider></RuntimeProvider>;
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const failures = [
  ["HTTP", () => Promise.resolve({ ok: false, status: 503 })],
  ["JSON", () => Promise.resolve({ ok: true, json: () => Promise.reject(new SyntaxError("资料格式错误：Unexpected token at private/data.json")) })],
  ["network", () => Promise.reject(new TypeError("网络请求失败：Failed to fetch private/data.json"))],
];
for (const [name, Page] of [["calculator", App], ["deer", DeerPage]]) {
  test.each(failures)(`${name} %s load failures use current-language feedback without leaking raw errors`, async (_kind, failure) => {
    const fetch = vi.fn(failure); vi.stubGlobal("fetch", fetch);
    const { container, rerender } = render(wrap("en", <Page />));
    const message = "资料加载失败，请重试。";
    expect(await screen.findByText(translateUi("en", message))).toBeVisible();
    expect(container.textContent).not.toMatch(/资料格式错误|网络请求失败|数据加载失败|Unexpected token|Failed to fetch|private\/data/);
    expect(fetch).toHaveBeenCalledOnce();
    rerender(wrap("ja", <Page />));
    expect(screen.getByText(translateUi("ja", message))).toBeVisible();
    expect(fetch).toHaveBeenCalledOnce();
    if (name === "deer") expect(screen.getByRole("alert")).toHaveTextContent(translateUi("ja", message));
  });
}
