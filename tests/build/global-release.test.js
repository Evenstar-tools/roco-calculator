import { afterEach, describe, expect, test, vi } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmdirSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildGlobalRelease, copyGlobalRelease, readGlobalReleasePin, requireInside } from "../../scripts/build-global-release.mjs";

const revision = "a".repeat(40);
const temporaryParent = realpathSync(os.tmpdir());
const roots = [];
const entries = ["en/index.html", "jp/index.html", "global/zh-CN/index.html", "global/ja/index.html"];
const manifests = ["manifest-global-en.webmanifest", "manifest-global-ja.webmanifest", "manifest-global-zh-CN.webmanifest"];
const protectedFiles = {
  "index.html": "stable root", "cn/index.html": "stable CN", "dianlu/index.html": "stable deer",
  "sw.js": "stable SW", "data/runtime.json": "stable data", "assets/stable.js": "stable asset",
  "manifest.webmanifest": "stable manifest", "pre/index.html": "pinned preview",
  "pre/assets/preview.js": "preview asset", "pre/data/runtime.json": "preview data",
};
function put(root, filename, content = "") {
  const target = path.join(root, filename);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, content, "utf8");
}
function fixture() {
  const root = mkdtempSync(path.join(temporaryParent, "roco-global-build-test-"));
  roots.push(root);
  put(root, "config/global-release.json", JSON.stringify({ schemaVersion: 1, sourceRevision: revision }));
  put(root, "node_modules/vite/bin/vite.js");
  for (const [filename, content] of Object.entries(protectedFiles)) put(root, "dist/client/" + filename, content);
  for (const filename of [...entries, ...manifests]) put(root, "dist/client/" + filename, "old " + filename);
  return root;
}
function artifact(source) {
  for (const entry of entries) put(source, "dist/global/" + entry,
    '<script type="module" src="/global-assets/assets/global-Ab12_cd9.js"></script><link rel="stylesheet" href="/global-assets/assets/global-12345678.css"><link rel="icon" href="/app-icon-192.png">');
  for (const manifest of manifests) put(source, "dist/global/" + manifest, JSON.stringify({ start_url: "/en/" }));
  put(source, "dist/global/assets/global-Ab12_cd9.js", "global code");
  put(source, "dist/global/assets/global-12345678.css", "global style");
  put(source, "dist/global/data/global-runtime.json", "global data");
  put(source, "dist/global/data/global/skill-query/catalog.json", "global skill query");
  // Copied only below the isolated namespace, never over the stable root or /pre/.
  put(source, "dist/global/index.html", "global child root");
  put(source, "dist/global/sw.js", "global child SW");
}
function expectProtected(root) {
  for (const [filename, content] of Object.entries(protectedFiles)) {
    expect(readFileSync(path.join(root, "dist/client", filename), "utf8"), filename).toBe(content);
  }
}
function expectNotAssembled(root) {
  expect(existsSync(path.join(root, "dist/client/global-assets"))).toBe(false);
  expect(readFileSync(path.join(root, "dist/client/en/index.html"), "utf8")).toBe("old en/index.html");
  expectProtected(root);
}
afterEach(() => {
  function removeLinks(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const filename = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) unlinkSync(filename);
      else if (entry.isDirectory()) removeLinks(filename);
    }
  }
  for (const root of roots.splice(0)) {
    requireInside(temporaryParent, realpathSync(root));
    removeLinks(root);
    rmSync(root, { recursive: true, force: false });
  }
  vi.restoreAllMocks();
});

