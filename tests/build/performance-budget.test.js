import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { verifyPerformanceBudget } from "../../scripts/verify-performance-budget.mjs";

const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { force: true, recursive: true });
  }
});

function fixture({ css = "body{}", js = "export default 1", runtime = "{}" } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), "rock-calculator-budget-"));
  roots.push(root);
  mkdirSync(path.join(root, "assets"), { recursive: true });
  mkdirSync(path.join(root, "data"), { recursive: true });
  writeFileSync(path.join(root, "assets", "app.js"), js);
  writeFileSync(path.join(root, "assets", "app.css"), css);
  writeFileSync(path.join(root, "data", "runtime.json"), runtime);
  return root;
}

describe("release performance budget", () => {
  test("accepts artifacts below every configured threshold", () => {
    const result = verifyPerformanceBudget({
      budgets: {
        clientTotal: 1_000,
        cssGzip: 1_000,
        jsGzip: 1_000,
        jsRaw: 1_000,
        runtimeJson: 1_000,
      },
      distRoot: fixture(),
    });

    expect(result.violations).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.metrics.jsRaw).toBeGreaterThan(0);
    expect(result.metrics.runtimeJson).toBe(2);
  });

  test("warns instead of blocking when an artifact only slightly exceeds its threshold", () => {
    const result = verifyPerformanceBudget({
      budgets: {
        clientTotal: 1_000,
        cssGzip: 1_000,
        jsGzip: 1_000,
        jsRaw: 8,
        runtimeJson: 1_000,
      },
      distRoot: fixture({ js: "1234567890" }),
      hardOverageBytes: 20,
      hardOverageByKey: {},
    });

    expect(result.warnings).toEqual([
      expect.objectContaining({ actual: 10, key: "jsRaw", limit: 8 }),
    ]);
    expect(result.violations).toEqual([]);
  });

  test("blocks when an artifact exceeds its threshold by more than the hard allowance", () => {
    const result = verifyPerformanceBudget({
      budgets: {
        clientTotal: 1_000,
        cssGzip: 1_000,
        jsGzip: 1_000,
        jsRaw: 8,
        runtimeJson: 1_000,
      },
      distRoot: fixture({ js: "12345678901234567890123456789" }),
      hardOverageBytes: 20,
      hardOverageByKey: {},
    });

    expect(result.warnings).toEqual([]);
    expect(result.violations).toEqual([
      expect.objectContaining({ actual: 29, key: "jsRaw", limit: 8 }),
    ]);
  });

  test("rejects a build without runtime data", () => {
    const root = mkdtempSync(path.join(tmpdir(), "rock-calculator-budget-"));
    roots.push(root);

    expect(() => verifyPerformanceBudget({ distRoot: root })).toThrow(
      "缺少运行时数据",
    );
  });
});
