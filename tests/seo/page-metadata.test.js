import { createElement } from "react";
import { JSDOM } from "jsdom";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { CalculatorRouter } from "../../src/CalculatorRouter.jsx";
import { applyPageMetadata, DEER_PAGE_METADATA, HOME_PAGE_METADATA, PAGE_SCHEMA_ID, SITE_IMAGE } from "../../src/seo/page-metadata.js";

vi.mock("../../src/App.jsx", () => ({
  App: ({ onOpenDeer }) => createElement("button", { onClick: () => onOpenDeer({ state: {} }) }, "打开电鹿"),
}));
vi.mock("../../src/analytics/metrics.js", () => ({ metrics: { route: vi.fn(), track: vi.fn() } }));

let originalHead;
beforeEach(() => {
  originalHead = document.head.innerHTML;
  document.head.innerHTML = `<title>旧主页</title>
    <meta name="description" content="旧描述"><meta name="description" content="重复描述">
    <link rel="canonical" href="https://rococalc.top/?source=pwa"><link rel="canonical" href="https://rococalc.top/old">
    <meta property="og:title" content="旧分享标题"><meta property="og:title" content="重复分享标题">
    <script id="${PAGE_SCHEMA_ID}" type="application/ld+json">{"name":"旧主页"}</script>`;
  window.history.replaceState(null, "", "/?source=pwa");
  vi.stubGlobal("scrollTo", vi.fn());
  // Keep the real lazy DeerPage in its loading state so its title effect runs without data fixtures.
  vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
});
afterEach(() => {
  cleanup();
  document.head.innerHTML = originalHead;
  window.history.replaceState(null, "", "/");
  vi.unstubAllGlobals();
});

function expectPageMetadata(metadata) {
  expect(document.title).toBe(metadata.title);
  for (const [selector, attribute, expected] of [
    ['meta[name="description"]', "content", metadata.description],
    ['link[rel="canonical"]', "href", metadata.canonical],
    ['meta[property="og:title"]', "content", metadata.title],
    ['meta[property="og:description"]', "content", metadata.description],
    ['meta[property="og:url"]', "content", metadata.canonical],
    ['meta[property="og:image"]', "content", SITE_IMAGE],
    ['meta[name="twitter:title"]', "content", metadata.title],
    ['meta[name="twitter:description"]', "content", metadata.description],
    ['meta[name="twitter:image"]', "content", SITE_IMAGE],
  ]) {
    expect(document.head.querySelectorAll(selector)).toHaveLength(1);
    expect(document.head.querySelector(selector).getAttribute(attribute)).toBe(expected);
  }
  const schemas = document.head.querySelectorAll(`#${PAGE_SCHEMA_ID}`);
  expect(schemas).toHaveLength(1);
  const schema = JSON.parse(schemas[0].textContent);
  expect(schema).toMatchObject({
    "@context": "https://schema.org", "@type": "WebApplication",
    name: metadata.name, url: metadata.canonical, description: metadata.description,
  });
  expect(schema).not.toHaveProperty("aggregateRating");
  expect(schema).not.toHaveProperty("review");
}

test("打开电鹿和浏览器后退前进同步元信息，真实子页不会覆盖标题或卸载后写回旧标题", async () => {
  render(createElement(CalculatorRouter));
  expectPageMetadata(HOME_PAGE_METADATA);
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "打开电鹿" }));
    await vi.dynamicImportSettled();
  });
  await screen.findByRole("link", { name: "返回主站" });
  expect(window.location.pathname).toBe("/dianlu/");
  expectPageMetadata(DEER_PAGE_METADATA);

  act(() => window.history.back());
  await waitFor(() => expect(window.location.pathname).toBe("/"));
  await waitFor(() => expectPageMetadata(HOME_PAGE_METADATA));
  act(() => window.history.forward());
  await screen.findByRole("link", { name: "返回主站" });
  expectPageMetadata(DEER_PAGE_METADATA);
});

test.each(["/dianlu", "/dianlu/"])("直接打开%s后返回主页的pushState分支同步元信息", async (path) => {
  window.history.replaceState(null, "", path);
  render(createElement(CalculatorRouter));
  const back = await screen.findByRole("link", { name: "返回主站" });
  expectPageMetadata(DEER_PAGE_METADATA);
  fireEvent.click(back);
  expect(window.location.pathname).toBe("/");
  expectPageMetadata(HOME_PAGE_METADATA);
});

test("桌面协议不改标题、不注入网页canonical和结构化数据", () => {
  const desktop = new JSDOM("<!doctype html><html><head><title>洛克计算器桌面版</title></head><body></body></html>", { url: "app://calculator/" });
  try {
    applyPageMetadata(DEER_PAGE_METADATA, desktop.window.document);
    expect(desktop.window.document.title).toBe("洛克计算器桌面版");
    expect(desktop.window.document.head.querySelector("meta, link, script")).toBeNull();
  } finally { desktop.window.close(); }
});