describe("pinned Global release assembly", () => {
  test("requires a fixed full commit and rejects a dirty checkout outside output", () => {
    const root = fixture();
    expect(readGlobalReleasePin(root).sourceRevision).toBe(revision);
    for (const sourceRevision of [null, "main", "origin/main", "../source", "1234"]) {
      put(root, "config/global-release.json", JSON.stringify({ schemaVersion: 1, sourceRevision }));
      expect(() => readGlobalReleasePin(root)).toThrow("pinned full");
    }
    put(root, "config/global-release.json", JSON.stringify({ schemaVersion: 2, sourceRevision: revision }));
    expect(() => readGlobalReleasePin(root)).toThrow("pinned full");
    expect(() => copyGlobalRelease(root, path.join(root, "dirty-checkout"))).toThrow("escapes");
    expect(() => requireInside(root, root)).toThrow("escapes");
  });

  test("overlays only international entry HTML/manifests and isolates all built resources", () => {
    const root = fixture();
    const source = path.join(root, "output/global-source-fixture");
    artifact(source);
    const target = copyGlobalRelease(root, source);
    expect(target).toBe(path.join(root, "dist/client/global-assets"));
    for (const filename of [...entries, ...manifests]) {
      expect(readFileSync(path.join(root, "dist/client", filename), "utf8")).toBe(readFileSync(path.join(source, "dist/global", filename), "utf8"));
    }
    expect(readFileSync(path.join(target, "data/global-runtime.json"), "utf8")).toBe("global data");
    expect(readFileSync(path.join(target, "data/global/skill-query/catalog.json"), "utf8")).toBe("global skill query");
    expect(existsSync(path.join(root, "dist/client/assets/global-Ab12_cd9.js"))).toBe(false);
    expectProtected(root);
    expect(() => copyGlobalRelease(root, source)).toThrow("already exists");
  });

  test.each(manifests)("missing %s fails before any entry is overlaid", (manifest) => {
    const root = fixture();
    const source = path.join(root, "output/global-source-fixture");
    artifact(source);
    unlinkSync(path.join(source, "dist/global", manifest));
    expect(() => copyGlobalRelease(root, source)).toThrow("incomplete");
    expectNotAssembled(root);
  });

  test.each([
    '<script src="/assets/stable.js"></script>',
    '<link rel="modulepreload" href="/pre/assets/preview.js">',
    '<link rel="stylesheet" href="/assets/stable.css">',
    '<script src="assets/relative.js"></script>',
    '<script src="https://external.test/global-assets/assets/external.js"></script>',
    '<script src="/global-assets/assets/../../assets/stable.js"></script>',
  ])("mixed cross-version reference fails before copying: %s", (reference) => {
    const root = fixture();
    const source = path.join(root, "output/global-source-fixture");
    artifact(source);
    put(source, "dist/global/jp/index.html", '<script src="/global-assets/assets/global-Ab12_cd9.js"></script>' + reference);
    expect(() => copyGlobalRelease(root, source)).toThrow("does not reference isolated assets");
    expectNotAssembled(root);
  });

  test("an empty entry cannot pass preflight", () => {
    const root = fixture();
    const source = path.join(root, "output/global-source-fixture");
    artifact(source);
    put(source, "dist/global/jp/index.html", "not built");
    expect(() => copyGlobalRelease(root, source)).toThrow("does not reference isolated assets");
    expectNotAssembled(root);
  });

  test("an archived artifact parent cannot resolve outside its source", () => {
    const root = fixture();
    const source = path.join(root, "output/global-source-fixture");
    mkdirSync(source, { recursive: true });
    artifact(path.join(root, "elsewhere"));
    symlinkSync(path.join(root, "elsewhere/dist"), path.join(source, "dist"), process.platform === "win32" ? "junction" : "dir");
    expect(() => copyGlobalRelease(root, source)).toThrow("escapes");
    expectNotAssembled(root);
  });

  test("an existing linked destination cannot write through to another directory", () => {
    const root = fixture();
    const source = path.join(root, "output/global-source-fixture");
    artifact(source);
    put(root, "elsewhere/index.html", "untouched external destination");
    const jp = requireInside(root, path.join(root, "dist/client/jp"));
    unlinkSync(path.join(jp, "index.html"));
    // Only this known empty fixture directory is removed before replacing it with a junction.
    rmdirSync(jp);
    symlinkSync(path.join(root, "elsewhere"), jp, process.platform === "win32" ? "junction" : "dir");
    expect(() => copyGlobalRelease(root, source)).toThrow("destination cannot be a link");
    expect(readFileSync(path.join(root, "elsewhere/index.html"), "utf8")).toBe("untouched external destination");
    expectNotAssembled(root);
  });

  test.each([true, false])("builds only the pinned archive; commit locally available: %s", (available) => {
    const root = fixture();
    const calls = [];
    let commitChecks = 0;
    vi.spyOn(console, "log").mockImplementation(() => {});
    const run = (command, args, options) => {
      calls.push({ command, args, cwd: options.cwd });
      if (command === "git" && args[0] === "cat-file") return available || ++commitChecks > 1 ? 0 : 1;
      if (args.includes("config/vite.global.config.mjs")) artifact(options.cwd);
      return 0;
    };
    const result = buildGlobalRelease({ root, run });
    expect(result.sourceRevision).toBe(revision);
    expect(path.basename(result.source)).toMatch(new RegExp("^global-source-" + revision + "-"));
    const fetches = calls.filter(({ args }) => args[0] === "fetch");
    expect(fetches).toHaveLength(available ? 0 : 1);
    if (!available) expect(fetches[0].args).toEqual(["fetch", "--depth=1", "--no-tags", "--no-write-fetch-head", "origin", revision]);
    expect(calls.find(({ args }) => args[0] === "archive").args.at(-1)).toBe(revision);
    expect(calls.find(({ command }) => command === "tar").args.at(-1)).toBe(result.source);
    expect(calls.at(-1)).toEqual({ command: process.execPath, args: [path.join(root, "node_modules/vite/bin/vite.js"), "build", "--config", "config/vite.global.config.mjs", "--mode", "global"], cwd: result.source });
    expectProtected(root);
  });

  test("a child build failure stops assembly without fallback to a worktree", () => {
    const root = fixture();
    const run = (_command, args) => {
      if (args.includes("config/vite.global.config.mjs")) throw new Error("child build failed");
      return 0;
    };
    expect(() => buildGlobalRelease({ root, run })).toThrow("child build failed");
    expectNotAssembled(root);
  });
});
