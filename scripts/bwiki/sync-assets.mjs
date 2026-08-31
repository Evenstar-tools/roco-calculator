import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Jimp, JimpMime, ResizeStrategy } from "jimp";

const PROJECT_ROOT = path.resolve(import.meta.dirname, "../..");
const ELEMENT_SLUGS = {
  普通: "normal",
  草: "grass",
  火: "fire",
  水: "water",
  光: "light",
  地: "earth",
  冰: "ice",
  龙: "dragon",
  电: "electric",
  毒: "poison",
  虫: "bug",
  武: "martial",
  翼: "wing",
  萌: "cute",
  幽: "ghost",
  恶: "dark",
  机械: "machine",
  幻: "illusion",
};

function extensionFromUrl(sourceUrl) {
  if (!sourceUrl) throw new Error("素材缺少 BWIKI URL");
  const extension = path.extname(new URL(sourceUrl).pathname).toLowerCase();
  return /^\.(png|jpe?g|gif|webp)$/u.test(extension) ? extension : ".png";
}

export function collectAssetPlan(snapshot) {
  const spirits = snapshot.spirits.map((spirit) => ({
    id: spirit.id,
    name: spirit.fullName,
    sourceUrl: spirit.asset?.sourceUrl,
    sourceTitle: spirit.asset?.sourceTitle,
    sourceSha1: spirit.asset?.sourceSha1,
    localFile: `/assets/spirits/${spirit.id}${extensionFromUrl(spirit.asset?.sourceUrl)}`,
  }));
  const elements = Object.entries(snapshot.meta?.assetSources?.elements ?? {}).map(
    ([type, sourceUrl]) => ({
      id: type,
      name: type,
      sourceUrl,
      localFile: `/assets/elements/${ELEMENT_SLUGS[type] ?? encodeURIComponent(type)}${extensionFromUrl(sourceUrl)}`,
    }),
  );
  return { spirits, elements };
}

export function readImageDimensions(buffer) {
  if (
    buffer.length >= 24 &&
    buffer.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))
  ) {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (buffer.length >= 10 && ["GIF87a", "GIF89a"].includes(buffer.toString("ascii", 0, 6))) {
    return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
  }
  if (buffer.length >= 30 && buffer.toString("ascii", 0, 4) === "RIFF") {
    const kind = buffer.toString("ascii", 12, 16);
    if (kind === "VP8X") {
      return {
        width: 1 + buffer.readUIntLE(24, 3),
        height: 1 + buffer.readUIntLE(27, 3),
      };
    }
  }
  if (buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = buffer[offset + 1];
      const length = buffer.readUInt16BE(offset + 2);
      if (marker >= 0xc0 && marker <= 0xc3) {
        return {
          width: buffer.readUInt16BE(offset + 7),
          height: buffer.readUInt16BE(offset + 5),
        };
      }
      offset += 2 + length;
    }
  }
  throw new Error("无法识别素材尺寸");
}

export async function optimizeSpiritImage(buffer, maxDimension = 128) {
  const { width, height } = readImageDimensions(buffer);
  if (Math.max(width, height) <= maxDimension) return buffer;
  const scale = maxDimension / Math.max(width, height);
  const targetWidth = Math.max(1, Math.round(width * scale));
  const targetHeight = Math.max(1, Math.round(height * scale));
  const image = await Jimp.read(buffer);
  image.resize({
    w: targetWidth,
    h: targetHeight,
    mode: ResizeStrategy.BICUBIC,
  });
  return image.getBuffer(JimpMime.png);
}

export function resolvePublicAssetPath(localFile) {
  const publicRoot = path.resolve(PROJECT_ROOT, "public");
  const target = path.resolve(publicRoot, String(localFile).replace(/^[/\\]+/u, ""));
  if (!target.startsWith(`${publicRoot}${path.sep}`)) {
    throw new Error(`素材路径越界：${localFile}`);
  }
  return target;
}

async function download(item, transform) {
  if (!item.sourceUrl) throw new Error(`素材缺少 BWIKI URL：${item.id}`);
  const response = await fetch(item.sourceUrl, {
    headers: {
      accept: "image/avif,image/webp,image/png,image/*",
      "user-agent": "rock-calculator/1.0 asset sync",
    },
  });
  if (!response.ok) throw new Error(`素材下载失败：HTTP ${response.status} ${item.sourceUrl}`);
  const sourceBuffer = Buffer.from(await response.arrayBuffer());
  const buffer = transform ? await transform(sourceBuffer) : sourceBuffer;
  const dimensions = readImageDimensions(buffer);
  return {
    ...item,
    buffer,
    sha256: createHash("sha256").update(buffer).digest("hex"),
    bytes: buffer.length,
    ...dimensions,
  };
}

async function runPool(items, worker, concurrency = 12) {
  const results = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
  return results;
}

async function syncGroup(items, directory, transform) {
  await mkdir(directory, { recursive: true });
  return runPool(items, async (item) => {
    const downloaded = await download(item, transform);
    const target = resolvePublicAssetPath(item.localFile);
    await writeFile(target, downloaded.buffer);
    const { buffer, ...manifestEntry } = downloaded;
    return manifestEntry;
  });
}

export async function syncAssets(snapshotPath = path.join(PROJECT_ROOT, "public/data/current.json")) {
  const snapshot = JSON.parse(await readFile(snapshotPath, "utf8"));
  const plan = collectAssetPlan(snapshot);
  const [spirits, elements] = await Promise.all([
    syncGroup(
      plan.spirits,
      path.join(PROJECT_ROOT, "public/assets/spirits"),
      optimizeSpiritImage,
    ),
    syncGroup(plan.elements, path.join(PROJECT_ROOT, "public/assets/elements")),
  ]);
  const missing = [
    ...spirits.filter((entry) => !entry.sha256),
    ...elements.filter((entry) => !entry.sha256),
  ];
  const generatedAt = new Date().toISOString();
  await Promise.all([
    writeFile(
      path.join(PROJECT_ROOT, "public/assets/spirits/manifest.json"),
      `${JSON.stringify({ generatedAt, sourceSnapshot: snapshot.meta.id, assets: spirits }, null, 2)}\n`,
      "utf8",
    ),
    writeFile(
      path.join(PROJECT_ROOT, "public/assets/elements/manifest.json"),
      `${JSON.stringify({ generatedAt, sourceSnapshot: snapshot.meta.id, assets: elements }, null, 2)}\n`,
      "utf8",
    ),
  ]);
  return { spiritAssets: spirits.length, elementAssets: elements.length, missing: missing.length };
}

async function main() {
  const result = await syncAssets(process.argv[2]);
  console.log(`spiritAssets=${result.spiritAssets}`);
  console.log(`elementAssets=${result.elementAssets}`);
  console.log(`missing=${result.missing}`);
  if (result.missing > 0) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
