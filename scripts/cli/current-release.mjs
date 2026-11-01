import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { createServer } from "vite";
import { preparePreviewSource } from "../build-preview-release.mjs";
import { executeCli } from "../../src/cli/rock-calculator-cli.js";
import { loadWebCalculator } from "./web-calculator.mjs";

// Archive preparation must never pollute the machine-readable stdout or fetch
// new data implicitly. A checkout without the pinned commit gets an explicit error.
function runQuietly(command, args, { cwd, allowFailure = false } = {}) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0 && !allowFailure) throw new Error(result.stderr?.trim() || `CLI source preparation failed: ${command}`);
  return result.status;
}

export async function executeCurrentCli(argv, { cwd, projectRoot }) {
  // Global availability/schema is independent of the CN release source.
  // The protocol still validates duplicate flags and conflicting input server IDs.
  if (argv.some((arg, index) => arg === "--server" && argv[index + 1] === "global")) {
    return executeCli(argv, { cwd, projectRoot });
  }
  const pin = path.join(projectRoot, "config/preview-release.json");
  let source = projectRoot;
  let sourceMetadata = { sourceKind: "working-tree" };
  if (existsSync(pin)) {
    const prepared = preparePreviewSource({ root: projectRoot, run: runQuietly, mode: "cn", reuse: true, allowFetch: false });
    source = prepared.source;
    sourceMetadata = { sourceKind: "pinned-cn-release", sourceRevision: prepared.sourceRevision };
  } else if (!existsSync(path.join(source, "scripts/s5-bwiki-runtime.mjs"))) {
    throw new Error("当前 CLI 缺少国服发布 pin 或 S5 源码入口；请使用完整的当前发布工作区，不会退回旧快照");
  }
  const server = await createServer({ root: source, configFile: false, logLevel: "silent",
    server: { middlewareMode: true, watch: null, hmr: false, ws: false } });
  try {
    const { buildS5BwikiSnapshot } = await server.ssrLoadModule(path.join(source, "scripts/s5-bwiki-runtime.mjs"));
    const snapshotOverride = await buildS5BwikiSnapshot({ root: source, previewLoader: server });
    const calculateOverride = await loadWebCalculator(server, source);
    return executeCli(argv, { cwd, projectRoot, snapshotOverride, calculateOverride, sourceMetadata });
  } finally {
    await server.close();
  }
}
