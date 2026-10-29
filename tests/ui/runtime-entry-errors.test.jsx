import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { WebEntry } from "../../src/runtime/WebEntry.jsx";
import { translateUi } from "../../src/i18n/messages.js";

vi.mock("../../src/CalculatorRouter.jsx", async () => {
  throw new TypeError("加载模块失败：Failed to fetch dynamically imported module: private/chunk.js");
});
vi.mock("../../src/App.jsx", async () => {
  throw new TypeError("加载模块失败：Failed to fetch dynamically imported module: private/chunk.js");
});
vi.mock("../../src/analytics/metrics.js", () => ({ metrics: { setServer: vi.fn(), start: vi.fn() } }));

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubGlobal("scrollTo", vi.fn());
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  history.replaceState(null, "", "/");
});

test.each([["en", "/en/"], ["ja", "/jp/"], ["zh-CN", "/cn/"]])("%s catches a rejected lazy entry and offers localized reload without exposing the exception", async (locale, pathname) => {
  history.replaceState(null, "", pathname);
  localStorage.setItem("runtime-error-saved-draft", "keep-original");
  const { container } = render(<WebEntry />);
  expect(await screen.findByRole("alert")).toHaveTextContent(translateUi(locale, "页面无法显示，请重新加载。"));
  expect(container.textContent).not.toMatch(/加载模块失败|Failed to fetch|private\/chunk/);
  if (locale === "en") expect(container.textContent).not.toMatch(/[\u3400-\u9fff]/);
  const reload = vi.fn();
  vi.stubGlobal("location", { ...window.location, reload });
  fireEvent.click(screen.getByRole("button", { name: translateUi(locale, "重新加载") }));
  expect(reload).toHaveBeenCalledOnce();
  expect(localStorage.getItem("runtime-error-saved-draft")).toBe("keep-original");
});

test("a failed Global workspace updates its error language on history navigation", async () => {
  history.replaceState(null, "", "/en/");
  render(<WebEntry />);
  expect(await screen.findByRole("alert")).toHaveTextContent(translateUi("en", "页面无法显示，请重新加载。"));
  history.pushState(null, "", "/jp/");
  fireEvent.popState(window);
  expect(screen.getByRole("alert")).toHaveTextContent(translateUi("ja", "页面无法显示，请重新加载。"));
  expect(document.documentElement.lang).toBe("ja");
});
