import { afterEach, describe, expect, test } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildCnRelease, copyCnRelease } from "../../scripts/build-cn-release.mjs";
import { buildPreviewRelease, requireInside } from "../../scripts/build-preview-release.mjs";

const pin = "2f968be798e4c25182aa7144e176778ebbe1655a";
const temporaryParent = realpathSync(os.tmpdir());
const roots = [];
const put = (root, name, content = "") => {
  const filename = path.join(root, name);
  mkdirSync(path.dirname(filename), { recursive: true });
  writeFileSync(filename, content, "utf8");
};
function artifact(source, base = "/", label = "S5") {
  for (const entry of ["index.html", "dianlu/index.html"]) {
    put(source, "dist/client/" + entry, `<script src="${base}assets/app.js"></script>`);
  }
  put(source, "dist/client/assets/app.js", label);
  put(source, "dist/client/data/runtime.json", label);
  put(source, "dist/client/sw.js", "old source SW");
}
function fixture() {
  const root = mkdtempSync(path.join(temporaryParent, "roco-cn-build-test-"));
  roots.push(root);
  put(root, "config/preview-release.json", JSON.stringify({ schemaVersion: 1, sourceRevision: pin }));
  put(root, "node_modules/vite/bin/vite.js");
  put(root, "public/sw.js", "current release SW");
  artifact(root, "/", "old root");
  return root;
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

describe("pinned CN root release assembly", () => {
  test("refreshes only dist/client, removes stale outputs, and keeps the release tree's service worker", () => {
    const root = fixture();
    const source = path.join(root, "output/cn-source-fixture");
    artifact(source);
    put(root, "dist/client/pre/stale.html", "old preview");
    put(root, "dist/client/assets/stale.js", "old asset");
    put(root, "dist/keep.txt", "unrelated output");
    expect(copyCnRelease(root, source)).toBe(path.join(root, "dist/client"));
    expect(readFileSync(path.join(root, "dist/client/data/runtime.json"), "utf8")).toBe("S5");
    expect(readFileSync(path.join(root, "dist/client/sw.js"), "utf8")).toBe("current release SW");
    expect(readFileSync(path.join(source, "dist/client/sw.js"), "utf8")).toBe("old source SW");
    expect(readFileSync(path.join(root, "dist/keep.txt"), "utf8")).toBe("unrelated output");
    expect(existsSync(path.join(root, "dist/client/pre"))).toBe(false);
    expect(existsSync(path.join(root, "dist/client/assets/stale.js"))).toBe(false);
  });

  test("rejects a dirty checkout or missing source outside the output boundary", () => {
    const root = fixture();
    expect(() => copyCnRelease(root, path.join(root, "dirty-checkout"))).toThrow("escapes");
    expect(() => copyCnRelease(root, path.join(root, "output/missing"))).toThrow("missing");
    expect(readFileSync(path.join(root, "dist/client/data/runtime.json"), "utf8")).toBe("old root");
  });

  test("incomplete artifacts and a missing release SW preserve the previous build", () => {
    const root = fixture();
    const source = path.join(root, "output/cn-source-fixture");
    put(source, "dist/client/index.html", '<script src="/assets/app.js"></script>');
    expect(() => copyCnRelease(root, source)).toThrow("incomplete");
    artifact(source);
    unlinkSync(path.join(root, "public/sw.js"));
    expect(() => copyCnRelease(root, source)).toThrow("service worker is missing");
    expect(readFileSync(path.join(root, "dist/client/data/runtime.json"), "utf8")).toBe("old root");
  });

  test("wrong-base and already assembled artifacts cannot become the formal root", () => {
    const root = fixture();
    const source = path.join(root, "output/cn-source-fixture");
    artifact(source, "/pre/");
    expect(() => copyCnRelease(root, source)).toThrow("root /assets/");
    artifact(source);
    put(source, "dist/client/pre/index.html", "nested preview");
    expect(() => copyCnRelease(root, source)).toThrow("assembled preview");
    expect(readFileSync(path.join(root, "dist/client/data/runtime.json"), "utf8")).toBe("old root");
  });

  test.each(["source-parent", "artifact-child", "destination-parent", "destination"])("rejects %s junctions without following or deleting their target", (location) => {
    const root = fixture();
    const source = path.join(root, "output/cn-source-fixture");
    artifact(source);
    const external = path.join(root, "untouched");
    artifact(external, "/", "preserve me");
    const linkType = process.platform === "win32" ? "junction" : "dir";
    if (location === "source-parent") {
      // Replace only a verified fixture output before creating the deliberately unsafe parent.
      const childDist = requireInside(source, path.join(source, "dist"));
      rmSync(childDist, { recursive: true });
      symlinkSync(path.join(external, "dist"), childDist, linkType);
    } else if (location === "artifact-child") {
      symlinkSync(path.join(external, "dist/client/assets"), path.join(source, "dist/client/linked-assets"), linkType);
    } else {
      const relative = location === "destination" ? "dist/client" : "dist";
      const target = requireInside(root, path.join(root, relative));
      rmSync(target, { recursive: true });
      symlinkSync(path.join(external, relative), target, linkType);
    }
    expect(() => copyCnRelease(root, source)).toThrow(/link/u);
    expect(readFileSync(path.join(external, "dist/client/data/runtime.json"), "utf8")).toBe("preserve me");
  });

  test("refuses an unknown existing destination and supports an initially absent build", () => {
    const root = fixture();
    const source = path.join(root, "output/cn-source-fixture");
    artifact(source);
    unlinkSync(path.join(root, "dist/client/data/runtime.json"));
    put(root, "dist/client/keep.txt", "unrecognized material");
    expect(() => copyCnRelease(root, source)).toThrow("unrecognized");
    expect(readFileSync(path.join(root, "dist/client/keep.txt"), "utf8")).toBe("unrecognized material");
    const target = requireInside(root, path.join(root, "dist/client"));
    rmSync(target, { recursive: true });
    expect(copyCnRelease(root, source)).toBe(target);
    expect(readFileSync(path.join(target, "data/runtime.json"), "utf8")).toBe("S5");
  });

  test("CN and /pre export the same pin and build data before their isolated Vite modes", () => {
    const root = fixture();
    const calls = [];
    const run = (command, args, options) => {
      calls.push({ command, args, cwd: options.cwd });
      if (args.includes("config/vite.cn.config.mjs")) artifact(options.cwd);
      if (args.includes("config/vite.preview.config.mjs")) artifact(options.cwd, "/pre/");
      return 0;
    };
    const cn = buildCnRelease({ root, run });
    const pre = buildPreviewRelease({ root, run });
    expect(cn.sourceRevision).toBe(pin);
    expect(pre.sourceRevision).toBe(cn.sourceRevision);
    expect(cn.source).not.toBe(pre.source);
    expect(calls.filter(({ args }) => args[0] === "archive").map(({ args }) => args.at(-1))).toEqual([pin, pin]);
    expect(calls.map(({ args }) => args[0])).toEqual(Array(2).fill([
      "cat-file", "archive", "-xf", "scripts/runtime-snapshot.mjs", "scripts/build-skill-query-data.mjs",
      path.join(root, "node_modules/vite/bin/vite.js"),
    ]).flat());
    expect(calls.filter(({ args }) => args[1] === "build").map(({ args }) => args.slice(1))).toEqual([
      ["build", "--config", "config/vite.cn.config.mjs", "--mode", "cn"],
      ["build", "--config", "config/vite.preview.config.mjs", "--mode", "pre"],
    ]);
    expect(existsSync(path.join(root, "dist/client/pre/index.html"))).toBe(true);
    expect(readFileSync(path.join(root, "dist/client/sw.js"), "utf8")).toBe("current release SW");
  });

  test("a child build failure leaves formal root unchanged", () => {
    const root = fixture();
    const run = (_command, args) => {
      if (args.includes("config/vite.cn.config.mjs")) throw new Error("CN build failed");
      return 0;
    };
    expect(() => buildCnRelease({ root, run })).toThrow("CN build failed");
    expect(readFileSync(path.join(root, "dist/client/data/runtime.json"), "utf8")).toBe("old root");
  });

  test("release gates precede CN build, minification and budget; final asset checks follow /pre and global assembly", () => {
    const scripts = JSON.parse(readFileSync(path.resolve("package.json"), "utf8")).scripts;
    expect(scripts.build.split(" && ")).toEqual([
      "npm run acceptance:verify", "npm run data:runtime", "npm run data:verify-bindings -- --web-only",
      "node scripts/build-cn-release.mjs", "node scripts/minify-service-worker.mjs", "npm run performance:verify",
      "node scripts/build-preview-release.mjs", "node scripts/build-global-release.mjs", "node scripts/stamp-image-cache.mjs", "npm run web:verify-artifact",
    ]);
  });
});
