import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
  DEFAULT_HARD_OVERAGE_BY_KEY,
  DEFAULT_PERFORMANCE_BUDGETS,
  verifyPerformanceBudget,
} from "../../scripts/verify-performance-budget.mjs";

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
  test("S4 总资源经确认扩容，超过 16 MiB 仍阻断", () => {
    expect(DEFAULT_PERFORMANCE_BUDGETS.clientTotal).toBe(13.5 * 1024 * 1024);
    expect(DEFAULT_PERFORMANCE_BUDGETS.clientTotal + DEFAULT_HARD_OVERAGE_BY_KEY.clientTotal).toBe(16 * 1024 * 1024);
    expect(DEFAULT_PERFORMANCE_BUDGETS.cssGzip).toBe(24 * 1024);
    expect(DEFAULT_PERFORMANCE_BUDGETS.runtimeJson).toBe(1.5 * 1024 * 1024);
    const root = fixture();
    const base = verifyPerformanceBudget({ distRoot: root }).metrics.clientTotal;
    writeFileSync(path.join(root, "assets", "test.bin"), Buffer.alloc(16 * 1024 * 1024 - base));
    expect(verifyPerformanceBudget({ distRoot: root }).violations).toEqual([]);
    writeFileSync(path.join(root, "assets", "test.bin"), Buffer.alloc(16 * 1024 * 1024 - base + 1));
    expect(verifyPerformanceBudget({ distRoot: root }).violations).toEqual([
      expect.objectContaining({ key: "clientTotal", hardLimit: 16 * 1024 * 1024 }),
    ]);
  });
  test("keeps JS warning baselines while allowing modest hard-limit growth", () => {
    expect(DEFAULT_PERFORMANCE_BUDGETS.jsGzip).toBe(236 * 1024);
    expect(
      DEFAULT_PERFORMANCE_BUDGETS.jsGzip + DEFAULT_HARD_OVERAGE_BY_KEY.jsGzip,
    ).toBe(304 * 1024);
    expect(DEFAULT_PERFORMANCE_BUDGETS.jsRaw).toBe(810 * 1024);
    expect(
      DEFAULT_PERFORMANCE_BUDGETS.jsRaw + DEFAULT_HARD_OVERAGE_BY_KEY.jsRaw,
    ).toBe(1024 * 1024);
  });

  test("原始 JS 恰好 1 MiB 通过，多 1 字节阻断", () => {
    const root = fixture({ js: "x".repeat(1024 * 1024) });
    expect(verifyPerformanceBudget({ distRoot: root }).violations).toEqual([]);
    writeFileSync(path.join(root, "assets", "app.js"), "x".repeat(1024 * 1024 + 1));
    expect(verifyPerformanceBudget({ distRoot: root }).violations).toEqual([
      expect.objectContaining({ key: "jsRaw", hardLimit: 1024 * 1024 }),
    ]);
  });

  test("gzip JS 在硬边界通过，超过边界 1 字节阻断", () => {
    const root = fixture({ js: randomBytes(400 * 1024).toString("hex") });
    const actual = verifyPerformanceBudget({ distRoot: root }).metrics.jsGzip;
    const budgets = { jsGzip: actual - DEFAULT_HARD_OVERAGE_BY_KEY.jsGzip };
    expect(verifyPerformanceBudget({ distRoot: root, budgets }).violations).toEqual([]);
    expect(verifyPerformanceBudget({ distRoot: root, budgets: { jsGzip: budgets.jsGzip - 1 } }).violations).toEqual([
      expect.objectContaining({ key: "jsGzip", actual, hardLimit: actual - 1 }),
    ]);
  });

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
