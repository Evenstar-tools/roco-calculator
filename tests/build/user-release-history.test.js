// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { minify } from "terser";
import { expect, test, vi } from "vitest";
import { userReleaseHistoryPlugin, USER_RELEASE_HISTORY_ASSET } from "../../scripts/user-release-history.mjs";
import { FEATURED_USER_RELEASE, USER_RELEASE_NOTES } from "../../src/data/user-release-notes.js";

const filename = path.join(process.cwd(), "src/data/user-release-notes.js");
const source = readFileSync(filename, "utf8");

test("production retains the latest notice and emits every historical record from the maintained source", async () => {
  const plugin = userReleaseHistoryPlugin();
  plugin.configResolved({ root: path.join(process.cwd(), "pre"), base: "/pre/", command: "build" });
  const transformed = await plugin.transform(source, filename);
  expect(transformed.code).toContain(FEATURED_USER_RELEASE.version);
  expect(transformed.code).not.toContain(USER_RELEASE_NOTES.at(-1).title);
  expect(await plugin.transform("export {}", filename + ".other.js")).toBeNull();
  const emitFile = vi.fn();
  await plugin.generateBundle.call({ emitFile });
  expect(emitFile).toHaveBeenCalledOnce();
  const asset = emitFile.mock.calls[0][0];
  expect(asset).toMatchObject({ type: "asset", fileName: USER_RELEASE_HISTORY_ASSET });
  expect(JSON.parse(asset.source)).toEqual(USER_RELEASE_NOTES);
  const options = { module: true, compress: { passes: 3 }, ecma: 2020 };
  const original = await minify(source, options);
  const latest = await minify(transformed.code, options);
  expect(gzipSync(original.code).length - gzipSync(latest.code).length).toBeGreaterThan(15 * 1024);
});

test.each(["/", "/pre/", "/global-assets/"])("development serves the same full JSON at %s without pruning maintained exports", async base => {
  const plugin = userReleaseHistoryPlugin();
  plugin.configResolved({ root: process.cwd(), base, command: "serve" });
  expect(await plugin.transform(source, filename)).toBeNull();
  const use = vi.fn();
  plugin.configureServer({ middlewares: { use } });
  const response = { setHeader: vi.fn(), end: vi.fn() }, next = vi.fn();
  await use.mock.calls[0][0]({ url: `${base}${USER_RELEASE_HISTORY_ASSET}` }, response, next);
  expect(next).not.toHaveBeenCalled();
  expect(JSON.parse(response.end.mock.calls[0][0])).toEqual(USER_RELEASE_NOTES);
  await use.mock.calls[0][0]({ url: "/other.json" }, response, next);
  expect(next).toHaveBeenCalledOnce();
});
