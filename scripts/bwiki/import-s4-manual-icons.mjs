import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Jimp } from "jimp";
import { stableId, sha256Hex } from "./normalize.mjs";

// 用户授权仅裁切、缩放原图。坐标基于完整原图，不包含卡片文字和悬浮头像。
const records = [
  { name: "麦芒", size: [1260, 1502], crop: { x: 532, y: 301, w: 196, h: 196 }, imageIndex: 2 },
  { name: "拖拉机", size: [1080, 2346], crop: { x: 456, y: 803, w: 168, h: 168 }, imageIndex: 33 },
];
const inputs = process.argv.slice(2);
if (inputs.length !== 2) throw new Error("用法：node scripts/bwiki/import-s4-manual-icons.mjs <麦芒原图> <拖拉机原图>");
const evidence = JSON.parse(await readFile("data/reviewed/s4-manual-2026-09-09.json", "utf8"));
for (const [index, record] of records.entries()) {
  const bytes = await readFile(inputs[index]);
  const source = [...evidence.images, ...(evidence.supplementalImages ?? [])].find(({ index }) => index === record.imageIndex);
  if (sha256Hex(bytes) !== source?.sha256) throw new Error(`${record.name} 来源哈希不匹配`);
  const image = await Jimp.read(bytes);
  if (image.bitmap.width !== record.size[0] || image.bitmap.height !== record.size[1]) throw new Error(`${record.name} 原图尺寸变化`);
  const output = path.join("public/assets/skills", `${stableId("skill", "s4-manual-2026-09-09", record.name)}.png`);
  const buffer = await image.crop(record.crop).resize({ w: 128, h: 128 }).getBuffer("image/png");
  await writeFile(output, buffer);
  console.log(`${record.name}: ${output}, ${buffer.length} bytes, ${sha256Hex(buffer)}`);
}
