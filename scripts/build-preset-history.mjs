import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

// 固定历史候选供无基准的旧用户迁移；不把用户本地文件当成历史默认值。
const files = ["public/data/presets/pvp-popular-configs.json", "data/presets/s5-popular-configs.json"];
const revisions = new Set();
const unique = new Map();
for (const file of files) {
  const history = execFileSync("git", ["log", "--format=%H", "--", file], { encoding: "utf8" }).trim();
  for (const revision of history ? history.split(/\s+/) : []) {
    revisions.add(revision);
    const library = JSON.parse(execFileSync("git", ["show", `${revision}:${file}`], { encoding: "utf8" }));
    for (const entry of library.entries) unique.set(JSON.stringify(entry), entry);
  }
}
writeFileSync("public/data/presets/pvp-preset-history.json", `${JSON.stringify({ revisions: [...revisions], entries: [...unique.values()] })}\n`, "utf8");
console.log(`历史预设：${revisions.size} 次修订，${unique.size} 个配置候选`);
