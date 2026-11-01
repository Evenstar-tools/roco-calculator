import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { createServer } from "vite";
import { preparePreviewSource } from "../build-preview-release.mjs";
import { prepareGlobalSource } from "../build-global-release.mjs";
import { executeCli, readCliInvocation } from "../../src/cli/rock-calculator-cli.js";
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
  const invocation = readCliInvocation(argv, { cwd });
  const { serverId } = invocation;
  const global = serverId === "global";
  const pin = path.join(projectRoot, global ? "config/global-release.json" : "config/preview-release.json");
  let source = projectRoot;
  let sourceMetadata = { sourceKind: "working-tree", serverId };
  if (existsSync(pin)) {
    const prepare = global ? prepareGlobalSource : preparePreviewSource;
    const prepared = prepare({ root: projectRoot, run: runQuietly, mode: "cn", reuse: true, allowFetch: false });
    source = prepared.source;
    sourceMetadata = { sourceKind: global ? "pinned-global-release" : "pinned-cn-release", sourceRevision: prepared.sourceRevision, serverId };
  } else if (global || !existsSync(path.join(source, "scripts/s5-bwiki-runtime.mjs"))) {
    if (global) throw new Error("当前 CLI 缺少国际服发布 pin；不会使用国服或历史快照代替");
    throw new Error("当前 CLI 缺少国服发布 pin 或 S5 源码入口；请使用完整的当前发布工作区，不会退回旧快照");
  }
  const server = await createServer({ root: source, configFile: false, logLevel: "silent",
    server: { middlewareMode: true, watch: null, hmr: false, ws: false } });
  try {
    let environmentOverride = await server.ssrLoadModule(path.join(source, "src/domain/server-environment.js"));
    // Schema describes both CLI routes, not the unrelated global registry kept
    // inside a CN source revision. Calculation still uses only its chosen pin.
    if (invocation.command === "schema" && !global && existsSync(path.join(projectRoot, "config/global-release.json"))) {
      const prepared = prepareGlobalSource({ root: projectRoot, run: runQuietly, reuse: true, allowFetch: false });
      const international = await server.ssrLoadModule(path.join(prepared.source, "src/domain/server-environment.js"));
      const national = environmentOverride;
      environmentOverride = { ...national,
        getServerRelease: requested => requested === "global" ? international.getServerRelease(requested) : national.getServerRelease(requested) };
    }
    let snapshotOverride;
    if (global) {
      const release = environmentOverride.getServerRelease(serverId);
      snapshotOverride = JSON.parse(readFileSync(path.join(source, release.snapshotPath), "utf8"));
    } else {
      const { buildS5BwikiSnapshot } = await server.ssrLoadModule(path.join(source, "scripts/s5-bwiki-runtime.mjs"));
      snapshotOverride = await buildS5BwikiSnapshot({ root: source, previewLoader: server });
    }
    const calculateOverride = await loadWebCalculator(server, source);
    const discoveryPath = path.join(source, "src/domain/spirit-discovery.js");
    const spiritDiscovery = existsSync(discoveryPath) ? await server.ssrLoadModule(discoveryPath) : undefined;
    return executeCli(argv, { cwd, projectRoot, snapshotOverride, calculateOverride, sourceMetadata, environmentOverride, spiritDiscovery, invocation });
  } finally {
    await server.close();
  }
}
