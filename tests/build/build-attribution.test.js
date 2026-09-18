import { expect, test } from "vitest";
import { gzipSync } from "node:zlib";
import { readFileSync } from "node:fs";
import { summarizeBundle } from "../../scripts/build-attribution.mjs";
import { DEFAULT_HARD_OVERAGE_BY_KEY, DEFAULT_PERFORMANCE_BUDGETS } from "../../scripts/verify-performance-budget.mjs";

const chunk = (fileName, options = {}) => ({
  type: "chunk", fileName, code: `export const name = ${JSON.stringify(fileName)};`,
  imports: [], dynamicImports: [], modules: {}, ...options,
});

test("entry attribution follows transitive static imports once and excludes lazy chunks", () => {
  const bundle = {
    main: chunk("main.js", { isEntry: true, imports: ["a.js", "shared.js"], dynamicImports: ["lazy.js"] }),
    a: chunk("a.js", { imports: ["shared.js"] }),
    shared: chunk("shared.js", { imports: ["a.js"] }),
    lazy: chunk("lazy.js", { isDynamicEntry: true, imports: ["shared.js"] }),
    css: { type: "asset", fileName: "main.css", source: "body{}" },
  };
  const before = JSON.stringify(bundle);
  const report = summarizeBundle(bundle);
  expect(report.entryGroups[0].files).toEqual(["a.js", "main.js", "shared.js"]);
  expect(report.entryGroups[0].gzipBytes).toBe([bundle.main, bundle.a, bundle.shared].reduce((sum, item) => sum + gzipSync(item.code).byteLength, 0));
  expect(report.chunks).toHaveLength(4);
  expect(report.bundledJsGzipBytes).toBe(report.chunks.reduce((sum, item) => sum + item.gzipBytes, 0));
  expect(JSON.stringify(bundle)).toBe(before);
});

test("module estimates are labeled separately from measured chunk gzip", () => {
  const report = summarizeBundle({ main: chunk("main.js", { isEntry: true, modules: { virtual: { renderedLength: 99 }, missing: {} } }) });
  expect(report.chunks[0].modules.map((item) => item.renderedLengthEstimate)).toEqual([99, null]);
  expect(report.chunks[0].sha256).toMatch(/^[a-f0-9]{64}$/);
  expect(report.measurement).toContain("not a browser network measurement");
});

test("multiple entries get independent closures without counting dynamic-only entries", () => {
  const report = summarizeBundle({ one: chunk("one.js", { isEntry: true }), two: chunk("two.js", { isEntry: true }), lazy: chunk("lazy.js", { isDynamicEntry: true }) });
  expect(report.entryGroups).toHaveLength(2);
  expect(report.entryGroups.map((item) => item.files)).toEqual(expect.arrayContaining([["one.js"], ["two.js"]]));
});

test("release checklist CSS threshold matches the executable budget", () => {
  const warning = DEFAULT_PERFORMANCE_BUDGETS.cssGzip / 1024;
  const hard = (DEFAULT_PERFORMANCE_BUDGETS.cssGzip + DEFAULT_HARD_OVERAGE_BY_KEY.cssGzip) / 1024;
  expect(readFileSync("docs/maintenance/release-checklist.md", "utf8")).toContain(`CSS gzip ${warning}／${hard} KiB`);
});
