import { mkdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";

const COLLECTIONS = ["spirits", "skills", "traits", "learnsets"];
const USAGE = "node scripts/bwiki/compare-season-snapshots.mjs --before <snapshot.json> --after <snapshot.json> --output <report.json>";
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const copy = (value) => structuredClone(value);

// Presence is explicit: a missing field must not become null, zero or an empty list.
function fieldValue(object, key) {
  return Object.hasOwn(object, key)
    ? { present: true, value: copy(object[key]) }
    : { present: false };
}

function fieldChanges(before, after, prefix = []) {
  const changes = [];
  for (const key of [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()) {
    const previous = fieldValue(before, key);
    const next = fieldValue(after, key);
    if (isDeepStrictEqual(previous, next)) continue;
    const fieldPath = [...prefix, key];
    if (previous.present && next.present && isObject(previous.value) && isObject(next.value)) {
      changes.push(...fieldChanges(previous.value, next.value, fieldPath));
    } else {
      changes.push({ path: fieldPath, before: previous, after: next });
    }
  }
  return changes;
}

function snapshotIdentity(snapshot, label) {
  if (!isObject(snapshot) || !isObject(snapshot.meta)) {
    throw new Error(`${label}: snapshot.meta must be an object`);
  }
  const metaServer = snapshot.meta.serverId;
  const rootServer = snapshot.serverId;
  if (metaServer !== undefined && rootServer !== undefined && metaServer !== rootServer) {
    throw new Error(`${label}: conflicting serverId declarations`);
  }
  // Existing CN snapshots predate server declarations; match the runtime's legacy contract.
  const serverId = metaServer ?? rootServer ?? "cn";
  if (!["cn", "global"].includes(serverId) || metaServer === null || rootServer === null) {
    throw new Error(`${label}: unsupported serverId`);
  }
  const dataVersion = snapshot.meta.id ?? snapshot.meta.dataVersion ?? snapshot.meta.version;
  if (typeof dataVersion !== "string" || !dataVersion.trim()) {
    throw new Error(`${label}: missing data version`);
  }
  const identity = {
    serverId,
    serverDeclaration: metaServer === undefined && rootServer === undefined ? "legacy-cn" : "explicit",
    dataVersion,
  };
  for (const key of ["seasonId", "rulesVersion", "ruleVersion", "snapshotVersion"]) {
    if (Object.hasOwn(snapshot.meta, key)) identity[key] = copy(snapshot.meta[key]);
  }
  return identity;
}

function indexCollection(snapshot, collection, label) {
  const rows = snapshot[collection];
  if (!Array.isArray(rows)) throw new Error(`${label}: ${collection} must be an array`);
  const idKey = collection === "learnsets" ? "spiritId" : "id";
  const index = new Map();
  for (const row of rows) {
    const id = row?.[idKey];
    if (!isObject(row) || typeof id !== "string" || !id.trim()) {
      throw new Error(`${label}: ${collection} contains a missing ${idKey}`);
    }
    if (index.has(id)) throw new Error(`${label}: duplicate ${collection} ${idKey}: ${id}`);
    if (collection === "learnsets" && (!Array.isArray(row.skillIds) || row.skillIds.some((skillId) => typeof skillId !== "string"))) {
      throw new Error(`${label}: learnset ${id} skillIds must be an array of strings`);
    }
    index.set(id, row);
  }
  return index;
}

function compareCollection(before, after, collection) {
  const previous = indexCollection(before, collection, "before");
  const next = indexCollection(after, collection, "after");
  const result = { added: [], removed: [], renamed: [], changed: [] };
  const idKey = collection === "learnsets" ? "spiritId" : "id";
  const nameKey = collection === "spirits" ? "fullName" : "name";
  for (const id of [...new Set([...previous.keys(), ...next.keys()])].sort()) {
    if (!previous.has(id)) {
      result.added.push(copy(next.get(id)));
      continue;
    }
    if (!next.has(id)) {
      result.removed.push(copy(previous.get(id)));
      continue;
    }
    const oldRow = previous.get(id);
    const newRow = next.get(id);
    const fields = fieldChanges(oldRow, newRow);
    if (!fields.length) continue;
    const entry = { [idKey]: id, fields };
    if (collection === "learnsets") {
      entry.skillIds = {
        added: [...new Set(newRow.skillIds.filter((skillId) => !oldRow.skillIds.includes(skillId)))].sort(),
        removed: [...new Set(oldRow.skillIds.filter((skillId) => !newRow.skillIds.includes(skillId)))].sort(),
      };
    } else if (Object.hasOwn(oldRow, nameKey) && Object.hasOwn(newRow, nameKey) && oldRow[nameKey] !== newRow[nameKey]) {
      result.renamed.push({ id, before: copy(oldRow[nameKey]), after: copy(newRow[nameKey]) });
    }
    result.changed.push(entry);
  }
  if (collection === "learnsets") delete result.renamed;
  return result;
}

export function compareSeasonSnapshots(before, after) {
  const beforeIdentity = snapshotIdentity(before, "before");
  const afterIdentity = snapshotIdentity(after, "after");
  if (beforeIdentity.serverId !== afterIdentity.serverId) {
    throw new Error("Cannot compare snapshots from different servers");
  }
  const report = {
    schemaVersion: 1,
    before: beforeIdentity,
    after: afterIdentity,
  };
  for (const collection of COLLECTIONS) {
    report[collection] = compareCollection(before, after, collection);
  }
  report.metadataChanges = fieldChanges(before.meta, after.meta);
  const otherFields = (snapshot) => Object.fromEntries(
    Object.entries(snapshot).filter(([key]) => key !== "meta" && !COLLECTIONS.includes(key)),
  );
  report.otherChanges = fieldChanges(otherFields(before), otherFields(after));
  return report;
}

export function parseCompareArguments(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    if (!["--before", "--after", "--output"].includes(flag) || Object.hasOwn(values, flag)) {
      throw new Error(`Unknown or duplicate argument: ${flag}\n${USAGE}`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${flag}\n${USAGE}`);
    values[flag] = value;
  }
  if (Object.keys(values).length !== 3) throw new Error(`All three paths are required\n${USAGE}`);
  return { beforePath: values["--before"], afterPath: values["--after"], outputPath: values["--output"] };
}

export async function writeSnapshotComparison({ beforePath, afterPath, outputPath }) {
  const inputs = await Promise.all([beforePath, afterPath].map((file) => realpath(file)));
  const output = path.resolve(outputPath);
  let existingOutput;
  try {
    existingOutput = await realpath(output);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (existingOutput) {
    const [outputInfo, ...inputInfo] = await Promise.all([existingOutput, ...inputs].map((file) => stat(file)));
    if (inputs.includes(existingOutput) || inputInfo.some((info) => info.dev === outputInfo.dev && info.ino === outputInfo.ino)) {
      throw new Error("Output must not overwrite either input snapshot");
    }
  }
  const snapshots = await Promise.all(inputs.map(async (file) => JSON.parse((await readFile(file, "utf8")).replace(/^\ufeff/u, ""))));
  const report = compareSeasonSnapshots(...snapshots);
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return report;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    if (process.argv.slice(2).includes("--help")) {
      console.log(USAGE);
    } else {
      const args = parseCompareArguments(process.argv.slice(2));
      const report = await writeSnapshotComparison(args);
      console.log(JSON.stringify({ ok: true, output: path.resolve(args.outputPath), before: report.before, after: report.after }));
    }
  } catch (error) {
    console.error(JSON.stringify({ ok: false, error: error.message }));
    process.exitCode = 1;
  }
}
