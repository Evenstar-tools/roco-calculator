import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

const directory = path.resolve("data/desktop-skill-icons");
await mkdir(directory, { recursive: true });
const snapshot = JSON.parse(await readFile("data/snapshots/current.json", "utf8"));
const skills = snapshot.skills.filter((skill) => /^https:\/\//u.test(skill.asset?.sourceUrl));
const png = (bytes) => bytes.subarray(0, 8).toString("hex") === "89504e470d0a1a0a";
const records = [];
let cursor = 0;
await Promise.all(Array.from({ length: 6 }, async () => {
  while (cursor < skills.length) {
    const skill = skills[cursor++];
    const sourceUrl = skill.asset.sourceUrl;
    if (new URL(sourceUrl).hostname !== "patchwiki.biligame.com" || !/^skill_[a-f0-9]{16}$/u.test(skill.id)) {
      throw new Error(`未授权的技能来源：${skill.name}`);
    }
    const file = path.join(directory, `${skill.id}.png`);
    let bytes = await readFile(file).catch(() => null);
    if (!bytes || !png(bytes)) {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const response = await fetch(sourceUrl, { signal: AbortSignal.timeout(30000) });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          bytes = Buffer.from(await response.arrayBuffer());
          if (!png(bytes)) throw new Error("不是有效 PNG 文件");
          await writeFile(file, bytes);
          break;
        } catch (error) {
          if (attempt === 2) throw new Error(`${skill.name}：${error.message}`);
        }
      }
    }
    records.push({ id: skill.id, name: skill.name, sourceUrl, sha256: createHash("sha256").update(bytes).digest("hex") });
    if (records.length % 100 === 0) console.log(`技能图标 ${records.length}/${skills.length}`);
  }
}));
records.sort((a, b) => a.id.localeCompare(b.id));
await writeFile(path.join(directory, "manifest.json"), JSON.stringify({ assets: records }, null, 2) + "\n", "utf8");
console.log(`已就绪 ${records.length} 个离线技能图标`);
