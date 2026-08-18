#!/usr/bin/env node
import { createHash } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  applyNamedPortraitAssets,
  fetchNamedPortraitAssets,
} from "./portrait-bindings.mjs";

const PROJECT_ROOT = path.resolve(import.meta.dirname, "../..");

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

function contentSha256(snapshot) {
  const value = structuredClone(snapshot);
  value.meta.contentSha256 = null;
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function applyToSnapshot(snapshot, assets, auditedAt) {
  const result = applyNamedPortraitAssets(snapshot.spirits, assets);
  const next = {
    ...snapshot,
    spirits: result.spirits,
    meta: {
      ...snapshot.meta,
      contentSha256: null,
      portraitBindings: {
        strategy: "exact-full-name-file-then-filter-row",
        resolved: result.resolved,
        fallback: result.fallback,
        auditedAt,
        source: "BWIKI MediaWiki imageinfo",
      },
    },
  };
  next.meta.contentSha256 = contentSha256(next);
  return { snapshot: next, ...result };
}

export async function applyPortraitBindings(
  sourcePath = path.join(PROJECT_ROOT, "public/data/current.json"),
) {
  const current = JSON.parse(await readFile(sourcePath, "utf8"));
  const assets = await fetchNamedPortraitAssets(current.spirits);
  const auditedAt = new Date().toISOString();
  const currentResult = applyToSnapshot(current, assets, auditedAt);
  const targets = [sourcePath];
  const seasonPath = path.join(
    PROJECT_ROOT,
    "public/data/seasons",
    `${current.meta.id}.json`,
  );
  if (path.resolve(seasonPath) !== path.resolve(sourcePath) && (await exists(seasonPath))) {
    const season = JSON.parse(await readFile(seasonPath, "utf8"));
    const seasonResult = applyToSnapshot(season, assets, auditedAt);
    await writeFile(seasonPath, `${JSON.stringify(seasonResult.snapshot, null, 2)}\n`, "utf8");
    targets.push(seasonPath);
  }
  await writeFile(
    sourcePath,
    `${JSON.stringify(currentResult.snapshot, null, 2)}\n`,
    "utf8",
  );
  return {
    resolved: currentResult.resolved,
    fallback: currentResult.fallback,
    targets,
  };
}

async function main() {
  const result = await applyPortraitBindings(process.argv[2]);
  console.log(`resolved=${result.resolved}`);
  console.log(`fallback=${result.fallback}`);
  console.log(`targets=${result.targets.length}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
