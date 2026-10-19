import { existsSync, readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { expect, test } from "vitest";
import { DEER_PAGE_METADATA, HOME_PAGE_METADATA } from "../../src/seo/page-metadata.js";

const source = (path) => readFileSync(path, "utf8");

test.each([
  ["index.html", HOME_PAGE_METADATA],
  ["dianlu/index.html", DEER_PAGE_METADATA],
])("%s保留基本元信息，不展示介绍或额外页脚", (path, metadata) => {
  const page = new JSDOM(source(path));
  try {
    const doc = page.window.document;
    expect(doc.title).toBe(metadata.title);
    for (const [selector, attribute, expected] of [
      ['meta[name="description"]', "content", metadata.description],
      ['link[rel="canonical"]', "href", metadata.canonical],
    ]) {
      expect(doc.head.querySelectorAll(selector)).toHaveLength(1);
      expect(doc.head.querySelector(selector).getAttribute(attribute)).toBe(expected);
    }
    expect(doc.querySelector('meta[property^="og:"], meta[name^="twitter:"], script[type="application/ld+json"]')).toBeNull();
    expect(doc.querySelector("footer.site-links, .site-intro, #rococalc-boot-style")).toBeNull();
    expect(doc.querySelector("#root").childNodes).toHaveLength(0);
    expect(doc.querySelector('link[href="/seo-entry.css"]')).toBeNull();
    expect(source(path)).not.toContain("/guide/");
    expect(doc.querySelector('script[type="module"]').getAttribute("src")).toBe("/src/main.jsx");
    expect([...doc.querySelectorAll('meta[name="robots"]')].some((tag) => /noindex/i.test(tag.content))).toBe(false);
  } finally { page.window.close(); }
});

test.each([
  ["cn/index.html", "zh-CN", "洛克计算器 · 国服", "/cn/"],
  ["en/index.html", "en", "Roco Calculator · Global", "/en/"],
  ["global/zh-CN/index.html", "zh-CN", "洛克计算器 · 国际服", "/global/zh-CN/"],
  ["global/ja/index.html", "ja", "Roco Calculator · グローバル版", "/global/ja/"],
])("%s直接挂载对应语言工具，不恢复静态介绍或SEO内容", (path, locale, title, canonicalPath) => {
  const page = new JSDOM(source(path));
  try {
    const doc = page.window.document;
    expect(doc.documentElement.lang).toBe(locale);
    expect(doc.title).toBe(title);
    expect(doc.querySelector('link[rel="canonical"]').getAttribute("href")).toBe(`https://rococalc.top${canonicalPath}`);
    expect(doc.querySelector("#root").childNodes).toHaveLength(0);
    expect(doc.querySelector('script[type="module"]').getAttribute("src")).toBe("/src/main.jsx");
    const manifestPath = canonicalPath === "/cn/" ? "/manifest.webmanifest" : `/manifest-global-${locale}.webmanifest`;
    expect(doc.querySelector('link[rel="manifest"]').getAttribute("href")).toBe(manifestPath);
    const manifest = JSON.parse(source(`public${manifestPath}`));
    expect(manifest.lang).toBe(locale);
    if (canonicalPath !== "/cn/") {
      expect(manifest.id).toBe("/");
      expect(manifest.start_url).toBe(`${canonicalPath}?source=pwa`);
      expect(manifest.name).not.toContain("S4");
    }
    expect(doc.querySelector('nav, footer, .intro, .steps, .faq, .tools, meta[property^="og:"], meta[name^="twitter:"], script[type="application/ld+json"]')).toBeNull();
    expect(source("config/vite.config.mjs")).toContain(`../${path}`);
    const { redirects } = JSON.parse(source("edgeone.json"));
    expect(redirects.find((rule) => rule.source === canonicalPath.slice(0, -1)))
      .toEqual({ source: canonicalPath.slice(0, -1), destination: canonicalPath, statusCode: 301 });
  } finally { page.window.close(); }
});

test("下线的中文指南直接重定向到计算器，构建不再包含指南和案例图片", () => {
  const { redirects } = JSON.parse(source("edgeone.json"));
  for (const path of ["/guide", "/guide/"]) {
    expect(redirects.find((rule) => rule.source === path)).toEqual({ source: path, destination: "/", statusCode: 301 });
  }
  expect(existsSync("guide/index.html")).toBe(false);
  expect(existsSync("public/images/guide-damage-example.jpg")).toBe(false);
  expect(source("config/vite.config.mjs")).not.toContain("../guide/index.html");
});

test("robots和sitemap是可随构建复制的真实文件，包含当前三个页面", () => {
  const robots = source("public/robots.txt");
  expect(robots).toMatch(/^User-agent:\s*\*\s*$/m);
  expect(robots).toMatch(/^Allow:\s*\/\s*$/m);
  expect(robots).toMatch(/^Sitemap:\s*https:\/\/rococalc\.top\/sitemap\.xml\s*$/m);
  expect(robots).not.toMatch(/^Disallow:\s*\/\s*$/m);
  expect(robots).not.toMatch(/<html|<!doctype/i);
  const sitemap = new JSDOM(source("public/sitemap.xml"), { contentType: "text/xml" });
  try {
    const doc = sitemap.window.document;
    expect(doc.documentElement.localName).toBe("urlset");
    expect(doc.documentElement.namespaceURI).toBe("http://www.sitemaps.org/schemas/sitemap/0.9");
    expect([...doc.querySelectorAll("loc")].map((loc) => loc.textContent)).toEqual([
      HOME_PAGE_METADATA.canonical, DEER_PAGE_METADATA.canonical, "https://rococalc.top/en/",
    ]);
  } finally { sitemap.window.close(); }
});
