#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { avatarFileTitle } from "./portrait-bindings.mjs";

const PROJECT_ROOT = path.resolve(import.meta.dirname, "../..");
const STAT_KEYS = [
  "hp",
  "speed",
  "physicalAttack",
  "magicalAttack",
  "physicalDefense",
  "magicalDefense",
];

function sameStats(left, right) {
  return STAT_KEYS.every((key) => left?.[key] === right?.[key]);
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

export async function verifySpiritBindings() {
  const [snapshot, manifest, runtime, bundled] = await Promise.all([
    readFile(path.join(PROJECT_ROOT, "public/data/current.json"), "utf8").then(JSON.parse),
    readFile(
      path.join(PROJECT_ROOT, "public/assets/spirits/manifest.json"),
      "utf8",
    ).then(JSON.parse),
    readFile(path.join(PROJECT_ROOT, "public/data/runtime.json"), "utf8").then(JSON.parse),
    readFile(
      path.join(PROJECT_ROOT, "miniapp/src/data/bundled-runtime.json"),
      "utf8",
    ).then(JSON.parse),
  ]);
  const errors = [];
  const spiritById = new Map(snapshot.spirits.map((spirit) => [spirit.id, spirit]));
  const manifestById = new Map(manifest.assets.map((asset) => [asset.id, asset]));
  const runtimeById = new Map(runtime.spirits.map((spirit) => [spirit.id, spirit]));
  const bundledById = new Map(bundled.spirits.map((spirit) => [spirit.id, spirit]));

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
    const total = STAT_KEYS.reduce((sum, key) => sum + spirit.raceStats[key], 0);
    if (total !== spirit.raceStats.total) {
      errors.push(`${spirit.fullName} 总种族值 ${spirit.raceStats.total} != ${total}`);
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
  }

  const expectedNamed = snapshot.meta.portraitBindings?.resolved;
  if (namedPortraits !== expectedNamed) {
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
