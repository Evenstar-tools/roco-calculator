import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { load } from "cheerio";
import { absoluteBwikiUrl, cleanText, stableId } from "./normalize.mjs";

const SNAPSHOT_PATH = path.resolve("data/snapshots/current.json");
const S4_CANDIDATE_PATH = path.resolve(
  "data/candidates/s4-preview-new-spirits.json",
);
const CATALOG_PATH = path.resolve("data/form-roles/form-role-v1.json");
const RUNTIME_PATH = path.resolve("src/data/form-role-manifest-v1.js");
const BWIKI_REVISION = 41360;
const BWIKI_SOURCE_ID = "bwiki-spirit-filter-41360";
const S4_SOURCE_ID = "s4-preview-new-spirits-2026-09-02";
const MANIFEST_VERSION = "form-role-v1";

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function countBy(records, keyOf) {
  return records.reduce((counts, record) => {
    const key = keyOf(record);
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

function createFamilyIds(spirits) {
  const knownNames = new Set(spirits.map(({ fullName }) => fullName));
  const parents = new Map([...knownNames].map((name) => [name, name]));

  function find(name) {
    const parent = parents.get(name);
    if (parent === name) return name;
    const root = find(parent);
    parents.set(name, root);
    return root;
  }

  function union(left, right) {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parents.set(rightRoot, leftRoot);
  }

  spirits.forEach((spirit) => {
    (spirit.evolutionChainNames ?? [])
      .filter((name) => knownNames.has(name))
      .forEach((name) => union(spirit.fullName, name));
  });

  const families = new Map();
  [...knownNames].forEach((name) => {
    const root = find(name);
    if (!families.has(root)) families.set(root, []);
    families.get(root).push(name);
  });

  const familyIdByName = new Map();
  families.forEach((names) => {
    const sortedNames = [...names].sort((left, right) =>
      left.localeCompare(right, "zh-CN"),
    );
    const familyId = stableId("evolution_family", ...sortedNames);
    sortedNames.forEach((name) => familyIdByName.set(name, familyId));
  });
  return familyIdByName;
}

async function fetchEvolutionPositions() {
  const api = new URL("https://wiki.biligame.com/rocom/api.php");
  api.search = new URLSearchParams({
    action: "parse",
    format: "json",
    formatversion: "2",
    oldid: String(BWIKI_REVISION),
    prop: "text",
  }).toString();
  let response;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    response = await fetch(api, {
      headers: {
        accept: "application/json",
        "user-agent": "rock-calculator/1.0 (+local immutable data snapshot)",
      },
    });
    if (response.ok || attempt === 4) break;
    await new Promise((resolve) => setTimeout(resolve, attempt * 500));
  }
  invariant(response.ok, `BWIKI 固定修订抓取失败：HTTP ${response.status}`);
  const payload = await response.json();
  const html = payload.parse?.text;
  invariant(typeof html === "string", "BWIKI 固定修订缺少 parse.text");

  const $ = load(html);
  const rows = $("table.wikitable tr.divsort")
    .toArray()
    .map((row) => {
      const cells = $(row).children("td").toArray();
      const link = $(cells[2]).find("a[title]").first();
      return {
        detailUrl: absoluteBwikiUrl(link.attr("href")),
        evolutionPosition: cleanText($(row).attr("data-param7")),
        fullName: cleanText(link.attr("title") ?? link.text()),
        sourceCategory: cleanText($(row).attr("data-param4")),
        stage: cleanText($(row).attr("data-param1")),
      };
    })
    .filter(({ fullName }) => fullName);

  return { html, rows };
}

function buildRuntimeModule(meta, records) {
  const runtimeRecords = records.filter(
    ({ formRole, formRoleStatus }) =>
      formRoleStatus === "manual" || formRole === "final",
  );
  const verifiedCodes = runtimeRecords
    .filter(({ formRoleStatus }) => formRoleStatus === "verified")
    .map(({ formRole, spiritId }) => {
      const digest = spiritId.replace(/^spirit_/u, "");
      invariant(/^[a-f0-9]{16}$/u.test(digest), `精灵 id 无法压缩：${spiritId}`);
      invariant(formRole === "final", `verified runtime 只保存终态：${spiritId}`);
      return digest;
    })
    .join("");
  const manualRecords = runtimeRecords
    .filter(({ formRoleStatus }) => formRoleStatus === "manual")
    .map(({ evolutionFamilyId, formRole, spiritId }) => [
      spiritId.replace(/^spirit_/u, ""),
      evolutionFamilyId,
      formRole === "final" ? "f" : "g",
    ]);

  return `export const FORM_ROLE_MANIFEST_VERSION = ${JSON.stringify(MANIFEST_VERSION)};

export const FORM_ROLE_MANIFEST_META = ${JSON.stringify(meta, null, 2)};

const VERIFIED_FORM_ROLE_CODES = ${JSON.stringify(verifiedCodes)};
const MANUAL_FORM_ROLE_RECORDS = Object.freeze(${JSON.stringify(manualRecords)});

function roleFromCode(code) {
  return code === "f" ? "final" : "growth";
}

export const FORM_ROLE_MANIFEST = Object.freeze(
  Object.fromEntries(
    [
      ...Array.from(
        { length: VERIFIED_FORM_ROLE_CODES.length / 16 },
        (_, index) => {
          const digest = VERIFIED_FORM_ROLE_CODES.slice(index * 16, index * 16 + 16);
          return [
            \`spirit_\${digest}\`,
            Object.freeze({
              evolutionFamilyId: null,
              formRole: "final",
              formRoleStatus: "verified",
            }),
          ];
        },
      ),
      ...MANUAL_FORM_ROLE_RECORDS.map(([digest, evolutionFamilyId, roleCode]) => [
        \`spirit_\${digest}\`,
        Object.freeze({
          evolutionFamilyId,
          formRole: roleFromCode(roleCode),
          formRoleStatus: "manual",
        }),
      ]),
    ],
  ),
);
`;
}

export async function buildFormRoleManifest() {
  const [snapshot, s4Candidate, upstream] = await Promise.all([
    readFile(SNAPSHOT_PATH, "utf8").then(JSON.parse),
    readFile(S4_CANDIDATE_PATH, "utf8").then(JSON.parse),
    fetchEvolutionPositions(),
  ]);
  const legacySpirits = snapshot.spirits.filter(
    ({ sourceCategory }) => sourceCategory !== "S4前瞻",
  );
  const legacyByName = new Map(
    legacySpirits.map((spirit) => [spirit.fullName, spirit]),
  );
  const upstreamByName = new Map(
    upstream.rows.map((row) => [row.fullName, row]),
  );
  invariant(upstream.rows.length === 594, `BWIKI 行数漂移：${upstream.rows.length}`);
  invariant(upstreamByName.size === 594, "BWIKI 名称存在重复");
  invariant(legacySpirits.length === 594, `旧快照行数漂移：${legacySpirits.length}`);
  invariant(legacyByName.size === 594, "旧快照名称存在重复");

  const missingUpstream = legacySpirits.filter(
    ({ fullName }) => !upstreamByName.has(fullName),
  );
  const missingSnapshot = upstream.rows.filter(
    ({ fullName }) => !legacyByName.has(fullName),
  );
  invariant(
    missingUpstream.length === 0 && missingSnapshot.length === 0,
    `BWIKI 与快照名称无法一一联接：upstream=${missingUpstream.length} snapshot=${missingSnapshot.length}`,
  );

  const familyIds = createFamilyIds(legacySpirits);
  const legacyRecords = legacySpirits.map((spirit) => {
    const upstreamRow = upstreamByName.get(spirit.fullName);
    invariant(
      upstreamRow.detailUrl === spirit.detailUrl,
      `详情链接不一致：${spirit.fullName}`,
    );
    invariant(
      upstreamRow.sourceCategory === spirit.sourceCategory,
      `形态来源不一致：${spirit.fullName}`,
    );
    const verifiedBoss =
      spirit.stage === "首领" && spirit.sourceCategory === "首领形态";
    if (!verifiedBoss) {
      invariant(
        upstreamRow.stage === spirit.stage,
        `阶段不一致：${spirit.fullName}`,
      );
    }
    const finalPosition = upstreamRow.evolutionPosition
      .split("|")
      .includes("最终");
    return {
      evolutionFamilyId: familyIds.get(spirit.fullName) ?? null,
      evolutionPosition: upstreamRow.evolutionPosition || null,
      formRole: verifiedBoss ? "boss" : finalPosition ? "final" : "growth",
      formRoleStatus: "verified",
      fullName: spirit.fullName,
      sourceId: BWIKI_SOURCE_ID,
      spiritId: spirit.id,
    };
  });

  const currentS4ByName = new Map(
    snapshot.spirits
      .filter(({ sourceCategory }) => sourceCategory === "S4前瞻")
      .map((spirit) => [spirit.fullName, spirit]),
  );
  const s4Records = s4Candidate.families.flatMap((family) =>
    family.forms.map((form) => {
      const spirit = currentS4ByName.get(form.name);
      invariant(spirit, `S4 形态未进入当前快照：${form.name}`);
      return {
        evolutionFamilyId: family.candidateFamilyKey,
        evolutionPosition: form.isFinal ? "最终" : "初始",
        formRole: form.isFinal ? "final" : "growth",
        formRoleStatus: "manual",
        fullName: form.name,
        sourceId: S4_SOURCE_ID,
        spiritId: spirit.id,
      };
    }),
  );
  invariant(s4Records.length === 23, `S4 形态数量漂移：${s4Records.length}`);

  const recordsById = new Map(
    [...legacyRecords, ...s4Records].map((record) => [record.spiritId, record]),
  );
  invariant(recordsById.size === snapshot.spirits.length, "形态清单 id 存在重复或遗漏");
  const records = snapshot.spirits.map(({ id }) => recordsById.get(id));
  const roleCounts = countBy(records, ({ formRole }) => formRole);
  const statusCounts = countBy(records, ({ formRoleStatus }) => formRoleStatus);
  invariant(
    roleCounts.boss === 61 &&
      roleCounts.final === 253 &&
      roleCounts.growth === 303,
    `形态计数漂移：${JSON.stringify(roleCounts)}`,
  );
  invariant(
    statusCounts.verified === 594 && statusCounts.manual === 23,
    `证据状态计数漂移：${JSON.stringify(statusCounts)}`,
  );

  const snapshotBwikiSource = snapshot.meta.sources.find(
    (source) =>
      source.title === "精灵筛选" && source.revision === BWIKI_REVISION,
  );
  invariant(snapshotBwikiSource, "当前快照缺少 BWIKI 精灵筛选来源");
  const canonicalUpstreamRows = legacySpirits.map((spirit) => ({
    spiritId: spirit.id,
    fullName: spirit.fullName,
    evolutionPosition: upstreamByName.get(spirit.fullName).evolutionPosition,
  }));
  const canonicalRecords = records.map(
    ({
      evolutionFamilyId,
      evolutionPosition,
      formRole,
      formRoleStatus,
      fullName,
      sourceId,
      spiritId,
    }) => ({
      evolutionFamilyId,
      evolutionPosition,
      formRole,
      formRoleStatus,
      fullName,
      sourceId,
      spiritId,
    }),
  );
  const meta = {
    counts: {
      boss: roleCounts.boss,
      final: roleCounts.final,
      growth: roleCounts.growth,
      manual: statusCounts.manual,
      records: records.length,
      runtimeRecords: roleCounts.final + roleCounts.growth,
      verified: statusCounts.verified,
    },
    normalizedRecordsSha256: sha256(JSON.stringify(canonicalRecords)),
    sources: [
      {
        ...snapshotBwikiSource,
        extraction: {
          htmlSha256: sha256(upstream.html),
          normalizedRowsSha256: sha256(JSON.stringify(canonicalUpstreamRows)),
          rows: upstream.rows.length,
        },
        id: BWIKI_SOURCE_ID,
      },
      {
        ...s4Candidate.meta.source,
        id: S4_SOURCE_ID,
      },
    ],
    version: MANIFEST_VERSION,
  };

  return {
    catalog: { meta, records },
    runtimeModule: buildRuntimeModule(meta, records),
  };
}

async function runCli() {
  invariant(process.argv.includes("--write"), "请显式传入 --write 生成形态清单");
  const fromCatalog = process.argv.includes("--from-catalog");
  const { catalog, runtimeModule } = fromCatalog
    ? await readFile(CATALOG_PATH, "utf8")
        .then(JSON.parse)
        .then((existingCatalog) => ({
          catalog: existingCatalog,
          runtimeModule: buildRuntimeModule(
            existingCatalog.meta,
            existingCatalog.records,
          ),
        }))
    : await buildFormRoleManifest();
  await mkdir(path.dirname(CATALOG_PATH), { recursive: true });
  if (!fromCatalog) {
    await writeFile(CATALOG_PATH, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
  }
  await writeFile(RUNTIME_PATH, runtimeModule, "utf8");
  console.log(
    JSON.stringify(
      {
        catalogPath: path.relative(process.cwd(), CATALOG_PATH),
        counts: catalog.meta.counts,
        normalizedRecordsSha256: catalog.meta.normalizedRecordsSha256,
        runtimePath: path.relative(process.cwd(), RUNTIME_PATH),
      },
      null,
      2,
    ),
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  await runCli();
}
