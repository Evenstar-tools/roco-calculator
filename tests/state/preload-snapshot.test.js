// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";
import { preloadServerSnapshot } from "../../src/runtime/preload-snapshot.js";

afterEach(() => {
  document.head.querySelectorAll('link[rel="preload"]').forEach((link) => link.remove());
  vi.unstubAllEnvs();
});

test.each([
  ["cn", "/", "/data/runtime.json"],
  ["cn", "/pre/", "/pre/data/runtime.json"],
  ["global", "/global-assets/", "/global-assets/data/global-runtime.json"],
])("preloads only %s data at its own %s mount before the workspace requests it", (serverId, base, href) => {
  vi.stubEnv("BASE_URL", base);
  preloadServerSnapshot(serverId);
  preloadServerSnapshot(serverId);
  const links = [...document.head.querySelectorAll('link[rel="preload"]')];
  expect(links).toHaveLength(1);
  expect(links[0].getAttribute("href")).toBe(href);
  expect(links[0].getAttribute("as")).toBe("fetch");
  expect(links[0].crossOrigin).toBe("anonymous");
});

test("non-document callers can skip the optional hint", () => {
  expect(() => preloadServerSnapshot("cn", { document: null })).not.toThrow();
});
