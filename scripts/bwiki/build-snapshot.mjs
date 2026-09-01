import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { load } from "cheerio";
import {
  fetchPage,
  fetchRevisions,
  fetchRevisionsBatched,
} from "./fetch-page.mjs";
import { extractRevisionFromHtml, parseDetailPage } from "./parse-detail.mjs";
import {
  cleanText,
  originalPatchwikiUrl,
  sha256Hex,
  sourceRef,
  stableId,
  toInteger,
} from "./normalize.mjs";
import { parseSpiritRows } from "./parse-spirits.mjs";
import { parseSkillRows } from "./parse-skills.mjs";
import {
  applyNamedPortraitAssets,
  fetchNamedPortraitAssets,
} from "./portrait-bindings.mjs";
import { applyReviewedOverrides } from "./reviewed-overrides.mjs";
import { validateSnapshot } from "./validate.mjs";

const PROJECT_ROOT = path.resolve(import.meta.dirname, "../..");
const DEFAULT_CSV = path.join(
  PROJECT_ROOT,
  "data",
  "sources",
  "rocom_world_s3_spirits.csv",
);
const DEFAULT_DETAIL_CACHE = path.join(
  PROJECT_ROOT,
  "data",
  "sources",
  "bwiki_cache",
);
const SPIRIT_FILTER_URL =
  "https://wiki.biligame.com/rocom/%E7%B2%BE%E7%81%B5%E7%AD%9B%E9%80%89";
const SKILL_FILTER_URL =
  "https://wiki.biligame.com/rocom/%E6%8A%80%E8%83%BD%E7%AD%9B%E9%80%89";
const SEASON_ID = "s3-2026-07-15";

export const ELEMENT_TYPES = [
  "普通",
  "草",
  "火",
  "水",
  "光",
  "地",
  "冰",
  "龙",
  "电",
  "毒",
  "虫",
  "武",
  "翼",
  "萌",
  "幽",
  "恶",
  "机械",
  "幻",
];

