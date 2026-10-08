import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { expect, test } from "vitest";
import { createPageStructuredData, DEER_PAGE_METADATA, HOME_PAGE_METADATA, PAGE_SCHEMA_ID, SITE_IMAGE, SITE_NAME } from "../../src/seo/page-metadata.js";

const source = (path) => readFileSync(path, "utf8");

test.each([
  ["index.html", HOME_PAGE_METADATA, "洛克王国：世界伤害计算器"],
  ["dianlu/index.html", DEER_PAGE_METADATA, "电鹿斩杀线计算器"],
])("%s在执行JavaScript前已有正文、入口链接和与路由一致的元信息", (path, metadata, heading) => {
  const page = new JSDOM(source(path));
  try {
    const doc = page.window.document;
    expect(doc.title).toBe(metadata.title);
    for (const [selector, attribute, expected] of [
      ['meta[name="description"]', "content", metadata.description],
      ['link[rel="canonical"]', "href", metadata.canonical],
      ['meta[property="og:title"]', "content", metadata.title],
      ['meta[property="og:description"]', "content", metadata.description],
      ['meta[property="og:url"]', "content", metadata.canonical],
      ['meta[property="og:type"]', "content", "website"],
      ['meta[property="og:locale"]', "content", "zh_CN"],
      ['meta[property="og:site_name"]', "content", SITE_NAME],
      ['meta[property="og:image"]', "content", SITE_IMAGE],
      ['meta[name="twitter:card"]', "content", "summary"],
      ['meta[name="twitter:title"]', "content", metadata.title],
      ['meta[name="twitter:description"]', "content", metadata.description],
      ['meta[name="twitter:image"]', "content", SITE_IMAGE],
    ]) {
      expect(doc.head.querySelectorAll(selector)).toHaveLength(1);
      expect(doc.head.querySelector(selector).getAttribute(attribute)).toBe(expected);
    }
    const schema = doc.head.querySelectorAll(`#${PAGE_SCHEMA_ID}`);
    expect(schema).toHaveLength(1);
    expect(JSON.parse(schema[0].textContent)).toEqual(createPageStructuredData(metadata));
    expect(doc.querySelector("main h1").textContent).toBe(heading);
    expect(doc.querySelector("main p").textContent).toContain("S4");
    expect(doc.querySelector('main a[href="/guide/"]')).not.toBeNull();
    for (const href of ["/", "/dianlu/", "/guide/"]) {
      const link = doc.querySelector(`footer a[href="${href}"]`);
      expect(link).not.toBeNull();
      expect(link.closest("#root")).toBeNull();
    }
    expect(doc.querySelector('script[type="module"]').getAttribute("src")).toBe("/src/main.jsx");
    expect([...doc.querySelectorAll('meta[name="robots"]')].some((tag) => /noindex/i.test(tag.content))).toBe(false);
  } finally { page.window.close(); }
});

test("使用说明是具有正文与真实工具链接的独立HTML页面", () => {
  const page = new JSDOM(source("guide/index.html"));
  try {
    const doc = page.window.document;
    expect(doc.querySelector("main h1").textContent).toBe("洛克计算器使用说明");
    expect(doc.querySelectorAll("main section").length).toBeGreaterThan(0);
    expect(doc.querySelector('a[href="/"]')).not.toBeNull();
    expect(doc.querySelector('a[href="/dianlu/"]')).not.toBeNull();
    expect(doc.querySelector('link[rel="canonical"]').getAttribute("href")).toBe("https://rococalc.top/guide/");
  } finally { page.window.close(); }
});

test("robots和sitemap是可随构建复制的真实文件，未缺失或写成SPA首页HTML", () => {
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
      HOME_PAGE_METADATA.canonical, DEER_PAGE_METADATA.canonical, "https://rococalc.top/guide/",
    ]);
  } finally { sitemap.window.close(); }
});
