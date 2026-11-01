import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

export const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
// Node loads the archived ESM source directly. Vite 4 otherwise rewrites Windows
// file URLs outside the miniapp root into unresolvable drive-relative imports.
const requireNative = createRequire(import.meta.url);
const { loadMiniappReleaseData, prepareMiniappSource } = requireNative(
  path.join(repositoryRoot, "scripts/miniapp/release-source.mjs"));
export const releaseSource = prepareMiniappSource({ root: repositoryRoot });
export const { calculateMatchup: pinnedWebCalculate } = requireNative(
  path.join(releaseSource.source, "src/domain/calculate.js"));
let releaseData;
export function getReleaseData() {
  return releaseData ??= loadMiniappReleaseData({ root: repositoryRoot });
}
