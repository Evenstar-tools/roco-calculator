import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { USER_RELEASE_NOTES } from "../src/data/user-release-notes.js";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = path.resolve(
  process.argv[2] ?? path.join(repositoryRoot, "artifacts", "洛克计算器-版本更新记录.md"),
);
const lines = ["# 洛克计算器版本更新记录", ""];

for (const release of USER_RELEASE_NOTES) {
  lines.push(`## ${release.version} · ${release.title}`, "");
  if (release.date) lines.push(`更新日期：${release.date}`, "");
  for (const highlight of release.highlights) lines.push(`- ${highlight}`);
  lines.push("");
}

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${lines.join("\n")}\n`, "utf8");
console.log(outputPath);
