// @vitest-environment node
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import vm from "node:vm";
import { expect, test, vi } from "vitest";

const htmlPath = "public/plugins/wild-spirit-detector/index.html";
const html = readFileSync(htmlPath, "utf8");
const gate = html.match(/<script\b([^>]*\bdata-plugin-gate\b[^>]*)>([\s\S]*?)<\/script>/);
const scriptPath = gate[1].match(/\bsrc=["']([^"']+)["']/)?.[1];
const script = scriptPath ? readFileSync(resolve(dirname(htmlPath), scriptPath), "utf8") : gate[2];
const key = "roco-cn-plugin-entry";
const now = 1_800_000_000_000;
function open(cookie = "", location = {}, stored = new Map()) {
  const listeners = {};
  const root = { setAttribute: vi.fn(), removeAttribute: vi.fn() };
  const document = { documentElement: root };
  const readCookie = vi.fn(() => cookie);
  const writeCookie = vi.fn(value => { cookie = value; });
  Object.defineProperty(document, "cookie", { get: readCookie, set: writeCookie });
  const sessionStorage = {
    getItem: vi.fn(name => stored.get(name) ?? null),
    removeItem: vi.fn(name => { stored.delete(name); }),
  };
  const replace = vi.fn();
  vm.runInNewContext(script, { document, location: { protocol: "https:", ...location, replace },
    Date: { now: () => now }, sessionStorage,
    window: { sessionStorage, addEventListener: (name, callback) => { listeners[name] = callback; } } });
  return { document, root, replace, listeners, sessionStorage, readCookie, writeCookie };
}

test.each(["", "roco-cn-plugin-entry=0", "other=1"])("direct URLs have no entry grant: %s", cookie => {
  const page = open(cookie, { search: "?unlocked=1", hash: "#龙骑士" });
  expect(page.replace).toHaveBeenCalledWith("/cn/");
  expect(page.root.setAttribute).not.toHaveBeenCalled();
  expect(html).toContain('html:not([data-plugin-entry]) body { display: none !important; }');
  expect(html.indexOf("data-plugin-gate")).toBeLessThan(html.indexOf("<body>"));
});

test("one entry click opens the introduction and consumes its grant; back cache closes it", () => {
  const page = open("other=1; roco-cn-plugin-entry=1");
  expect(page.replace).not.toHaveBeenCalled();
  expect(page.root.setAttribute).toHaveBeenCalledWith("data-plugin-entry", "open");
  expect(page.document.cookie).toContain("Max-Age=0");
  expect(open(page.document.cookie).replace).toHaveBeenCalledWith("/cn/");
  page.listeners.pageshow({ persisted: false });
  expect(page.replace).not.toHaveBeenCalled();
  page.listeners.pageshow({ persisted: true });
  expect(page.root.removeAttribute).toHaveBeenCalledWith("data-plugin-entry");
  expect(page.replace).toHaveBeenCalledWith("/cn/");
});

test.each([1, 30_000])("desktop app entry consumes its %sms session grant and cannot reuse it on refresh", duration => {
  const stored = new Map([[key, String(now + duration)]]);
  const page = open("", { protocol: "app:" }, stored);
  expect(page.replace).not.toHaveBeenCalled();
  expect(page.root.setAttribute).toHaveBeenCalledWith("data-plugin-entry", "open");
  expect(page.sessionStorage.getItem).toHaveBeenCalledWith(key);
  expect(page.sessionStorage.removeItem).toHaveBeenCalledWith(key);
  expect(stored.has(key)).toBe(false);
  expect(page.readCookie).not.toHaveBeenCalled();
  expect(page.writeCookie).not.toHaveBeenCalled();
  expect(open("", { protocol: "app:" }, stored).replace).toHaveBeenCalledWith("/cn/");
  page.listeners.pageshow({ persisted: false });
  expect(page.replace).not.toHaveBeenCalled();
  page.listeners.pageshow({ persisted: true });
  expect(page.root.removeAttribute).toHaveBeenCalledWith("data-plugin-entry");
  expect(page.replace).toHaveBeenCalledWith("/cn/");
});

test.each([undefined, "", " ", String(now - 1), String(now), "-1", "1e999", "Infinity", "NaN", "30.5", "invalid", String(now + 30_001), String(Number.MAX_SAFE_INTEGER)])(
  "desktop app rejects and consumes missing, expired or invalid grants: %s", value => {
    const stored = new Map(value === undefined ? [] : [[key, value]]);
    const page = open(`${key}=1`, { protocol: "app:", search: "?unlocked=1", hash: "#龙骑士" }, stored);
    expect(page.replace).toHaveBeenCalledWith("/cn/");
    expect(page.root.setAttribute).not.toHaveBeenCalled();
    expect(page.sessionStorage.removeItem).toHaveBeenCalledWith(key);
    expect(stored.has(key)).toBe(false);
    expect(page.readCookie).not.toHaveBeenCalled();
  },
);

test.each(["read", "remove"])("desktop app stays closed if session storage %s fails", operation => {
  const stored = {
    get: () => {
      if (operation === "read") throw new Error("storage unavailable");
      return String(now + 30_000);
    },
    delete: () => { throw new Error("storage unavailable"); },
  };
  const page = open(`${key}=1`, { protocol: "app:" }, stored);
  expect(page.replace).toHaveBeenCalledWith("/cn/");
  expect(page.root.setAttribute).not.toHaveBeenCalled();
});

test("Web entry keeps using its one-time cookie and ignores the desktop session grant", () => {
  const stored = new Map([[key, String(now + 30_000)]]);
  const page = open("", {}, stored);
  expect(page.replace).toHaveBeenCalledWith("/cn/");
  expect(page.sessionStorage.getItem).not.toHaveBeenCalled();
  expect(page.sessionStorage.removeItem).not.toHaveBeenCalled();
  expect(stored.has(key)).toBe(true);
});

test("the entry gate is an external synchronous same-directory script before the page body", () => {
  expect(scriptPath).toBe("./entry-gate.js");
  expect(gate[2].trim()).toBe("");
  expect(gate[1]).not.toMatch(/\b(?:async|defer)\b|\btype\s*=\s*["']module["']/i);
  expect(html.indexOf("data-plugin-gate")).toBeLessThan(html.indexOf("<body>"));
});
