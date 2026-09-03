#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { stableId } from "./normalize.mjs";
import { readImageDimensions } from "./sync-assets.mjs";

const PROJECT_ROOT = path.resolve(import.meta.dirname, "../..");
const DEFAULT_CANDIDATE_PATH = path.join(
  PROJECT_ROOT,
  "data/candidates/s4-preview-new-spirits.json",
);
const DEFAULT_SNAPSHOT_PATH = path.join(
  PROJECT_ROOT,
  "data/snapshots/current.json",
);
const DEFAULT_MANIFEST_PATH = path.join(
  PROJECT_ROOT,
  "public/assets/spirits/manifest.json",
);
const DEFAULT_PUBLIC_IMAGE_DIR = path.join(
  PROJECT_ROOT,
  "public/assets/spirits",
);
const DEFAULT_MINI_IMAGE_DIR = path.join(
  PROJECT_ROOT,
  "miniapp/src/assets/spirits",
);
const DEFAULT_OVERRIDE_PATH = path.join(
  PROJECT_ROOT,
  "miniapp/src/data/s4-preview-pet-image-overrides.js",
);
const EXPECTED_FORM_COUNT = 23;
const MAX_EDGE = 128;
const MAX_BYTES = 200 * 1024;

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

export function validateS4PreviewPortraitBuffer(buffer, fileName = "头像文件") {
  requireCondition(Buffer.isBuffer(buffer), `${fileName} 必须以 Buffer 读取`);
  requireCondition(
    buffer.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")),
    `${fileName} 不是 PNG`,
  );
  requireCondition(buffer[25] === 6, `${fileName} 必须是 RGBA PNG`);
  const { width, height } = readImageDimensions(buffer);
  requireCondition(
    Math.max(width, height) === MAX_EDGE,
    `${fileName} 长边必须恰好为 ${MAX_EDGE}px，实际为 ${width}x${height}`,
  );
  requireCondition(
    buffer.length <= MAX_BYTES,
    `${fileName} 超出头像体积门禁（≤${MAX_BYTES}B）`,
  );
  return { height, width };
}

function sourceName(fileName) {
  return fileName.match(/^\d{2}-\d{2}_(.+)\.png$/u)?.[1] ?? null;
}

function renderMiniappOverrides(entries) {
  const imports = entries.map(
    ({ id }, index) =>
      `import portrait${String(index + 1).padStart(2, "0")} from "../assets/spirits/${id}.png";`,
  );
  const mappings = entries.map(
    ({ id }, index) =>
      `  ${id}: portrait${String(index + 1).padStart(2, "0")},`,
  );
  return `${imports.join("\n")}\n\nexport const S4_PREVIEW_PET_IMAGE_OVERRIDES = Object.freeze({\n${mappings.join("\n")}\n});\n`;
}

