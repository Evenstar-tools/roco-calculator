import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { preparePreviewSource } from "../build-preview-release.mjs";
import { createServer } from "vite";

export const MINIAPP_RELEASE_PIN_PATH = "config/miniapp-release.json";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** The miniapp pin is independent of Web; never borrow a dirty checkout. */
export function prepareMiniappSource({ root = ROOT, ...options } = {}) {
  if (!existsSync(path.join(root, MINIAPP_RELEASE_PIN_PATH))) {
    return { source: root, sourceRevision: null };
  }
  return preparePreviewSource({ root, mode: "miniapp", reuse: true,
    allowFetch: false, pinFile: MINIAPP_RELEASE_PIN_PATH, ...options });
}

export async function loadMiniappReleaseData(options = {}) {
  const release = prepareMiniappSource(options);
  if (!release.sourceRevision) throw new Error("Miniapp runtime requires its own release pin");
  const [{ buildS5BwikiRuntime }, { buildS5PopularConfigLibrary }, { withCalculatorExtras }] =
    await Promise.all([
      import(pathToFileURL(path.join(release.source, "scripts/s5-bwiki-runtime.mjs"))),
      import(pathToFileURL(path.join(release.source, "scripts/s5-preview-presets.mjs"))),
      import(pathToFileURL(path.join(release.source, "src/data/snapshot-extras.js"))),
    ]);
  const loader = await createServer({ root: release.source, configFile: false, logLevel: "error",
    server: { middlewareMode: true, watch: null, hmr: false, ws: false } });
  try {
    const runtime = withCalculatorExtras(await buildS5BwikiRuntime({ root: release.source, previewLoader: loader }));
    return { ...release, runtime, presets: buildS5PopularConfigLibrary(runtime) };
  } finally {
    await loader.close();
  }
}
