import { afterEach, describe, expect, test } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { buildPreviewRelease, copyPreviewRelease, preparePreviewSource, readPreviewReleasePin, requireInside } from "../../scripts/build-preview-release.mjs";

const pin = "2f968be798e4c25182aa7144e176778ebbe1655a";
const temporaryParent = realpathSync(os.tmpdir());
const roots = [];
function put(root, name, content = "") {
  const filename = path.join(root, name);
  mkdirSync(path.dirname(filename), { recursive: true });
  writeFileSync(filename, content, "utf8");
}
function fixture() {
  const root = mkdtempSync(path.join(temporaryParent, "roco-preview-build-test-"));
  roots.push(root);
  put(root, "config/preview-release.json", JSON.stringify({ schemaVersion: 1, sourceRevision: pin }));
  put(root, "node_modules/vite/bin/vite.js");
  put(root, "dist/client/index.html", "stable root");
  put(root, "dist/client/sw.js", "stable SW");
  put(root, "dist/client/data/runtime.json", "stable data");
  put(root, "dist/client/assets/stable.js", "stable asset");
  return root;
}
function artifact(source) {
  put(source, "dist/client/index.html", '<script src="/pre/assets/preview.js"></script>');
  put(source, "dist/client/dianlu/index.html", '<script src="/pre/assets/preview.js"></script>');
  put(source, "dist/client/assets/preview.js", "preview code");
  put(source, "dist/client/data/runtime.json", "preview data");
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
});

