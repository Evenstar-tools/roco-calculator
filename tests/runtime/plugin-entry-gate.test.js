// @vitest-environment node
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { expect, test, vi } from "vitest";

const html = readFileSync("public/plugins/wild-spirit-detector/index.html", "utf8");
const script = html.match(/<script data-plugin-gate>([\s\S]*?)<\/script>/)[1];
function open(cookie = "", location = {}) {
  const listeners = {};
  const root = { setAttribute: vi.fn(), removeAttribute: vi.fn() };
  const document = { cookie, documentElement: root };
  const replace = vi.fn();
  vm.runInNewContext(script, { document, location: { ...location, replace },
    window: { addEventListener: (name, callback) => { listeners[name] = callback; } } });
  return { document, root, replace, listeners };
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
  page.listeners.pageshow({ persisted: false });
  expect(page.replace).not.toHaveBeenCalled();
  page.listeners.pageshow({ persisted: true });
  expect(page.root.removeAttribute).toHaveBeenCalledWith("data-plugin-entry");
  expect(page.replace).toHaveBeenCalledWith("/cn/");
});
