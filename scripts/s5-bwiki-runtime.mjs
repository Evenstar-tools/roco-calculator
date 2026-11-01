import { readFile, writeFile, mkdir, unlink } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createServer } from "vite";
import { buildRuntimeSnapshot } from "./runtime-snapshot.mjs";
import { packS5RuntimeRelations } from "../src/data/s5-runtime-relations.js";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const readJson = async file => JSON.parse(await readFile(file, "utf8"));

/** Build the reviewed S5 payload for formal CN and /pre; Global and miniapp keep their data. */
export async function buildS5BwikiSnapshot({ root = ROOT, previewLoader, bindings } = {}) {
  const base = await readJson(path.join(root, "data/snapshots/current.json"));
  const evidence = await readJson(path.join(root, "data/reviewed/nrc-s5-20261101.json"));
  let loader = previewLoader, ownedServer;
  try {
    if (!loader) {
      ownedServer = await createServer({ root, configFile: false, logLevel: "error",
        server: { middlewareMode: true, watch: null } });
      loader = ownedServer;
    }
    const { withWebPreview } = await loader.ssrLoadModule(path.join(root, "src/features/s5-preview/with-web-preview.js"));
    const { applyS5Bwiki } = await loader.ssrLoadModule(path.join(root, "scripts/bwiki/apply-s5-bwiki.mjs"));
    const { applyS5Candymo } = await loader.ssrLoadModule(path.join(root, "scripts/bwiki/apply-s5-candymo.mjs"));
    const supplement = await readJson(path.join(root, "data/reviewed/candymo-s5-20261101.json"));
    const snapshot = applyS5Candymo(withWebPreview(applyS5Bwiki(withWebPreview(base), evidence)), supplement);
    const bindingsPath = path.join(root, "data/reviewed/s5-bwiki-assets-20261101.json");
    const assets = bindings ?? (existsSync(bindingsPath) ? await readJson(bindingsPath) : null);
    if (assets) {
      const entries = value => Array.isArray(value) ? value : Object.values(value ?? {});
      const spiritAssets = new Map(entries(assets.spirits).map(entry => [entry.nrcId, entry]));
      const skillAssets = new Map(entries(assets.skills).map(entry => [entry.nrcId, entry]));
      for (const spirit of snapshot.spirits) {
        const asset = spiritAssets.get(spirit.provenance?.nrc?.id);
        if (asset?.localUrl) spirit.asset = { ...spirit.asset, localUrl: asset.localUrl };
      }
      for (const skill of snapshot.skills) {
        const asset = skillAssets.get(skill.provenance?.nrc?.id);
        if (asset?.localUrl) skill.iconUrl = asset.localUrl;
      }
    }
    snapshot.meta = { ...snapshot.meta, seasonId: "S5", catalogVersion: snapshot.meta.s5NrcSync.version };
    return snapshot;
  } finally {
    if (ownedServer) await ownedServer.close();
  }
}

export async function buildS5BwikiRuntime(options = {}) {
  const root = options.root ?? ROOT;
  const snapshot = await buildS5BwikiSnapshot(options);
  const manifest = await readJson(path.join(root, "public/assets/spirits/manifest.json"));
  // Preserve explicitly bound S5 art instead of replacing it with an old manifest entry.
  const overrides = new Map(snapshot.spirits.filter(spirit => spirit.asset?.localUrl)
    .map(spirit => [spirit.id, spirit.asset.localUrl]));
  const assets = (manifest.assets ?? []).filter(asset => !overrides.has(asset.id));
  for (const [id, localFile] of overrides) assets.push({ id, localFile });
  const { identityAudit: _identityAudit, ...sync } = snapshot.meta.s5NrcSync;
  const runtime = buildRuntimeSnapshot({ ...snapshot,
    meta: { ...snapshot.meta, s5NrcSync: sync } }, { ...manifest, assets });
  const base = await readJson(path.join(root, "data/snapshots/current.json"));
  const previousPools = new Map(base.learnsets.map(pool => [pool.spiritId, pool]));
  const runtimePools = new Map(runtime.learnsets.map(pool => [pool.spiritId, pool]));
  for (const pool of snapshot.learnsets) {
    const previous = previousPools.get(pool.spiritId);
    const methods = Object.fromEntries(pool.skillIds.flatMap(id => {
      const current = pool.acquisitions?.[id] ?? [];
      const old = previous?.acquisitions?.[id] ?? [];
      return JSON.stringify(current) === JSON.stringify(old) ? [] : [[id, current]];
    }));
    if (Object.keys(methods).length) Object.assign(runtimePools.get(pool.spiritId),
      { acquisitions: methods, acquisitionsPartial: true });
  }
  return runtime;
}

export function s5BwikiRuntimePlugin() {
  let server;
  let runtimePromise;
  let stamp;
  const source = async () => {
    const nextStamp = ["data/snapshots/current.json", "data/reviewed/nrc-s5-20261101.json",
      "data/reviewed/s5-bwiki-assets-20261101.json", "scripts/bwiki/apply-s5-bwiki.mjs",
      "data/reviewed/candymo-s5-20261101.json", "scripts/bwiki/apply-s5-candymo.mjs",
      "data/candidates/candymo-hidden-spirits-20261101.json",
      "src/features/s5-preview/with-web-preview.js", "src/features/s5-preview/catalog.js",
      "data/reviewed/s5-official-video-20261031.json", "data/presets/s5-popular-configs.json"].map(file => {
      const target = path.join(ROOT, file);
      return existsSync(target) ? statSync(target).mtimeMs : 0;
    }).join(":");
    if (stamp !== nextStamp) { runtimePromise = undefined; stamp = nextStamp; }
    runtimePromise ??= buildS5BwikiRuntime({ previewLoader: server });
    try { return JSON.stringify(packS5RuntimeRelations(await runtimePromise)); }
    catch (error) { runtimePromise = undefined; throw error; }
  };
  return {
    name: "s5-bwiki-runtime",
    configureServer(viteServer) {
      server = viteServer;
      server.middlewares.use((request, response, next) => {
        if (!["GET", "HEAD"].includes(request.method) ||
            !["/data/runtime.json", "/pre/data/runtime.json"].includes(request.url?.split("?")[0])) return next();
        source().then(body => {
          response.setHeader("Content-Type", "application/json; charset=utf-8");
          response.setHeader("Cache-Control", "no-store");
          response.end(request.method === "HEAD" ? undefined : body);
        }).catch(next);
      });
    },
    async generateBundle() {
      this.emitFile({ type: "asset", fileName: "data/runtime.json", source: await source() });
    },
    async writeBundle(options) {
      // Formal CN and /pre both serve CN-only packages. Global has its independent release.
      const outDir = path.resolve(options.dir);
      if (outDir !== path.resolve(ROOT, "dist/client")) throw new Error("Unexpected S5 output directory");
      const unused = path.join(outDir, "data/global-runtime.json");
      if (existsSync(unused) && statSync(unused).isFile()) await unlink(unused);
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const output = process.argv[2];
  if (!output) throw new Error("Usage: node scripts/s5-bwiki-runtime.mjs <output.json>");
  const snapshot = await buildS5BwikiSnapshot();
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(snapshot)}\n`, "utf8");
  console.log(JSON.stringify({ output, spirits: snapshot.spirits.length, skills: snapshot.skills.length,
    version: snapshot.meta.s5NrcSync.version }));
}
