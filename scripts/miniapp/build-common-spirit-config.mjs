import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { deflateRawSync } from "node:zlib";

const inputPath = process.argv[2];
const outputPath = process.argv[3];

if (!inputPath || !outputPath) {
  throw new Error(
    "用法：node scripts/miniapp/build-common-spirit-config.mjs <输入 JSON> <输出 JSON>",
  );
}

const source = JSON.parse(await readFile(path.resolve(inputPath), "utf8"));
if (
  source?.format !== "rock-calculator.favorite-config-library" ||
  source?.schemaVersion !== 1 ||
  !Array.isArray(source.entries) ||
  source.entryCount !== source.entries.length
) {
  throw new TypeError("常用精灵配置文件结构无效");
}

const statKeys = [
  "hp",
  "speed",
  "physicalAttack",
  "magicalAttack",
  "physicalDefense",
  "magicalDefense",
];

const entries = source.entries.map((entry, index) => {
  if (
    typeof entry?.spiritId !== "string" ||
    typeof entry?.natureId !== "string" ||
    !entry.displayIvs ||
    !Array.isArray(entry.skills)
  ) {
    throw new TypeError(`第 ${index + 1} 条常用精灵配置无效`);
  }
  const tuple = [
    entry.spiritId,
    entry.natureId,
    statKeys.map((key) => Number(entry.displayIvs[key]) || 0),
    entry.skills,
  ];
  if (Object.keys(entry.traitValues ?? {}).length > 0) {
    tuple.push(entry.traitValues);
  }
  return tuple;
});

const bundled = {
  format: source.format,
  schemaVersion: source.schemaVersion,
  appVersion: source.appVersion,
  versions: source.versions,
  exportedAt: source.exportedAt,
  entryCount: entries.length,
  entryEncoding: "tuple-v1",
  entries,
};

const resolvedOutputPath = path.resolve(outputPath);
const output = `${JSON.stringify(bundled)}\n`;
const payloadPath = resolvedOutputPath.endsWith(".json")
  ? resolvedOutputPath.replace(/\.json$/u, ".payload.js")
  : `${resolvedOutputPath}.payload.js`;
const compressedOutput = `export default ${JSON.stringify(
  deflateRawSync(Buffer.from(output.trim(), "utf8"), { level: 9 }).toString(
    "base64",
  ),
)};\n`;

await Promise.all([
  writeFile(resolvedOutputPath, output, "utf8"),
  writeFile(payloadPath, compressedOutput, "utf8"),
]);

console.log(
  `Built ${entries.length} bundled common spirit configs (${Buffer.byteLength(output)} raw bytes, ${Buffer.byteLength(compressedOutput)} compressed bytes).`,
);
