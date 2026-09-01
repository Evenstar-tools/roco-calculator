import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

export const DEFAULT_PERFORMANCE_BUDGETS = Object.freeze({
  clientTotal: 13 * 1024 * 1024,
  cssGzip: 24 * 1024,
  // 2026-09-01 重校：核心拆分模块化开销 + 星陨功能（实测 JS gzip 198.53 KiB / JS 原始 683.03 KiB）
  jsGzip: 208 * 1024,
  jsRaw: 717 * 1024,
  runtimeJson: 1.5 * 1024 * 1024,
});

export const DEFAULT_HARD_OVERAGE_BYTES = 22 * 1024;
// 2026-09-01：JS gzip 阻断 228 KiB（+20）、JS 原始阻断 786 KiB（+69）；其余指标仍用上面的统一余量
export const DEFAULT_HARD_OVERAGE_BY_KEY = Object.freeze({
  jsGzip: 20 * 1024,
  jsRaw: 69 * 1024,
});

const LABELS = {
  clientTotal: "客户端总量",
  cssGzip: "CSS gzip 总量",
  jsGzip: "JS gzip 总量",
  jsRaw: "JS 原始总量",
  runtimeJson: "运行时数据",
};

function filesUnder(root) {
  if (!existsSync(root)) return [];
  const entries = [];
  for (const name of readdirSync(root)) {
    const target = path.join(root, name);
    if (statSync(target).isDirectory()) entries.push(...filesUnder(target));
    else entries.push(target);
  }
  return entries;
}

function byteSize(file) {
  return statSync(file).size;
}

function gzipSize(file) {
  return gzipSync(readFileSync(file)).byteLength;
}

export function verifyPerformanceBudget({
  budgets = DEFAULT_PERFORMANCE_BUDGETS,
  distRoot = path.resolve("dist/client"),
  hardOverageBytes = DEFAULT_HARD_OVERAGE_BYTES,
  hardOverageByKey = DEFAULT_HARD_OVERAGE_BY_KEY,
} = {}) {
  const limits = { ...DEFAULT_PERFORMANCE_BUDGETS, ...budgets };
  const runtimePath = path.join(distRoot, "data", "runtime.json");
  if (!existsSync(runtimePath)) {
    throw new Error(`缺少运行时数据：${runtimePath}`);
  }

  const files = filesUnder(distRoot);
  const jsFiles = files.filter((file) => file.endsWith(".js"));
  const cssFiles = files.filter((file) => file.endsWith(".css"));
  const metrics = {
    clientTotal: files.reduce((total, file) => total + byteSize(file), 0),
    cssGzip: cssFiles.reduce((total, file) => total + gzipSize(file), 0),
    jsGzip: jsFiles.reduce((total, file) => total + gzipSize(file), 0),
    jsRaw: jsFiles.reduce((total, file) => total + byteSize(file), 0),
    runtimeJson: byteSize(runtimePath),
  };
  const overages = Object.entries(metrics)
    .filter(([key, actual]) => actual > limits[key])
    .map(([key, actual]) => ({
      actual,
      hardLimit: limits[key] + (hardOverageByKey[key] ?? hardOverageBytes),
      key,
      limit: limits[key],
    }));
  const warnings = overages.filter(({ actual, hardLimit }) => actual <= hardLimit);
  const violations = overages.filter(({ actual, hardLimit }) => actual > hardLimit);

  return { metrics, violations, warnings };
}

function formatBytes(value) {
  return value >= 1024 * 1024
    ? `${(value / 1024 / 1024).toFixed(2)} MiB`
    : `${(value / 1024).toFixed(2)} KiB`;
}

function runCli() {
  const result = verifyPerformanceBudget({
    distRoot: path.resolve(process.argv[2] ?? "dist/client"),
  });
  for (const [key, actual] of Object.entries(result.metrics)) {
    console.log(
      `${LABELS[key]}：${formatBytes(actual)} / ${formatBytes(DEFAULT_PERFORMANCE_BUDGETS[key])}`,
    );
  }
  for (const violation of result.violations) {
    console.error(
      `${LABELS[violation.key]}超出硬门禁：${formatBytes(violation.actual)} > ${formatBytes(violation.hardLimit)}（基线 ${formatBytes(violation.limit)}）`,
    );
  }
  for (const warning of result.warnings) {
    console.warn(
      `${LABELS[warning.key]}小幅超出基线，仅警告：${formatBytes(warning.actual)} > ${formatBytes(warning.limit)}；达到 ${formatBytes(warning.hardLimit)} 才阻塞`,
    );
  }
  if (result.violations.length) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli();
}
