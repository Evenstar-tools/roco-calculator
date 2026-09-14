import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";

// BWIKI 的愿力冲击原图；7700006 不存在，不用其他技能图片替代。
const numbers = Array.from({ length: 19 }, (_, index) => 7700001 + index).filter((id) => id !== 7700006);
const api = new URL("https://wiki.biligame.com/rocom/api.php");
api.search = new URLSearchParams({ action: "query", format: "json", prop: "imageinfo", iiprop: "url|size",
  titles: numbers.map((id) => `文件:Skill ${id}.png`).join("|") });
const response = await fetch(api, { signal: AbortSignal.timeout(15000) });
if (!response.ok) throw new Error(`图标资料读取失败：${response.status}`);
const pages = Object.values((await response.json()).query?.pages ?? {});
await mkdir("public/assets/skills/wish-power", { recursive: true });
const assets = [];
for (const id of numbers) {
  const info = pages.find((page) => page.title === `文件:Skill ${id}.png`)?.imageinfo?.[0];
  if (!info || new URL(info.url).hostname !== "patchwiki.biligame.com") throw new Error(`缺少可信原图：${id}`);
  const result = await fetch(info.url, { signal: AbortSignal.timeout(15000) });
  if (!result.ok) throw new Error(`原图下载失败：${id} HTTP ${result.status}`);
  const bytes = Buffer.from(await result.arrayBuffer());
  if (bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a" || bytes.readUInt32BE(16) !== 128 || bytes.readUInt32BE(20) !== 128) throw new Error(`原图格式异常：${id}`);
  const localFile = `/assets/skills/wish-power/${id}.png`;
  await writeFile(`public${localFile}`, bytes);
  assets.push({ id, sourcePage: info.descriptionurl, sourceUrl: info.url, localFile, sha256: createHash("sha256").update(bytes).digest("hex") });
}
await writeFile("public/assets/skills/wish-power/manifest.json", JSON.stringify({ source: "BWIKI", license: "CC BY-NC-SA 4.0", assets }, null, 2) + "\n", "utf8");
console.log(`愿力冲击原图已内置：${assets.length} 张`);