describe("pinned /pre release assembly", () => {
  test("miniapp archives its independent pin without changing or borrowing the Web pin", () => {
    const root = fixture();
    const miniappPin = "b4b2288340dc50b43d3b4dd9fce206512481e23a";
    put(root, "config/miniapp-release.json", JSON.stringify({ schemaVersion: 1, sourceRevision: miniappPin }));
    const calls = [];
    const run = (command, args) => {
      calls.push({ command, args });
      if (command === "tar") put(args[3], "scripts/s5-bwiki-runtime.mjs", "// archived runtime");
      return 0;
    };
    const result = preparePreviewSource({ root, run, mode: "miniapp", reuse: true,
      allowFetch: false, pinFile: "config/miniapp-release.json" });
    expect(result.sourceRevision).toBe(miniappPin);
    expect(path.basename(result.source)).toMatch(new RegExp("^miniapp-source-" + miniappPin));
    expect(readPreviewReleasePin(root).sourceRevision).toBe(pin);
    expect(calls.find(({ args }) => args[0] === "archive").args.at(-1)).toBe(miniappPin);
    expect(existsSync(path.join(root, "output/miniapp-source-" + miniappPin + ".json"))).toBe(true);
    expect(() => readPreviewReleasePin(root, "../outside.json")).toThrow("escapes");
  });
  test("CLI reuses only the same release pin and prepares a new source when the pin changes", () => {
    const root = fixture();
    const calls = [];
    const run = (command, args) => {
      calls.push({ command, args });
      if (command === "tar") put(args[3], "scripts/s5-bwiki-runtime.mjs", "// archived runtime");
      return 0;
    };
    const first = preparePreviewSource({ root, run, reuse: true, allowFetch: false });
    const cached = preparePreviewSource({ root, run, reuse: true, allowFetch: false });
    expect(cached).toEqual(first);
    expect(calls.filter(({ command }) => command === "tar")).toHaveLength(1);
    const nextPin = "b4b2288340dc50b43d3b4dd9fce206512481e23a";
    put(root, "config/preview-release.json", JSON.stringify({ schemaVersion: 1, sourceRevision: nextPin }));
    const next = preparePreviewSource({ root, run, reuse: true, allowFetch: false });
    expect(next.sourceRevision).toBe(nextPin);
    expect(next.source).not.toBe(first.source);
    expect(calls.filter(({ args }) => args[0] === "archive").map(({ args }) => args.at(-1))).toEqual([pin, nextPin]);
    expect(calls.some(({ args }) => args[0] === "fetch")).toBe(false);
  });

  test("offline CLI preparation fails on a missing pin without fetching or falling back", () => {
    const root = fixture();
    const calls = [];
    const run = (command, args) => { calls.push({ command, args }); return 1; };
    expect(() => preparePreviewSource({ root, run, reuse: true, allowFetch: false })).toThrow("Pinned CN source is missing locally");
    expect(calls.map(({ args }) => args[0])).toEqual(["cat-file"]);
    expect(existsSync(path.join(root, "output/cli-source-" + pin + ".json"))).toBe(false);
  });

  test("pin rejects branch names/null and cannot escape the output boundary", () => {
    const root = fixture();
    expect(readPreviewReleasePin(root).sourceRevision).toBe(pin);
    for (const sourceRevision of [null, "main", "../source", "1234"]) {
      put(root, "config/preview-release.json", JSON.stringify({ schemaVersion: 1, sourceRevision }));
      expect(() => readPreviewReleasePin(root)).toThrow("pinned full");
    }
    expect(() => requireInside(path.join(root, "output"), root)).toThrow("escapes");
    expect(() => copyPreviewRelease(root, path.join(root, "dirty-checkout"))).toThrow("escapes");
  });

  test("assembly copies only pre and preserves stable index/data/SW/assets", () => {
    const root = fixture();
    const source = path.join(root, "output/preview-source-fixture");
    artifact(source);
    expect(copyPreviewRelease(root, source)).toBe(path.join(root, "dist/client/pre"));
    expect(readFileSync(path.join(root, "dist/client/pre/data/runtime.json"), "utf8")).toBe("preview data");
    expect(existsSync(path.join(root, "dist/client/pre/dianlu/index.html"))).toBe(true);
    expect(readFileSync(path.join(root, "dist/client/index.html"), "utf8")).toBe("stable root");
    expect(readFileSync(path.join(root, "dist/client/sw.js"), "utf8")).toBe("stable SW");
    expect(readFileSync(path.join(root, "dist/client/data/runtime.json"), "utf8")).toBe("stable data");
    expect(readFileSync(path.join(root, "dist/client/assets/stable.js"), "utf8")).toBe("stable asset");
    expect(() => copyPreviewRelease(root, source)).toThrow("already exists");
  });

  test("retired preview entry redirects to the same-origin root with query/hash and keeps its historical assets", () => {
    const root = fixture();
    const source = path.join(root, "output/preview-source-fixture");
    artifact(source);
    const target = copyPreviewRelease(root, source);
    const html = readFileSync(path.join(target, "index.html"), "utf8");
    const scriptPath = /<script\s+src="([^"]+)"\s*><\/script>/u.exec(html)?.[1];
    expect(scriptPath).toBe("/pre/redirect.js");
    expect(html).not.toContain("/pre/assets/");
    expect(html).toContain('<a href="/">');
    const script = readFileSync(path.join(root, "dist/client", scriptPath.slice(1)), "utf8");
    for (const entry of ["/pre", "/pre/", "/pre/index.html"]) {
      for (const suffix of ["", "?source=pwa&theme=s5#v2.cn.zh-CN.saved", "#saved", "?next=https%3A%2F%2Fother.test"]) {
        for (const origin of ["https://calculator.test", "app://calculator"]) {
          const current = new URL(origin + entry + suffix);
          let replaced;
          vm.runInNewContext(script, { location: { search: current.search, hash: current.hash, replace: (url) => { replaced = url; } } });
          expect(new URL(replaced, current).href).toBe(origin + "/" + suffix);
        }
      }
    }
    expect(readFileSync(path.join(target, "assets/preview.js"), "utf8")).toBe("preview code");
    expect(readFileSync(path.join(target, "data/runtime.json"), "utf8")).toBe("preview data");
    expect(readFileSync(path.join(target, "dianlu/index.html"), "utf8")).toContain("/pre/assets/preview.js");
    expect(readFileSync(path.join(source, "dist/client/index.html"), "utf8")).toContain("/pre/assets/preview.js");
  });

  test("incomplete, wrong-base or nested-pre artifacts fail without copying", () => {
    const root = fixture();
    const source = path.join(root, "output/preview-source-fixture");
    put(source, "dist/client/index.html", "not built");
    expect(() => copyPreviewRelease(root, source)).toThrow("incomplete");
    artifact(source);
    put(source, "dist/client/index.html", '<script src="/assets/root.js"></script>');
    expect(() => copyPreviewRelease(root, source)).toThrow("does not reference");
    artifact(source);
    put(source, "dist/client/pre/index.html", "unexpected nesting");
    expect(() => copyPreviewRelease(root, source)).toThrow("nested pre");
    expect(existsSync(path.join(root, "dist/client/pre"))).toBe(false);
  });

  test("a linked artifact parent cannot escape the freshly archived source", () => {
    const root = fixture();
    const source = path.join(root, "output/preview-source-fixture");
    mkdirSync(source, { recursive: true });
    artifact(path.join(root, "elsewhere"));
    symlinkSync(path.join(root, "elsewhere/dist"), path.join(source, "dist"), process.platform === "win32" ? "junction" : "dir");
    expect(() => copyPreviewRelease(root, source)).toThrow("escapes");
    expect(existsSync(path.join(root, "dist/client/pre"))).toBe(false);
  });

  test("orchestration fetches only a missing fixed commit, exports fresh source, then builds and assembles", () => {
    const root = fixture();
    const calls = [];
    let commitChecks = 0;
    let source;
    const run = (command, args, options) => {
      calls.push({ command, args, cwd: options.cwd });
      if (command === "git" && args[0] === "cat-file") return ++commitChecks === 1 ? 1 : 0;
      if (command === "tar") source = args[3];
      if (args.includes("config/vite.preview.config.mjs")) artifact(options.cwd);
      return 0;
    };
    const result = buildPreviewRelease({ root, run });
    expect(result.sourceRevision).toBe(pin);
    expect(path.basename(source)).toMatch(new RegExp("^preview-source-" + pin + "-"));
    expect(calls.map(({ args }) => args[0])).toEqual([
      "cat-file", "fetch", "cat-file", "archive", "-xf",
      "scripts/runtime-snapshot.mjs", "scripts/build-skill-query-data.mjs",
      path.join(root, "node_modules/vite/bin/vite.js"),
    ]);
    expect(calls.find(({ args }) => args[0] === "fetch").args).toEqual([
      "fetch", "--depth=1", "--no-tags", "--no-write-fetch-head", "origin", pin,
    ]);
    expect(calls.find(({ args }) => args[0] === "archive").args.at(-1)).toBe(pin);
    expect(calls.at(-1).args.slice(1)).toEqual(["build", "--config", "config/vite.preview.config.mjs", "--mode", "pre"]);
    expect(existsSync(path.join(root, "dist/client/pre/index.html"))).toBe(true);
  });

  test("a child failure stops assembly, does not fall back to any worktree or touch stable output", () => {
    const root = fixture();
    const run = (command, args) => {
      if (args[0] === "scripts/runtime-snapshot.mjs") throw new Error("fixture child failed");
      return 0;
    };
    expect(() => buildPreviewRelease({ root, run })).toThrow("fixture child failed");
    expect(existsSync(path.join(root, "dist/client/pre"))).toBe(false);
    expect(readFileSync(path.join(root, "dist/client/index.html"), "utf8")).toBe("stable root");
  });
});
