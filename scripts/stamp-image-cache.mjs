import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PLACEHOLDER = "__IMAGE_DIGEST__";
const IMAGE_DIRECTORIES = [
  "assets/spirits", "assets/skills", "assets/skills/wish-power",
  "global-assets/assets/spirits", "global-assets/assets/skills", "global-assets/assets/skills/wish-power",
];
const STABLE_IMAGE = /^(?:global-assets\/)?assets\/(?:spirits\/spirit_[a-f0-9]{16}\.(?:png|webp)|skills\/(?:skill_(?:[a-f0-9]{16}|preview_s5_[a-z0-9][a-z0-9_-]*)\.(?:png|webp)|wish-power\/77000(?:0[1-57-9]|1[0-9])\.png))$/;

/** 图片文件名按 id 固定，内容可能变化；只有图片变了，长期图片缓存才换代。 */
export function stampImageCache(client = path.join(ROOT, "dist/client")) {
  const hash = createHash("sha256");
  let count = 0;
  for (const directory of IMAGE_DIRECTORIES) {
    const absolute = path.join(client, directory);
    if (!existsSync(absolute)) continue;
    for (const name of readdirSync(absolute).filter((entry) => STABLE_IMAGE.test(`${directory}/${entry}`)).sort()) {
      hash.update(`${directory}/${name}\0`).update(readFileSync(path.join(absolute, name)));
      count += 1;
    }
  }
  if (!count) throw new Error("Image cache stamp found no stable images");
  const target = path.join(client, "sw.js");
  const source = readFileSync(target, "utf8");
  if (!source.includes(PLACEHOLDER)) throw new Error("Service worker has no image cache placeholder");
  const digest = hash.digest("hex").slice(0, 16);
  writeFileSync(target, source.replaceAll(PLACEHOLDER, digest), "utf8");
  return { count, digest };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const { count, digest } = stampImageCache();
  console.log(`Image cache ${digest} stamped from ${count} images`);
}
