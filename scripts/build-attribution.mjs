import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { verifyPerformanceBudget } from "./verify-performance-budget.mjs";

const REPORT_PATH = "artifacts/build-attribution/latest.json";
const digest = (content) => createHash("sha256").update(content).digest("hex");

// Chunk gzip is measured independently, matching the existing budget. Module lengths
// are bundler estimates before final compression; never add them up as gzip savings.
export function summarizeBundle(bundle, root = process.cwd()) {
  const chunks = Object.values(bundle).filter((entry) => entry.type === "chunk").map((chunk) => ({
    file: chunk.fileName,
    entry: Boolean(chunk.isEntry),
    dynamicEntry: Boolean(chunk.isDynamicEntry),
    rawBytes: Buffer.byteLength(chunk.code),
    gzipBytes: gzipSync(chunk.code).byteLength,
    sha256: digest(chunk.code),
    imports: [...chunk.imports],
    dynamicImports: [...chunk.dynamicImports],
    modules: Object.entries(chunk.modules).map(([id, module]) => ({
      id: id.startsWith("\0") ? id : path.relative(root, id).replaceAll("\\", "/"),
      renderedLengthEstimate: Number.isFinite(module.renderedLength) ? module.renderedLength : null,
    })).sort((a, b) => (b.renderedLengthEstimate ?? 0) - (a.renderedLengthEstimate ?? 0) || a.id.localeCompare(b.id)),
  })).sort((a, b) => b.gzipBytes - a.gzipBytes || a.file.localeCompare(b.file));
  const byFile = new Map(chunks.map((chunk) => [chunk.file, chunk]));
  function closure(entry) {
    const visited = new Set();
    function visit(file) {
      if (visited.has(file) || !byFile.has(file)) return;
      visited.add(file);
      byFile.get(file).imports.forEach(visit);
    }
    visit(entry);
    return [...visited].sort();
  }
  const entryGroups = chunks.filter((chunk) => chunk.entry).map((entry) => {
    const files = closure(entry.file);
    return {
      entry: entry.file, files,
      rawBytes: files.reduce((sum, file) => sum + byFile.get(file).rawBytes, 0),
      gzipBytes: files.reduce((sum, file) => sum + byFile.get(file).gzipBytes, 0),
    };
  });
  return {
    schemaVersion: 1,
    measurement: "Static import closure; excludes dynamic imports and is not a browser network measurement. Chunk gzip values are exact; module lengths are attribution estimates only.",
    entryGroups, chunks,
    bundledJsGzipBytes: chunks.reduce((sum, chunk) => sum + chunk.gzipBytes, 0),
  };
}

export function buildAttributionPlugin() {
  let root;
  return {
    name: "rock-build-attribution",
    apply: "build",
    configResolved(config) { root = config.root; },
    writeBundle(_options, bundle) {
      const reportPath = path.join(root, REPORT_PATH);
      mkdirSync(path.dirname(reportPath), { recursive: true });
      writeFileSync(reportPath, JSON.stringify({ generatedAt: new Date().toISOString(), ...summarizeBundle(bundle, root) }, null, 2) + "\n");
    },
  };
}

export function readBuildAttribution(root = process.cwd()) {
  const report = JSON.parse(readFileSync(path.join(root, REPORT_PATH), "utf8"));
  for (const chunk of report.chunks) {
    const content = readFileSync(path.join(root, "dist/client", chunk.file));
    if (digest(content) !== chunk.sha256) throw new Error(`归因报告与构建文件不匹配，请重新构建：${chunk.file}`);
  }
  const budget = verifyPerformanceBudget({ distRoot: path.join(root, "dist/client") });
  return { ...report, budget, otherJsGzipBytes: budget.metrics.jsGzip - report.bundledJsGzipBytes };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = readBuildAttribution();
  if (process.argv.includes("--json")) console.log(JSON.stringify(report, null, 2));
  else {
    console.log("包体归因（不改变现有性能门禁）");
    for (const entry of report.entryGroups) console.log(`入口静态依赖 ${entry.entry}: ${(entry.gzipBytes / 1024).toFixed(2)} KiB gzip / ${entry.files.length} chunks`);
    console.log(`全部 JS: ${(report.budget.metrics.jsGzip / 1024).toFixed(2)} KiB gzip；非打包 JS（例如 SW）: ${report.otherJsGzipBytes} 字节`);
    for (const chunk of report.chunks.slice(0, 10)) {
      console.log(`${chunk.file}: ${(chunk.gzipBytes / 1024).toFixed(2)} KiB gzip`);
      for (const module of chunk.modules.slice(0, 3)) console.log(`  ${module.id}: ${module.renderedLengthEstimate ?? "未知"}（模块长度估算，非 gzip）`);
    }
    console.log(`完整报告：${REPORT_PATH}`);
  }
}
