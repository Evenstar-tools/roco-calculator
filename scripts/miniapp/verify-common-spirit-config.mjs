import { readFile } from "node:fs/promises";
import path from "node:path";

const sourcePath = process.argv[2];
const bundledPath = process.argv[3];

if (!sourcePath || !bundledPath) {
  throw new Error(
    "用法：node scripts/miniapp/verify-common-spirit-config.mjs <源 JSON> <内置 JSON>",
  );
}

const source = JSON.parse(await readFile(path.resolve(sourcePath), "utf8"));
const bundled = JSON.parse(await readFile(path.resolve(bundledPath), "utf8"));
const statKeys = [
  "hp",
  "speed",
  "physicalAttack",
  "magicalAttack",
  "physicalDefense",
  "magicalDefense",
];
const expandedEntries = bundled.entries.map((entry) => ({
  displayIvs: Object.fromEntries(
    statKeys.map((key, index) => [key, entry[2][index]]),
  ),
  natureId: entry[1],
  skills: entry[3],
  spiritId: entry[0],
  traitValues: entry[4] ?? {},
}));
const normalizedSourceEntries = source.entries.map((entry) => ({
  displayIvs: entry.displayIvs,
  natureId: entry.natureId,
  skills: entry.skills,
  spiritId: entry.spiritId,
  traitValues: entry.traitValues ?? {},
}));
const semanticMatch =
  JSON.stringify(normalizedSourceEntries) === JSON.stringify(expandedEntries);

const result = {
  appVersion: bundled.appVersion,
  bundledEntries: bundled.entries.length,
  format: bundled.format,
  schemaVersion: bundled.schemaVersion,
  semanticMatch,
  sourceEntries: source.entries.length,
};

console.log(JSON.stringify(result, null, 2));
if (!semanticMatch) process.exitCode = 1;