function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  const input = String(text).replace(/^\ufeff/u, "");
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (quoted) {
      if (character === '"' && input[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        cell += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(cell);
      cell = "";
    } else if (character === "\n") {
      row.push(cell.replace(/\r$/u, ""));
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }
  if (cell || row.length > 0) {
    row.push(cell.replace(/\r$/u, ""));
    rows.push(row);
  }
  return rows.filter((values) => values.some((value) => value !== ""));
}

function parseTrait(value, source) {
  const text = cleanText(value);
  if (!text) return null;
  const separator = text.search(/[：:]/u);
  const name = separator < 0 ? text : cleanText(text.slice(0, separator));
  const description = separator < 0 ? "" : cleanText(text.slice(separator + 1));
  return {
    id: stableId("trait", name, description),
    name,
    description,
    provenance: { identity: source, description: source },
  };
}

export function parseSpiritCsv(csvText, source = {}) {
  const [header, ...rows] = parseCsvRows(csvText);
  if (!header) return [];
  const ref = sourceRef(source);
  return rows.map((values) => {
    const row = Object.fromEntries(header.map((name, index) => [name, values[index] ?? ""]));
    const baseName = cleanText(row["名称"]);
    const variantName = cleanText(row["形态说明"]) || null;
    const fullName = variantName ? `${baseName}（${variantName}）` : baseName;
    const trait = parseTrait(row["特性"], ref);
    return {
      id: stableId("spirit", cleanText(row["图鉴号"]).padStart(3, "0"), fullName),
      dexNo: cleanText(row["图鉴号"]).padStart(3, "0"),
      baseName,
      variantName,
      fullName,
      stage: cleanText(row["阶数"]),
      sourceCategory: cleanText(row["形态来源"]),
      types: cleanText(row["属性"]).split("|").map(cleanText).filter(Boolean),
      raceStats: {
        hp: toInteger(row["生命"]),
        speed: toInteger(row["速度"]),
        physicalAttack: toInteger(row["物攻"]),
        magicalAttack: toInteger(row["魔攻"]),
        physicalDefense: toInteger(row["物防"]),
        magicalDefense: toInteger(row["魔防"]),
        total: toInteger(row["总种族值"]),
      },
      traitIds: trait ? [trait.id] : [],
      trait,
      source: ref,
      provenance: {
        identity: ref,
        stage: ref,
        sourceCategory: ref,
        types: ref,
        raceStats: ref,
        traitIds: ref,
      },
    };
  });
}

function cacheName(url) {
  return (
    url
      .replace("https://", "")
      .replace(/[^A-Za-z0-9._-]+/gu, "_")
      .slice(0, 180) + ".html"
  );
}

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function readDetailHtml(spirit, cacheDirectory, liveRevision) {
  const cacheFile = path.join(cacheDirectory, cacheName(spirit.detailUrl));
  if (await exists(cacheFile)) {
    const html = await readFile(cacheFile, "utf8");
    if (extractRevisionFromHtml(html) === liveRevision) {
      return {
        html,
        fetchedAt: "2026-07-16T00:00:00.000+08:00",
        sha256: sha256Hex(html),
        cacheFile,
        refreshed: false,
      };
    }
  }
  const response = await fetchPage(spirit.detailUrl);
  const fetchedRevision = extractRevisionFromHtml(response.html);
  if (fetchedRevision !== liveRevision) {
    throw new Error(
      `详情页修订在抓取期间变化：${spirit.fullName} expected=${liveRevision} actual=${fetchedRevision}`,
    );
  }
  return { ...response, refreshed: true };
}

function extractElementAssets(html) {
  const $ = load(html);
  const assets = {};
  for (const type of ELEMENT_TYPES) {
    const image = $(`.dex-type-${type} img[src]`).first();
    if (image.length) assets[type] = originalPatchwikiUrl(image.attr("src"));
  }
  return assets;
}

export function buildTypeChart(relations, source = {}) {
  const byType = new Map(relations.filter(Boolean).map((entry) => [entry.type, entry]));
  const matrix = ELEMENT_TYPES.map((attackType) => {
    const relation = byType.get(attackType);
    return ELEMENT_TYPES.map((defenseType) => {
      if (relation?.strongAgainst.includes(defenseType)) return 2;
      if (relation?.resistedBy.includes(defenseType)) return 0.5;
      return 1;
    });
  });
  return { types: ELEMENT_TYPES, matrix, source: sourceRef(source) };
}

export function findDetailRevisionDrift(cachedDetails, liveRevisionMap) {
  return cachedDetails
    .map((detail) => ({
      fullName: detail.fullName,
      cachedRevision: detail.cachedRevision,
      liveRevision: liveRevisionMap.get(detail.fullName)?.revision ?? null,
    }))
    .filter(({ cachedRevision, liveRevision }) => cachedRevision !== liveRevision);
}

function mergeVerifiedSpirits(liveSpirits, csvSpirits) {
  const liveByName = new Map(liveSpirits.map((spirit) => [spirit.fullName, spirit]));
  return csvSpirits.map((verified) => {
    const live = liveByName.get(verified.fullName);
    if (!live) throw new Error(`S3 CSV 精灵在当前 BWIKI 筛选页中不存在：${verified.fullName}`);
    return {
      ...live,
      id: verified.id,
      dexNo: verified.dexNo,
      baseName: verified.baseName,
      variantName: verified.variantName,
      fullName: verified.fullName,
      stage: verified.stage,
      sourceCategory: verified.sourceCategory,
      types: verified.types,
      raceStats: verified.raceStats,
      traitIds: verified.traitIds,
      provenance: {
        ...live.provenance,
        identity: verified.provenance.identity,
        stage: verified.provenance.stage,
        sourceCategory: verified.provenance.sourceCategory,
        types: verified.provenance.types,
        raceStats: verified.provenance.raceStats,
        traitIds: verified.provenance.traitIds,
      },
    };
  });
}

export async function buildSnapshot(options = {}) {
  const csvPath = options.csvPath ?? process.env.ROCOM_S3_CSV ?? DEFAULT_CSV;
  const detailCache =
    options.detailCache ?? process.env.ROCOM_BWIKI_CACHE ?? DEFAULT_DETAIL_CACHE;
  const fetchedAt = new Date().toISOString();
  const [revisionMap, spiritPage, skillPage, csvText] = await Promise.all([
    fetchRevisions(["精灵筛选", "技能筛选"]),
    fetchPage(SPIRIT_FILTER_URL),
    fetchPage(SKILL_FILTER_URL),
    readFile(csvPath, "utf8"),
  ]);
  const csvSha256 = sha256Hex(csvText);
  const spiritSource = {
    title: "精灵筛选",
    url: SPIRIT_FILTER_URL,
    revision: revisionMap["精灵筛选"]?.revision ?? null,
    fetchedAt: spiritPage.fetchedAt,
    sha256: spiritPage.sha256,
  };
  const skillSource = {
    title: "技能筛选",
    url: SKILL_FILTER_URL,
    revision: revisionMap["技能筛选"]?.revision ?? null,
    fetchedAt: skillPage.fetchedAt,
    sha256: skillPage.sha256,
  };
  const csvSource = {
    title: "已核验 S3 精灵种族快照",
    url: "urn:rock-calculator:snapshot:s3-2026-07-15:spirits",
    revision: spiritSource.revision,
    fetchedAt: "2026-07-16T00:00:00.000+08:00",
    sha256: csvSha256,
  };

  const liveSpirits = parseSpiritRows(spiritPage.html, spiritSource);
  const csvSpirits = parseSpiritCsv(csvText, csvSource);
  const verifiedSpirits = mergeVerifiedSpirits(liveSpirits, csvSpirits);
  const namedPortraitAssets = await fetchNamedPortraitAssets(verifiedSpirits);
  const portraitBindings = applyNamedPortraitAssets(
    verifiedSpirits,
    namedPortraitAssets,
  );
  const spirits = portraitBindings.spirits;
  const detailRevisionMap = await fetchRevisionsBatched(
    spirits.map((spirit) => spirit.fullName),
  );
  if (
    detailRevisionMap.size !== spirits.length ||
    spirits.some((spirit) => !detailRevisionMap.get(spirit.fullName)?.revision)
  ) {
    throw new Error(
      `BWIKI 详情页修订解析不完整：应为 ${spirits.length}，实际为 ${detailRevisionMap.size}`,
    );
  }
  const parsedSkills = parseSkillRows(skillPage.html, skillSource);
  const parsedTraits = [
    ...new Map(
      csvSpirits.flatMap((spirit) =>
        spirit.trait ? [[spirit.trait.id, spirit.trait]] : [],
      ),
    ).values(),
  ];
  const reviewed = applyReviewedOverrides(parsedSkills, parsedTraits);
  if (reviewed.stale.length > 0) {
    throw new Error(
      `经审覆盖项已失效：${reviewed.stale
        .map((override) => `${override.id}:${override.status}`)
        .join("、")}`,
    );
  }
  const skills = reviewed.skills;
  const traits = reviewed.traits;
  const skillByName = new Map(skills.map((skill) => [skill.name, skill]));
  const learnsets = [];
  const typeRelations = new Map();
  let unmatchedLearnsetSkills = 0;
  let detailPages = 0;
  let detailPagesRefreshed = 0;

  for (const spirit of spirits) {
    const liveDetailRevision = detailRevisionMap.get(spirit.fullName).revision;
    const detailResponse = await readDetailHtml(
      spirit,
      detailCache,
      liveDetailRevision,
    );
    const detailSource = {
      title: spirit.fullName,
      url: spirit.detailUrl,
      revision: liveDetailRevision,
      fetchedAt: detailResponse.fetchedAt,
      sha256: detailResponse.sha256,
    };
    const detail = parseDetailPage(detailResponse.html, detailSource);
    if (detail.evolutionNames.length > 0) {
      spirit.evolutionChainNames = detail.evolutionNames;
      spirit.provenance.evolutionChainNames = sourceRef(detailSource);
    }
    if (!spirit.asset?.sourceUrl && detail.portraitAsset?.sourceUrl) {
      spirit.asset = detail.portraitAsset;
      spirit.provenance.asset = sourceRef(detailSource);
    }
    const skillIds = [];
    const acquisitions = {};
    for (const learned of detail.skills) {
      const skill = skillByName.get(learned.name);
      if (!skill) {
        unmatchedLearnsetSkills += 1;
        continue;
      }
      skillIds.push(skill.id);
      acquisitions[skill.id] = learned.acquisition;
    }
    learnsets.push({
      spiritId: spirit.id,
      skillIds: [...new Set(skillIds)],
      acquisitions,
      sources: [sourceRef(detailSource)],
      provenance: { skillIds: sourceRef(detailSource) },
    });
    if (detail.typeRelations && !typeRelations.has(detail.typeRelations.type)) {
      typeRelations.set(detail.typeRelations.type, detail.typeRelations);
    }
    detailPages += 1;
    if (detailResponse.refreshed) detailPagesRefreshed += 1;
  }

  if (typeRelations.size !== 18) {
    throw new Error(`BWIKI 属性关系不完整：应为 18，实际为 ${typeRelations.size}`);
  }
  if (unmatchedLearnsetSkills !== 0) {
    throw new Error(`学习关系存在 ${unmatchedLearnsetSkills} 个技能未出现在技能筛选中`);
  }
  const missingSpiritAssets = spirits.filter((spirit) => !spirit.asset?.sourceUrl);
  if (missingSpiritAssets.length > 0) {
    throw new Error(
      `BWIKI 精灵素材缺失 ${missingSpiritAssets.length} 项：${missingSpiritAssets
        .slice(0, 10)
        .map((spirit) => spirit.fullName)
        .join("、")}`,
    );
  }

  const sourceList = [
    sourceRef(spiritSource),
    sourceRef(skillSource),
    sourceRef(csvSource),
    {
      title: "BWIKI 精灵详情页集合",
      url: "https://wiki.biligame.com/rocom/精灵图鉴",
      revision: null,
      fetchedAt,
      sha256: sha256Hex(
        learnsets.flatMap((learnset) => learnset.sources.map((source) => source.sha256)).join(""),
      ),
      pages: detailPages,
      refreshedPages: detailPagesRefreshed,
      revisionDigest: sha256Hex(
        spirits
          .map(
            (spirit) =>
              `${spirit.fullName}:${detailRevisionMap.get(spirit.fullName).revision}`,
          )
          .join("\n"),
      ),
    },
  ];
  const typeChart = buildTypeChart([...typeRelations.values()], {
    title: "BWIKI 精灵详情页属性克制",
    url: "https://wiki.biligame.com/rocom/精灵图鉴",
    fetchedAt,
    sha256: sourceList[3].sha256,
  });
  const snapshot = {
    meta: {
      id: SEASON_ID,
      seasonId: "S3·铅字幻梦",
      snapshotVersion: 1,
      rulesVersion: "2026-07-23",
      bwikiRevision: `${spiritSource.revision}/${skillSource.revision}`,
      revisions: {
        spiritFilter: spiritSource.revision,
        skillFilter: skillSource.revision,
      },
      fetchedAt,
      contentSha256: null,
      sources: sourceList,
      counts: {
        spirits: spirits.length,
        skills: skills.length,
        learnsets: learnsets.length,
        traits: traits.length,
        typeChart: 18,
        overrides: reviewed.applied.length,
      },
      portraitBindings: {
        strategy: "exact-full-name-file-then-filter-row",
        resolved: portraitBindings.resolved,
        fallback: portraitBindings.fallback,
      },
      diff: {
        previousSnapshot: null,
        spiritsAdded: 0,
        spiritsRemoved: 0,
        skillsAdded: 0,
        skillsRemoved: 0,
      },
      assetSources: {
        elements: extractElementAssets(spiritPage.html),
      },
    },
    spirits,
    skills,
    learnsets,
    traits,
    typeChart,
    overrides: reviewed.applied,
  };
  snapshot.meta.contentSha256 = sha256Hex(JSON.stringify(snapshot));
  const validation = validateSnapshot(snapshot, {
    expectedSpiritCount: 594,
    expectedSkillCount: 553,
  });
  if (!validation.ok) {
    throw new Error(`快照校验失败：${JSON.stringify(validation.errors.slice(0, 20))}`);
  }
  return snapshot;
}

async function archivePreviousCurrentIfNeeded(currentPath, seasonDirectory, nextSeasonId) {
  if (!(await exists(currentPath))) return null;
  const previousRaw = await readFile(currentPath, "utf8");
  const previous = JSON.parse(previousRaw);
  const previousId = previous.meta?.id;
  if (!previousId || previousId === nextSeasonId) return null;
  const archivePath = path.join(seasonDirectory, `${previousId}.json`);
  if (await exists(archivePath)) return null;
  await writeFile(archivePath, previousRaw, "utf8");
  return archivePath;
}

async function main() {
  const snapshot = await buildSnapshot();
  const output = `${JSON.stringify(snapshot, null, 2)}\n`;
  const snapshotsDirectory = path.join(PROJECT_ROOT, "data", "snapshots");
  const currentPath = path.join(snapshotsDirectory, "current.json");
  const seasonDirectory = path.join(snapshotsDirectory, "seasons");
  await mkdir(seasonDirectory, { recursive: true });
  const archivedPath = await archivePreviousCurrentIfNeeded(
    currentPath,
    seasonDirectory,
    snapshot.meta.id,
  );
  await writeFile(currentPath, output, "utf8");
  console.log(`spirits=${snapshot.spirits.length}`);
  console.log(`skills=${snapshot.skills.length}`);
  console.log(`learnsets=${snapshot.learnsets.length}`);
  console.log(`traits=${snapshot.traits.length}`);
  console.log(`detailPagesRefreshed=${snapshot.meta.sources[3].refreshedPages}`);
  console.log(`bwikiRevision=${snapshot.meta.bwikiRevision}`);
  console.log(`contentSha256=${snapshot.meta.contentSha256}`);
  if (archivedPath) console.log(`archivedPrevious=${archivedPath}`);
  console.log("status=valid");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
