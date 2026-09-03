#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { avatarFileTitle } from "./portrait-bindings.mjs";
import { readImageDimensions } from "./sync-assets.mjs";

const PROJECT_ROOT = path.resolve(import.meta.dirname, "../..");
const SPIRIT_IMAGE_DIR = path.join(PROJECT_ROOT, "public/assets/spirits");
const S4_PREVIEW_CANDIDATE_PATH = path.join(
  PROJECT_ROOT,
  "data/candidates/s4-preview-new-spirits.json",
);
const S4_PREVIEW_SOURCE_KIND = "s4-preview-local";
const S4_PREVIEW_FORM_COUNT = 23;
const MAX_SPIRIT_EDGE = 128;
const MAX_SPIRIT_BYTES = 200 * 1024;
const SPIRIT_IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp"]);
const STAT_KEYS = [
  "hp",
  "speed",
  "physicalAttack",
  "magicalAttack",
  "physicalDefense",
  "magicalDefense",
];

function sameStats(left, right) {
  if (left == null || right == null) return left === right;
  return STAT_KEYS.every((key) => left?.[key] === right?.[key]);
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

export async function verifySpiritBindings() {
  const [snapshot, manifest, runtime, bundled, s4Candidate] = await Promise.all([
    readFile(path.join(PROJECT_ROOT, "data/snapshots/current.json"), "utf8").then(JSON.parse),
    readFile(
      path.join(PROJECT_ROOT, "public/assets/spirits/manifest.json"),
      "utf8",
    ).then(JSON.parse),
    readFile(path.join(PROJECT_ROOT, "public/data/runtime.json"), "utf8").then(JSON.parse),
    readFile(
      path.join(PROJECT_ROOT, "miniapp/src/data/bundled-runtime.json"),
      "utf8",
    ).then(JSON.parse),
    readFile(S4_PREVIEW_CANDIDATE_PATH, "utf8").then(JSON.parse),
  ]);
  const miniOverrideSource = await readFile(
    path.join(
      PROJECT_ROOT,
      "miniapp/src/data/s4-preview-pet-image-overrides.js",
    ),
    "utf8",
  ).catch(() => "");
  const errors = [];
  const spiritById = new Map(snapshot.spirits.map((spirit) => [spirit.id, spirit]));
  const manifestById = new Map(manifest.assets.map((asset) => [asset.id, asset]));
  const runtimeById = new Map(runtime.spirits.map((spirit) => [spirit.id, spirit]));
  const bundledById = new Map(bundled.spirits.map((spirit) => [spirit.id, spirit]));
  const s4PreviewNames = s4Candidate.families.flatMap((family) =>
    family.forms.map(({ name }) => name),
  );
  const s4PreviewNameSet = new Set(s4PreviewNames);
  if (
    s4PreviewNames.length !== S4_PREVIEW_FORM_COUNT ||
    s4PreviewNameSet.size !== S4_PREVIEW_FORM_COUNT
  ) {
    errors.push(
      `S4 前瞻候选头像集合必须是 ${S4_PREVIEW_FORM_COUNT} 个唯一形态`,
    );
  }
  const s4PreviewSpirits = snapshot.spirits.filter(({ fullName }) =>
    s4PreviewNameSet.has(fullName),
  );
  if (s4PreviewSpirits.length !== S4_PREVIEW_FORM_COUNT) {
    errors.push(
      `活动快照 S4 前瞻形态 ${s4PreviewSpirits.length} != ${S4_PREVIEW_FORM_COUNT}`,
    );
  }
  const s4PreviewIds = new Set(s4PreviewSpirits.map(({ id }) => id));
  const s4PreviewAssets = manifest.assets.filter(
    ({ sourceKind }) => sourceKind === S4_PREVIEW_SOURCE_KIND,
  );
  if (
    s4PreviewAssets.length !== S4_PREVIEW_FORM_COUNT ||
    new Set(s4PreviewAssets.map(({ id }) => id)).size !== S4_PREVIEW_FORM_COUNT
  ) {
    errors.push(
      `清单 S4 前瞻头像必须是 ${S4_PREVIEW_FORM_COUNT} 个唯一资源`,
    );
  }
  for (const asset of s4PreviewAssets) {
    if (!s4PreviewIds.has(asset.id)) {
      errors.push(`清单存在候选集合外的 S4 前瞻头像：${asset.name}`);
    }
  }
  for (const spirit of s4PreviewSpirits) {
    const asset = manifestById.get(spirit.id);
    if (asset?.sourceKind !== S4_PREVIEW_SOURCE_KIND) {
      errors.push(`${spirit.fullName} 缺少 S4 前瞻本地头像清单绑定`);
    }
  }

  const miniImportByVariable = new Map(
    [...miniOverrideSource.matchAll(
      /^import\s+(portrait\d{2})\s+from\s+"\.\.\/assets\/spirits\/(spirit_[a-f0-9]+\.png)";$/gmu,
    )].map((match) => [match[1], match[2]]),
  );
  const miniVariableById = new Map(
    [...miniOverrideSource.matchAll(
      /^\s+(spirit_[a-f0-9]+):\s+(portrait\d{2}),$/gmu,
    )].map((match) => [match[1], match[2]]),
  );
  if (
    miniImportByVariable.size !== S4_PREVIEW_FORM_COUNT ||
    miniVariableById.size !== S4_PREVIEW_FORM_COUNT
  ) {
    errors.push(
      `小程序 S4 前瞻头像导入与映射必须各为 ${S4_PREVIEW_FORM_COUNT} 个唯一项`,
    );
  }
  for (const [id, variable] of miniVariableById) {
    if (!s4PreviewIds.has(id)) {
      errors.push(`小程序存在候选集合外的 S4 前瞻头像映射：${id}`);
    }
    if (miniImportByVariable.get(variable) !== `${id}.png`) {
      errors.push(`小程序 S4 前瞻头像映射错配：${id}`);
    }
  }

  for (const [label, collection] of [
    ["snapshot", snapshot.spirits],
    ["manifest", manifest.assets],
    ["runtime", runtime.spirits],
    ["bundled", bundled.spirits],
  ]) {
    if (collection.length !== snapshot.spirits.length) {
      errors.push(`${label} 数量 ${collection.length} != ${snapshot.spirits.length}`);
    }
    if (new Set(collection.map((entry) => entry.id)).size !== collection.length) {
      errors.push(`${label} 存在重复 ID`);
    }
  }

  let namedPortraits = 0;
  for (const spirit of snapshot.spirits) {
    if (spirit.calculationStatus === "pending-race-stats") {
      if (spirit.raceStats !== null) {
        errors.push(`${spirit.fullName} 占位种族值必须保持 null`);
      }
    } else {
      const total = STAT_KEYS.reduce((sum, key) => sum + spirit.raceStats[key], 0);
      if (total !== spirit.raceStats.total) {
        errors.push(`${spirit.fullName} 总种族值 ${spirit.raceStats.total} != ${total}`);
      }
    }
    const asset = manifestById.get(spirit.id);
    const runtimeSpirit = runtimeById.get(spirit.id);
    const bundledSpirit = bundledById.get(spirit.id);
    if (asset?.name !== spirit.fullName) {
      errors.push(`${spirit.fullName} 清单名称错配：${asset?.name ?? "缺失"}`);
    }
    if (asset?.sourceTitle) {
      namedPortraits += 1;
      if (asset.sourceTitle !== avatarFileTitle(spirit.fullName)) {
        errors.push(`${spirit.fullName} 头像标题错配：${asset.sourceTitle}`);
      }
    }
    if (runtimeSpirit?.fullName !== spirit.fullName || !sameStats(runtimeSpirit?.raceStats, spirit.raceStats)) {
      errors.push(`${spirit.fullName} 网页运行时名称或种族值错配`);
    }
    if (bundledSpirit?.fullName !== spirit.fullName || !sameStats(bundledSpirit?.raceStats, spirit.raceStats)) {
      errors.push(`${spirit.fullName} 小程序运行时名称或种族值错配`);
    }
    if (bundledSpirit?.imageUrl !== asset?.sourceUrl) {
      errors.push(`${spirit.fullName} 小程序头像 URL 错配`);
    }
  }

  for (const asset of manifest.assets) {
    if (!spiritById.has(asset.id)) continue;
    const localPath = path.join(
      PROJECT_ROOT,
      "public",
      asset.localFile.replace(/^[/\\]+/u, ""),
    );
    const buffer = await readFile(localPath);
    if (sha256(buffer) !== asset.sha256) {
      errors.push(`${asset.name} 本地头像哈希与清单不一致`);
    }
    if (asset.sourceKind === S4_PREVIEW_SOURCE_KIND) {
      const miniPath = path.join(
        PROJECT_ROOT,
        "miniapp/src/assets/spirits",
        path.basename(asset.localFile),
      );
      const miniBuffer = await readFile(miniPath).catch(() => null);
      if (
        !miniBuffer ||
        sha256(miniBuffer) !== asset.sha256 ||
        !buffer.equals(miniBuffer)
      ) {
        errors.push(`${asset.name} 小程序前瞻头像缺失或哈希不一致`);
      }
      const pngSignature = Buffer.from("89504e470d0a1a0a", "hex");
      if (!buffer.subarray(0, 8).equals(pngSignature) || buffer[25] !== 6) {
        errors.push(`${asset.name} Web 前瞻头像必须是 RGBA PNG`);
      }
      if (
        miniBuffer &&
        (!miniBuffer.subarray(0, 8).equals(pngSignature) || miniBuffer[25] !== 6)
      ) {
        errors.push(`${asset.name} 小程序前瞻头像必须是 RGBA PNG`);
      }
      const { width, height } = readImageDimensions(buffer);
      if (Math.max(width, height) !== MAX_SPIRIT_EDGE) {
        errors.push(
          `${asset.name} S4 前瞻头像长边必须恰好为 ${MAX_SPIRIT_EDGE}px，实际为 ${width}x${height}`,
        );
      }
      if (
        width !== asset.width ||
        height !== asset.height ||
        buffer.length !== asset.bytes
      ) {
        errors.push(`${asset.name} S4 前瞻头像尺寸或字节数与清单不一致`);
      }
      const mappedVariable = miniVariableById.get(asset.id);
      if (
        !mappedVariable ||
        miniImportByVariable.get(mappedVariable) !== path.basename(asset.localFile)
      ) {
        errors.push(`${asset.name} 小程序前瞻头像未正确注册覆盖映射`);
      }
    }
  }

  const imageNames = (await readdir(SPIRIT_IMAGE_DIR)).filter((name) =>
    SPIRIT_IMAGE_EXTENSIONS.has(path.extname(name).toLowerCase()),
  );
  const oversizedImages = [];
  for (const name of imageNames) {
    const buffer = await readFile(path.join(SPIRIT_IMAGE_DIR, name));
    const { width, height } = readImageDimensions(buffer);
    if (Math.max(width, height) > MAX_SPIRIT_EDGE || buffer.length > MAX_SPIRIT_BYTES) {
      oversizedImages.push(name);
    }
  }
  if (oversizedImages.length > 0) {
    errors.push(
      `精灵图超出体积门禁（边长≤${MAX_SPIRIT_EDGE} 且 ≤${MAX_SPIRIT_BYTES}B）：${oversizedImages.join("、")}`,
    );
  }

  const expectedNamed = snapshot.meta.portraitBindings?.resolved;
  if (Number.isInteger(expectedNamed) && namedPortraits !== expectedNamed) {
    errors.push(`精确命名头像 ${namedPortraits} != 元数据 ${expectedNamed}`);
  }
  if (errors.length > 0) {
    throw new Error(`精灵绑定校验失败（${errors.length}）：${errors.slice(0, 20).join("；")}`);
  }
  return {
    spirits: snapshot.spirits.length,
    namedPortraits,
    fallbackPortraits: snapshot.spirits.length - namedPortraits,
    localFiles: manifest.assets.length,
  };
}

const result = await verifySpiritBindings();
console.log(`spirits=${result.spirits}`);
console.log(`namedPortraits=${result.namedPortraits}`);
console.log(`fallbackPortraits=${result.fallbackPortraits}`);
console.log(`localFiles=${result.localFiles}`);
console.log("status=valid");
