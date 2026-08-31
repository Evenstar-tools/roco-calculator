import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { fetchRevisions } from "./fetch-page.mjs";

const PROJECT_ROOT = path.resolve(import.meta.dirname, "../..");
const DEFAULT_SNAPSHOT = path.join(PROJECT_ROOT, "public/data/current.json");
const DEFAULT_CSV = path.join(
  PROJECT_ROOT,
  "data/sources/rocom_world_s3_spirits.csv",
);
const DEFAULT_DETAIL_CACHE = path.join(PROJECT_ROOT, "data/sources/bwiki_cache");

export function buildSourceUpdateReport({
  baseline,
  current,
  inputs,
  checkedAt = new Date().toISOString(),
}) {
  const changes = ["spiritFilter", "skillFilter"].flatMap((source) =>
    baseline[source] === current[source]
      ? []
      : [{
          source,
          previousRevision: baseline[source],
          currentRevision: current[source],
        }],
  );
  const updateDetected = changes.length > 0;

  return {
    status: updateDetected ? "changed" : "unchanged",
    updateDetected,
    buildReady: updateDetected && inputs.csv && inputs.detailCache,
    checkedAt,
    baseline,
    current,
    inputs,
    changes,
  };
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function checkSourceUpdates(options = {}) {
  const snapshotPath = options.snapshotPath ?? DEFAULT_SNAPSHOT;
  const csvPath = options.csvPath ?? process.env.ROCOM_S3_CSV ?? DEFAULT_CSV;
  const detailCachePath =
    options.detailCachePath ?? process.env.ROCOM_BWIKI_CACHE ?? DEFAULT_DETAIL_CACHE;
  const snapshot = JSON.parse(await readFile(snapshotPath, "utf8"));
  const revisions = await (options.fetchRevisionsFn ?? fetchRevisions)([
    "精灵筛选",
    "技能筛选",
  ]);

  const baseline = {
    snapshotId: snapshot.meta?.id ?? null,
    spiritFilter: snapshot.meta?.revisions?.spiritFilter ?? null,
    skillFilter: snapshot.meta?.revisions?.skillFilter ?? null,
  };
  const current = {
    spiritFilter: revisions["精灵筛选"]?.revision ?? null,
    skillFilter: revisions["技能筛选"]?.revision ?? null,
  };
  if (
    !Number.isInteger(baseline.spiritFilter) ||
    !Number.isInteger(baseline.skillFilter) ||
    !Number.isInteger(current.spiritFilter) ||
    !Number.isInteger(current.skillFilter)
  ) {
    throw new Error("无法取得完整的精灵筛选与技能筛选修订号");
  }

  return buildSourceUpdateReport({
    baseline,
    current,
    inputs: {
      csv: await exists(csvPath),
      detailCache: await exists(detailCachePath),
      csvPath,
      detailCachePath,
    },
  });
}

function formatReport(report) {
  const changes = report.changes.length === 0
    ? "none"
    : report.changes
      .map((change) =>
        `${change.source}:${change.previousRevision}->${change.currentRevision}`,
      )
      .join(",");
  return [
    `status=${report.status}`,
    `snapshot=${report.baseline.snapshotId}`,
    `changes=${changes}`,
    `csv=${report.inputs.csv ? "ready" : "missing"}`,
    `detailCache=${report.inputs.detailCache ? "ready" : "missing"}`,
    `buildReady=${report.buildReady}`,
    `checkedAt=${report.checkedAt}`,
  ].join("\n");
}

async function main() {
  const report = await checkSourceUpdates();
  console.log(
    process.argv.includes("--json")
      ? JSON.stringify(report)
      : formatReport(report),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
