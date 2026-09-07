import { readFile, writeFile, mkdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { load } from "cheerio";
import { fetchPage } from "./bwiki/fetch-page.mjs";
import { extractRevisionFromHtml } from "./bwiki/parse-detail.mjs";

export function parseSkillSeasons(html) {
  const dom = load(html);
  const records = {};
  for (const row of dom("tr.divsort").toArray()) {
    const name = dom(row).children("td").eq(1).find("a[title]").first().attr("title")?.trim();
    const season = dom(row).attr("data-param6")?.trim();
    if (!name || !/^S\d+$/.test(season ?? "")) throw new Error(`技能赛季字段缺失：${name ?? "未知技能"}`);
    if (records[name] && records[name] !== season) throw new Error(`技能赛季冲突：${name}`);
    records[name] = season;
  }
  if (!Object.keys(records).length) throw new Error("未找到 BWIKI 技能表");
  return records;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const page = await fetchPage("https://wiki.biligame.com/rocom/技能查询");
  const records = parseSkillSeasons(page.html);
  const baseline = JSON.parse(await readFile("data/skill-query/s3-source.json", "utf8"));
  const missing = baseline.skills.filter(({ name }) => !records[name]);
  if (missing.length) throw new Error(`BWIKI 缺失基线技能：${missing.map(s => s.name).join("、")}`);
  const changes = baseline.skills.filter(s => records[s.name] !== s.introducedSeason).map(s => ({ name: s.name, before: s.introducedSeason, after: records[s.name] }));
  const source = { url: page.url, revision: extractRevisionFromHtml(page.html), fetchedAt: page.fetchedAt, sha256: page.sha256 };
  await mkdir("output/skill-query", { recursive: true });
  await writeFile("output/skill-query/bwiki-skill-table.html", page.html, "utf8");
  await writeFile("data/skill-query/bwiki-seasons.json", JSON.stringify({ source, records }, null, 2) + "\n", "utf8");
  await writeFile("output/skill-query/season-audit.json", JSON.stringify({ source, matched: baseline.skills.length, changes }, null, 2) + "\n", "utf8");
  console.log(JSON.stringify({ matched: baseline.skills.length, changed: changes.length, examples: changes.slice(0, 8), gust: records["疾风连袭"] }));
}