export async function importS4PreviewPortraits({
  candidatePath = DEFAULT_CANDIDATE_PATH,
  manifestPath = DEFAULT_MANIFEST_PATH,
  miniImageDir = DEFAULT_MINI_IMAGE_DIR,
  overridePath = DEFAULT_OVERRIDE_PATH,
  publicImageDir = DEFAULT_PUBLIC_IMAGE_DIR,
  snapshotPath = DEFAULT_SNAPSHOT_PATH,
  sourceDir,
} = {}) {
  requireCondition(sourceDir, "必须通过 --source-dir 指定 128px 原色图目录");
  const [candidate, snapshot, manifest, directoryEntries] = await Promise.all([
    readFile(candidatePath, "utf8").then(JSON.parse),
    readFile(snapshotPath, "utf8").then(JSON.parse),
    readFile(manifestPath, "utf8").then(JSON.parse),
    readdir(path.resolve(sourceDir), { withFileTypes: true }),
  ]);
  const forms = candidate.families.flatMap((family) => family.forms);
  requireCondition(
    forms.length === EXPECTED_FORM_COUNT,
    `S4 前瞻候选形态 ${forms.length} != ${EXPECTED_FORM_COUNT}`,
  );
  const expectedNames = new Set(forms.map(({ name }) => name));
  requireCondition(
    expectedNames.size === EXPECTED_FORM_COUNT,
    "S4 前瞻候选形态名称必须是 23 个唯一值",
  );
  const regularFiles = directoryEntries.filter((entry) => entry.isFile());
  requireCondition(
    regularFiles.length === EXPECTED_FORM_COUNT,
    `原色头像目录文件数 ${regularFiles.length} != ${EXPECTED_FORM_COUNT}`,
  );
  const pngFiles = regularFiles
    .filter((entry) => entry.name.toLowerCase().endsWith(".png"))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right, "zh-CN", { numeric: true }));
  requireCondition(
    pngFiles.length === regularFiles.length,
    "原色头像目录只能包含 23 个 PNG 文件",
  );
  const fileByName = new Map();
  for (const fileName of pngFiles) {
    const name = sourceName(fileName);
    requireCondition(name, `前瞻头像文件名不符合 NN-NN_名称.png：${fileName}`);
    requireCondition(expectedNames.has(name), `前瞻头像存在未知形态：${fileName}`);
    requireCondition(!fileByName.has(name), `前瞻头像名称重复：${name}`);
    fileByName.set(name, fileName);
  }
  requireCondition(
    fileByName.size === forms.length,
    `前瞻头像数量 ${fileByName.size} != 候选形态 ${forms.length}`,
  );

  const snapshotById = new Map(snapshot.spirits.map((spirit) => [spirit.id, spirit]));
  const prepared = [];
  for (const form of forms) {
    const id = stableId("spirit", candidate.meta.id, form.name);
    const spirit = snapshotById.get(id);
    requireCondition(spirit?.fullName === form.name, `活动快照缺少前瞻形态：${form.name}`);
    const fileName = fileByName.get(form.name);
    requireCondition(fileName, `缺少前瞻头像：${form.name}`);
    const buffer = await readFile(path.join(path.resolve(sourceDir), fileName));
    const { width, height } = validateS4PreviewPortraitBuffer(buffer, fileName);
    prepared.push({
      buffer,
      bytes: buffer.length,
      fileName,
      height,
      id,
      name: form.name,
      sha256: sha256(buffer),
      width,
    });
  }

  await Promise.all([
    mkdir(publicImageDir, { recursive: true }),
    mkdir(miniImageDir, { recursive: true }),
    mkdir(path.dirname(overridePath), { recursive: true }),
  ]);
  await Promise.all(
    prepared.flatMap(({ buffer, id }) => [
      writeFile(path.join(publicImageDir, `${id}.png`), buffer),
      writeFile(path.join(miniImageDir, `${id}.png`), buffer),
    ]),
  );

  const previewIds = new Set(prepared.map(({ id }) => id));
  const nextManifest = {
    ...manifest,
    assets: [
      ...(manifest.assets ?? []).filter(({ id }) => !previewIds.has(id)),
      ...prepared.map(({ bytes, fileName, height, id, name, sha256: digest, width }) => ({
        id,
        name,
        localFile: `/assets/spirits/${id}.png`,
        previewSourceFile: fileName,
        sourceKind: "s4-preview-local",
        sha256: digest,
        bytes,
        width,
        height,
      })),
    ],
  };
  await Promise.all([
    writeFile(manifestPath, `${JSON.stringify(nextManifest, null, 2)}\n`, "utf8"),
    writeFile(overridePath, renderMiniappOverrides(prepared), "utf8"),
  ]);

  return {
    count: prepared.length,
    ids: prepared.map(({ id }) => id),
    names: prepared.map(({ name }) => name),
  };
}

function argumentValue(argv, flag) {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : null;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await importS4PreviewPortraits({
    sourceDir: argumentValue(process.argv.slice(2), "--source-dir"),
  });
  process.stdout.write(`S4 前瞻原色头像已导入：${result.count}/23\n`);
}
