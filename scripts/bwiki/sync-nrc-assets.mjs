import { readFile, writeFile, copyFile, access } from "node:fs/promises";
import { optimizeSpiritImage, readImageDimensions } from "./sync-assets.mjs";
import { sha256Hex } from "./normalize.mjs";

const read = async (name) => JSON.parse(await readFile(name, "utf8"));
const evidence = await read("data/reviewed/nrc-2026-09-10.json");
const snapshot = await read("data/snapshots/current.json");
const manifest = await read("public/assets/spirits/manifest.json");
const rows = evidence.spirits.filter((raw) => {
  const spirit = snapshot.spirits.find(({ fullName }) => fullName === raw.title);
  const asset = manifest.assets.find(({ id }) => id === spirit.id);
  return !asset || asset.name !== spirit.fullName || !asset.sourceUrl?.startsWith("https://") || asset.sourceKind === "s4-preview-local";
});
if (rows.length) {
  const url = new URL("https://wiki.biligame.com/nrc/api.php");
  url.search = new URLSearchParams({ action: "query", format: "json", formatversion: "2", prop: "imageinfo", iiprop: "url", titles: [...new Set(rows.map(({ image }) => `File:${image.head}`))].join("|") });
  const response = await fetch(url);
  if (!response.ok) throw new Error(`头像 API HTTP ${response.status}`);
  const body = await response.json();
  const urls = new Map(body.query.pages.map(({ title, imageinfo }) => [title.replace(/^文件:/, "").replaceAll(" ", "_"), imageinfo?.[0]?.url]));
  for (const raw of rows) {
    const sourceUrl = urls.get(raw.image.head);
    if (!sourceUrl?.startsWith("https://patchwiki.biligame.com/")) throw new Error(`头像地址缺失：${raw.title}`);
    const response = await fetch(sourceUrl);
    if (!response.ok) throw new Error(`头像 HTTP ${response.status}：${raw.title}`);
    const data = await optimizeSpiritImage(Buffer.from(await response.arrayBuffer()));
    const dimensions = readImageDimensions(data);
    const spirit = snapshot.spirits.find(({ fullName }) => fullName === raw.title);
    const localFile = `/assets/spirits/${spirit.id}.png`;
    await writeFile(`public${localFile}`, data);
    if (manifest.assets.some(({ id, sourceKind }) => id === spirit.id && sourceKind === "s4-preview-local")) {
      await writeFile(`miniapp/src/assets/spirits/${spirit.id}.png`, data);
    }
    const asset = { id: spirit.id, name: spirit.fullName, sourceUrl, localFile, sha256: sha256Hex(data), bytes: data.length,
      ...dimensions, sourceKind: "nrc-catalog", nrcFile: raw.image.head };
    const index = manifest.assets.findIndex(({ id }) => id === spirit.id);
    if (index < 0) manifest.assets.push(asset); else manifest.assets[index] = asset;
    spirit.asset = { sourceUrl, ...dimensions };
    spirit.provenance.asset = { ...evidence.sources.Catalog, file: raw.image.head };
  }
  manifest.sourceSnapshot = snapshot.meta.id;
  snapshot.meta.contentSha256 = null;
  snapshot.meta.contentSha256 = sha256Hex(JSON.stringify(snapshot));
  await writeFile("public/assets/spirits/manifest.json", JSON.stringify(manifest, null, 2) + "\n", "utf8");
  await writeFile("data/snapshots/current.json", JSON.stringify(snapshot, null, 2) + "\n", "utf8");
}
for (const asset of manifest.assets.filter(({ sourceKind }) => sourceKind === "nrc-catalog")) {
  const target = `miniapp/src/assets/spirits/${asset.id}.png`;
  if (await access(target).then(() => true, () => false)) await copyFile(`public${asset.localFile}`, target);
}
console.log(`新站头像同步 ${rows.length} 项`);
