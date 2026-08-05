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
  clientTotal: 65 * 1024 * 1024,
  cssGzip: 24 * 1024,
  jsGzip: 190 * 1024,
  jsRaw: 650 * 1024,
  runtimeJson: 1.5 * 1024 * 1024,
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
  const violations = Object.entries(metrics)
    .filter(([key, actual]) => actual > limits[key])
    .map(([key, actual]) => ({ actual, key, limit: limits[key] }));

  return { metrics, violations };
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
      `${LABELS[violation.key]}超出预算：${formatBytes(violation.actual)} > ${formatBytes(violation.limit)}`,
    );
  }
  if (result.violations.length) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli();
}
