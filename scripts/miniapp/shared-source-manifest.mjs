import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

export const SHARED_SOURCE_MANIFEST_PATH =
  "scripts/miniapp/shared-source-manifest.mjs";

const MANIFEST_START = "/* SHARED_SOURCE_MANIFEST_START\n";
const MANIFEST_END = "\nSHARED_SOURCE_MANIFEST_END */";
const MANIFEST_SOURCE = `/* SHARED_SOURCE_MANIFEST_START
{
  "shared": [
    "src/domain/beast-flower-bloodline.js",
    "src/domain/calculate.js",
    "src/domain/calculator-view-model.js",
    "src/domain/choice-skill-sequence.js",
    "src/domain/constants.js",
    "src/domain/contract-shape.js",
    "src/domain/damage.js",
    "src/domain/fair-pigeon.js",
    "src/domain/marks.js",
    "src/domain/natures.js",
    "src/domain/refraction.js",
    "src/domain/skill-effects.js",
    "src/domain/skill-loadout.js",
    "src/domain/skill-rules.js",
    "src/domain/skill-slot-capacity.js",
    "src/domain/snapshot-indexes.js",
    "src/domain/skill-status-effects.js",
    "src/domain/stat.js",
    "src/domain/trait-effects.js",
    "src/domain/trait-hit-count.js",
    "src/domain/trait-damage.js",
    "src/domain/traits.js",
    "src/domain/trigger-controls.js",
    "src/domain/type-chart.js",
    "src/domain/wing-extension.js",
    "src/state/defaults.js",
    "src/state/battle-activation.js",
    "src/state/calculator-session.js",
    "src/state/reducer.js",
    "src/state/spirit-configs.js",
    "src/state/storage-namespace.js",
    "src/state/trigger-context.js",
    "src/state/trait-values.js"
  ],
  "webOnly": [
    "src/domain/element-colors.js"
  ]
}
SHARED_SOURCE_MANIFEST_END */`;

export function parseManifestSource(source) {
  const start = source.indexOf(MANIFEST_START);
  const end = source.indexOf(MANIFEST_END, start + MANIFEST_START.length);
  if (start < 0 || end < 0) {
    const legacy = source.match(
      /export const SHARED_SOURCE_MANIFEST = Object\.freeze\(\{\s*shared: Object\.freeze\(\[([\s\S]*?)\]\),\s*webOnly: Object\.freeze\(\[([\s\S]*?)\]\),\s*\}\);/u,
    );
    if (!legacy) {
      throw new Error("Shared source manifest markers are missing");
    }
    const parseLegacyArray = (entries) =>
      JSON.parse(`[${entries.replace(/,\s*$/u, "")}]`);
    return normalizeManifest({
      shared: parseLegacyArray(legacy[1]),
      webOnly: parseLegacyArray(legacy[2]),
    });
  }
  return normalizeManifest(
    JSON.parse(source.slice(start + MANIFEST_START.length, end)),
  );
}

const parsedManifest = parseManifestSource(MANIFEST_SOURCE);

export const SHARED_SOURCE_MANIFEST = Object.freeze({
  shared: Object.freeze(parsedManifest.shared),
  webOnly: Object.freeze(parsedManifest.webOnly),
});

export function mirrorPathFor(sourcePath) {
  assertSafeSourcePath(sourcePath);
  return `miniapp/src/shared/${sourcePath.replace(/^src\//, "")}`;
}

export function assertSafeSourcePath(sourcePath) {
  if (
    typeof sourcePath !== "string" ||
    !sourcePath.startsWith("src/") ||
    path.posix.isAbsolute(sourcePath) ||
    sourcePath.split("/").includes("..") ||
    sourcePath.includes("\\")
  ) {
    throw new Error(`Unsafe shared source path: ${String(sourcePath)}`);
  }
}

export function normalizeManifest(manifest = SHARED_SOURCE_MANIFEST) {
  const shared = [...(manifest.shared ?? [])];
  const webOnly = [...(manifest.webOnly ?? [])];
  for (const sourcePath of [...shared, ...webOnly]) {
    assertSafeSourcePath(sourcePath);
  }
  return { shared, webOnly };
}

export function getManifestCoverage({
  actualDomain,
  hasSource,
  manifest = SHARED_SOURCE_MANIFEST,
  repositoryRoot = process.cwd(),
} = {}) {
  const { shared, webOnly } = normalizeManifest(manifest);
  const domainFiles = actualDomain ?? readdirSync(
    path.join(repositoryRoot, "src/domain"),
    { withFileTypes: true },
  )
    .filter((entry) => entry.isFile() && entry.name.endsWith(".js"))
    .map((entry) => `src/domain/${entry.name}`)
    .sort();
  const sourceExists = hasSource ?? ((sourcePath) =>
    existsSync(path.join(repositoryRoot, sourcePath)));
  const allClassified = [...shared, ...webOnly];
  const counts = new Map();
  for (const sourcePath of allClassified) {
    counts.set(sourcePath, (counts.get(sourcePath) ?? 0) + 1);
  }
  const duplicates = [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([sourcePath]) => sourcePath)
    .sort();
  const classifiedDomain = new Set(
    allClassified.filter((sourcePath) => sourcePath.startsWith("src/domain/")),
  );
  const actualSet = new Set(domainFiles);

  return {
    duplicates,
    missing: allClassified
      .filter((sourcePath) =>
        sourcePath.startsWith("src/domain/")
          ? !actualSet.has(sourcePath)
          : !sourceExists(sourcePath),
      )
      .sort(),
    unclassified: domainFiles
      .filter((sourcePath) => !classifiedDomain.has(sourcePath))
      .sort(),
  };
}
