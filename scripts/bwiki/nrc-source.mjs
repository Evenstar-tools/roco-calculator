import { mkdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export const NRC_MODULES = ["Catalog", "Skills", "Learnsets", "Evolutions", "Config", "Index"];
export async function fetchNrcModules({ content = false, fetchImpl = fetch } = {}) {
  const url = new URL("https://wiki.biligame.com/nrc/api.php");
  url.search = new URLSearchParams({ action: "query", format: "json", formatversion: "2", prop: "revisions",
    titles: NRC_MODULES.map((name) => `模块:Pets/data/${name}`).join("|"), rvprop: content ? "ids|timestamp|content" : "ids|timestamp", rvslots: "main" });
  const response = await fetchImpl(url);
  if (!response.ok) throw new Error(`新站资料 API HTTP ${response.status}，停止请求，不沿用过期数据冒充最新`);
  const result = await response.json();
  if (result.error || result.query?.pages?.length !== NRC_MODULES.length || result.query.pages.some((page) => !page.revisions?.[0]?.revid || (content && !page.revisions[0].slots?.main?.content))) throw new Error("新站资料模块不完整");
  return result;
}
export async function checkNrcSourceUpdates(snapshot, options = {}) {
  const result = await fetchNrcModules(options);
  const baseline = { snapshotId: snapshot.meta.id }, current = {}, changes = [];
  for (const page of result.query.pages) {
    const key = page.title.split("/").at(-1);
    baseline[key] = snapshot.meta.nrcSync.sources.find(({ title }) => title === page.title)?.revision ?? null;
    current[key] = page.revisions[0].revid;
    if (baseline[key] !== current[key]) changes.push({ source: key, previousRevision: baseline[key], currentRevision: current[key] });
  }
  return { status: changes.length ? "changed" : "unchanged", updateDetected: !!changes.length, buildReady: !!changes.length,
    checkedAt: new Date().toISOString(), baseline, current, inputs: { source: "nrc-data-modules" }, changes };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await fetchNrcModules({ content: true });
  await mkdir("output/nrc-audit/source", { recursive: true });
  for (const [name, selected] of [["fixed-modules", ["Catalog", "Skills", "Learnsets"]], ["extra-modules", ["Evolutions", "Config", "Index"]]]) {
    await writeFile(`output/nrc-audit/source/${name}.json`, JSON.stringify({ query: { pages: result.query.pages.filter(({ title }) => selected.includes(title.split("/").at(-1))) } }), "utf8");
  }
  console.log(JSON.stringify(result.query.pages.map(({ title, revisions }) => ({ title, revision: revisions[0].revid }))));
}
