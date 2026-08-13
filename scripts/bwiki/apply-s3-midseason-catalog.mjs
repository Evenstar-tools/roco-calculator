#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fetchPage, fetchRevisions } from "./fetch-page.mjs";
import { sha256Hex, sourceRef } from "./normalize.mjs";
import { parseDetailPage } from "./parse-detail.mjs";
import { parseSpiritRows } from "./parse-spirits.mjs";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const FILTER_URL = "https://wiki.biligame.com/rocom/精灵筛选";
const CATALOG_URL = "urn:rock-calculator:catalog-additions:s3-2026-08-13";
const EXPECTED_REVISIONS = Object.freeze({
  精灵筛选: 41360,
  宝藏小狐: 42863,
  宝藏沙狐: 42865,
});
const REQUIRED_SPIRITS = Object.freeze(["宝藏小狐", "宝藏沙狐"]);

function replaceById(collection, entry) {
  const index = collection.findIndex((candidate) => candidate.id === entry.id);
  if (index === -1) collection.push(entry);
  else collection[index] = entry;
}

function catalogSource(entries) {
  const details = entries.map(({ detail }) => detail.source);
  return {
    title: "S3 季中新增精灵目录",
    url: CATALOG_URL,
    revision: details.map((entry) => entry.revision).join("/"),
    fetchedAt: details.map((entry) => entry.fetchedAt).sort().at(-1),
    sha256: sha256Hex(details.map((entry) => entry.sha256).join("\n")),
  };
}

function updateDetailCollectionSource(sources, entries, spiritCount) {
  const index = sources.findIndex(
    (candidate) => candidate.title === "BWIKI 精灵详情页集合",
  );
  if (index === -1) return;
  const current = sources[index];
  sources[index] = {
    ...current,
    pages: spiritCount,
    sha256: sha256Hex([
      current.sha256,
      ...entries.map(({ detail }) => detail.source.sha256),
    ].join("\n")),
    revisionDigest: sha256Hex([
      current.revisionDigest,
      ...entries.map(({ spirit, detail }) =>
        `${spirit.fullName}:${detail.source.revision}`
      ),
    ].join("\n")),
  };
}

export function applyS3MidseasonCatalog(snapshot, catalog) {
  const next = structuredClone(snapshot);
  const skillByName = new Map(next.skills.map((entry) => [entry.name, entry]));
  const incomingIds = new Set(catalog.entries.map(({ spirit }) => spirit.id));
  const incomingNames = new Set(
    catalog.entries.map(({ spirit }) => spirit.fullName),
  );

  next.spirits = next.spirits.filter(
    (entry) => !incomingIds.has(entry.id) && !incomingNames.has(entry.fullName),
  );
  next.learnsets = next.learnsets.filter(
    (entry) => !incomingIds.has(entry.spiritId),
  );

  for (const { spirit: rawSpirit, detail } of catalog.entries) {
    const spirit = structuredClone(rawSpirit);
    spirit.evolutionChainNames = [...detail.evolutionNames];
    spirit.provenance = {
      ...spirit.provenance,
      evolutionChainNames: sourceRef(detail.source),
    };
    next.spirits.push(spirit);

    const traitId = spirit.traitIds?.[0];
    if (!traitId || !detail.trait?.name) {
      throw new Error(`${spirit.fullName}缺少特性资料`);
    }
    replaceById(next.traits, {
      id: traitId,
      name: detail.trait.name,
      description: detail.trait.description,
      provenance: {
        identity: sourceRef(detail.source),
        description: sourceRef(detail.source),
      },
    });

    const skillIds = [];
    const acquisitions = {};
    for (const learned of detail.skills) {
      const skill = skillByName.get(learned.name);
      if (!skill) {
        throw new Error(`${spirit.fullName}引用未知技能：${learned.name}`);
      }
      skillIds.push(skill.id);
      acquisitions[skill.id] = [...learned.acquisition];
    }
    next.learnsets.push({
      spiritId: spirit.id,
      skillIds: [...new Set(skillIds)],
      acquisitions,
      sources: [sourceRef(detail.source)],
      provenance: { skillIds: sourceRef(detail.source) },
    });
  }

  const originalSources = [...(next.meta?.sources ?? [])];
  const hadAdditionSource = originalSources.some(
    (candidate) => candidate.url === CATALOG_URL,
  );
  const sources = originalSources.filter(
    (candidate) => candidate.title !== catalog.source.title,
  );
  sources.push(sourceRef(catalog.source));

  const additionSource = catalogSource(catalog.entries);
  const additionIndex = sources.findIndex(
    (candidate) => candidate.url === additionSource.url,
  );
  if (additionIndex === -1) sources.push(additionSource);
  else sources[additionIndex] = additionSource;
  if (!hadAdditionSource) {
    updateDetailCollectionSource(sources, catalog.entries, next.spirits.length);
  }

  const previousSnapshot = next.meta?.diff?.previousSnapshot ?? next.meta?.id ?? null;
  next.meta = {
    ...next.meta,
    counts: {
      ...(next.meta?.counts ?? {}),
      spirits: next.spirits.length,
      skills: next.skills.length,
      learnsets: next.learnsets.length,
      traits: next.traits.length,
    },
    diff: {
      ...(next.meta?.diff ?? {}),
      previousSnapshot,
      spiritsAdded: catalog.entries.length,
      spiritsRemoved: 0,
    },
    sources,
  };
  return next;
}

export async function fetchS3MidseasonCatalog() {
  const titles = ["精灵筛选", ...REQUIRED_SPIRITS];
  const [revisions, filterPage] = await Promise.all([
    fetchRevisions(titles),
    fetchPage(FILTER_URL),
  ]);
  for (const title of titles) {
    const actual = revisions[title]?.revision;
    if (actual !== EXPECTED_REVISIONS[title]) {
      throw new Error(
        `BWIKI 修订漂移：${title} 预期 ${EXPECTED_REVISIONS[title]}，实际 ${actual}`,
      );
    }
  }

  const filterSource = {
    title: "精灵筛选",
    url: FILTER_URL,
    revision: revisions["精灵筛选"].revision,
    fetchedAt: filterPage.fetchedAt,
    sha256: filterPage.sha256,
  };
  const rows = parseSpiritRows(filterPage.html, filterSource);
  const entries = [];
  for (const name of REQUIRED_SPIRITS) {
    const spirit = rows.find((candidate) => candidate.fullName === name);
    if (!spirit) throw new Error(`BWIKI 精灵筛选缺少：${name}`);
    const detailPage = await fetchPage(spirit.detailUrl);
    const detailSource = {
      title: name,
      url: spirit.detailUrl,
      revision: revisions[name].revision,
      fetchedAt: detailPage.fetchedAt,
      sha256: detailPage.sha256,
    };
    const detail = parseDetailPage(detailPage.html, detailSource);
    entries.push({ spirit, detail });
  }
  return { source: filterSource, entries };
}

async function main() {
  const snapshotPath = path.join(PROJECT_ROOT, "public", "data", "current.json");
  const snapshot = JSON.parse(await readFile(snapshotPath, "utf8"));
  const catalog = await fetchS3MidseasonCatalog();
  const next = applyS3MidseasonCatalog(snapshot, catalog);
  await writeFile(snapshotPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  process.stdout.write(
    `S3季中目录已补齐：spirits=${next.spirits.length} learnsets=${next.learnsets.length} traits=${next.traits.length}\n`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
