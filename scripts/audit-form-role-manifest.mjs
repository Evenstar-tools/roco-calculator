import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  FORM_ROLE_MANIFEST,
  FORM_ROLE_MANIFEST_META,
} from "../src/data/form-role-manifest-v1.js";

export const FORM_ROLE_AUDIT_SCHEMA_VERSION = "form-role-audit-v1";

const ALLOWED_FORM_ROLES = new Set(["growth", "final"]);

function issue(code, pathValue, message, details = {}) {
  return { code, path: pathValue, message, ...details };
}

function countDuplicates(items, keyOf, issueFactory) {
  const seen = new Map();
  const issues = [];
  items.forEach((item, index) => {
    const key = keyOf(item);
    if (!key) return;
    if (seen.has(key)) {
      issues.push(issueFactory({
        duplicateIndex: index,
        firstIndex: seen.get(key),
        item,
        key,
      }));
      return;
    }
    seen.set(key, index);
  });
  return issues;
}

function manifestCountIssues(manifestMeta, actualCounts) {
  const declared = manifestMeta?.counts ?? {};
  return Object.entries(actualCounts).flatMap(([key, actual]) => {
    if (declared[key] === actual) return [];
    return [
      issue(
        "MANIFEST_COUNT_MISMATCH",
        `manifestMeta.counts.${key}`,
        `形态清单声明数量 ${declared[key] ?? "缺失"} 与实际数量 ${actual} 不一致`,
        { actual, declared: declared[key] ?? null, key },
      ),
    ];
  });
}

export function auditFormRoleManifest({
  manifest = FORM_ROLE_MANIFEST,
  manifestMeta = FORM_ROLE_MANIFEST_META,
  snapshot,
} = {}) {
  const spirits = Array.isArray(snapshot?.spirits) ? snapshot.spirits : [];
  const manifestEntries = Object.entries(manifest ?? {}).map(
    ([spiritId, entry]) => ({ spiritId, ...entry }),
  );
  const snapshotById = new Map();
  for (const spirit of spirits) {
    if (!snapshotById.has(spirit?.id)) snapshotById.set(spirit?.id, spirit);
  }

  const duplicateSnapshotIssues = countDuplicates(
    spirits,
    (spirit) => spirit?.id,
    ({ duplicateIndex, firstIndex, key }) =>
      issue(
        "DUPLICATE_SNAPSHOT_SPIRIT_ID",
        `snapshot.spirits[${duplicateIndex}].id`,
        `快照精灵 id 重复：${key}`,
        { duplicateIndex, firstIndex, spiritId: key },
      ),
  );
  const duplicateManifestNameIssues = countDuplicates(
    manifestEntries,
    (entry) => entry.fullName,
    ({ duplicateIndex, firstIndex, key }) =>
      issue(
        "DUPLICATE_MANIFEST_NAME",
        `manifest.${manifestEntries[duplicateIndex].spiritId}.fullName`,
        `形态清单名称重复：${key}`,
        { duplicateIndex, firstIndex, fullName: key },
      ),
  );

  const errors = [
    ...duplicateSnapshotIssues,
    ...duplicateManifestNameIssues,
  ];
  let final = 0;
  let growth = 0;
  let invalidRoles = 0;
  let missingFamilies = 0;
  let missingManifestSpirits = 0;
  let nameMismatches = 0;

  manifestEntries.forEach((entry) => {
    const basePath = `manifest.${entry.spiritId}`;
    if (entry.formRole === "final") final += 1;
    if (entry.formRole === "growth") growth += 1;
    if (!ALLOWED_FORM_ROLES.has(entry.formRole)) {
      invalidRoles += 1;
      errors.push(
        issue(
          "INVALID_FORM_ROLE",
          `${basePath}.formRole`,
          "形态清单 formRole 只允许 growth 或 final",
          { spiritId: entry.spiritId, value: entry.formRole ?? null },
        ),
      );
    }
    if (
      entry.evolutionFamilyId !== null &&
      (typeof entry.evolutionFamilyId !== "string" ||
        entry.evolutionFamilyId.trim() === "")
    ) {
      missingFamilies += 1;
      errors.push(
        issue(
          "MISSING_EVOLUTION_FAMILY_ID",
          `${basePath}.evolutionFamilyId`,
          "形态清单 evolutionFamilyId 只允许 null 或非空字符串",
          { spiritId: entry.spiritId },
        ),
      );
    }
    const spirit = snapshotById.get(entry.spiritId);
    if (!spirit) {
      missingManifestSpirits += 1;
      errors.push(
        issue(
          "MANIFEST_SPIRIT_MISSING",
          basePath,
          `形态清单 id 在快照中不存在：${entry.spiritId}`,
          { fullName: entry.fullName ?? null, spiritId: entry.spiritId },
        ),
      );
      return;
    }
    if (entry.fullName != null && spirit.fullName !== entry.fullName) {
      nameMismatches += 1;
      errors.push(
        issue(
          "SPIRIT_NAME_MISMATCH",
          `${basePath}.fullName`,
          `形态清单名称与快照不一致：${entry.fullName ?? "缺失"} != ${spirit.fullName ?? "缺失"}`,
          {
            actual: entry.fullName ?? null,
            expected: spirit.fullName ?? null,
            spiritId: entry.spiritId,
          },
        ),
      );
    }
  });

  let bossCrossCheckMismatches = 0;
  let unknownForms = 0;
  let verifiedBosses = 0;
  const manifestIds = new Set(manifestEntries.map(({ spiritId }) => spiritId));
  spirits.forEach((spirit, index) => {
    const stageBoss = spirit?.stage === "首领";
    const sourceBoss = spirit?.sourceCategory === "首领形态";
    if (stageBoss && sourceBoss) verifiedBosses += 1;
    if (stageBoss !== sourceBoss) {
      bossCrossCheckMismatches += 1;
      errors.push(
        issue(
          "BOSS_CROSS_CHECK_MISMATCH",
          `snapshot.spirits[${index}]`,
          "首领资格必须同时满足 stage=首领 与 sourceCategory=首领形态",
          {
            fullName: spirit?.fullName ?? null,
            sourceCategory: spirit?.sourceCategory ?? null,
            spiritId: spirit?.id ?? null,
            stage: spirit?.stage ?? null,
          },
        ),
      );
    }
    if (!manifestIds.has(spirit?.id) && !(stageBoss && sourceBoss)) {
      const verifiedLegacyGrowth =
        spirit?.source?.title === "精灵筛选" &&
        Number(spirit?.source?.revision) === 41360 &&
        spirit?.sourceCategory !== "S4前瞻";
      if (verifiedLegacyGrowth) growth += 1;
      else unknownForms += 1;
    }
  });

  const actualManifestCounts = {
    final,
    growth,
    runtimeRecords: final + growth,
  };
  errors.push(...manifestCountIssues(manifestMeta, actualManifestCounts));
  if (
    typeof manifestMeta?.version !== "string" ||
    manifestMeta.version.trim() === ""
  ) {
    errors.push(
      issue(
        "MISSING_MANIFEST_VERSION",
        "manifestMeta.version",
        "形态清单必须声明非空版本号",
      ),
    );
  }

  return {
    schemaVersion: FORM_ROLE_AUDIT_SCHEMA_VERSION,
    manifestVersion: manifestMeta?.version ?? null,
    ok: errors.length === 0,
    counts: {
      bossCrossCheckMismatches,
      duplicateManifestNames: duplicateManifestNameIssues.length,
      duplicateSnapshotSpiritIds: duplicateSnapshotIssues.length,
      final,
      growth,
      invalidRoles,
      manifestRecords: manifestEntries.length,
      missingFamilies,
      missingManifestSpirits,
      nameMismatches,
      snapshotSpirits: spirits.length,
      unknownForms,
      verifiedBosses,
    },
    errors,
  };
}

async function runCli() {
  const snapshotPath = path.resolve(
    process.argv[2] ?? "data/snapshots/current.json",
  );
  try {
    const snapshot = JSON.parse(await readFile(snapshotPath, "utf8"));
    const summary = auditFormRoleManifest({ snapshot });
    console.log(JSON.stringify(summary, null, 2));
    process.exitCode = summary.ok ? 0 : 1;
  } catch (error) {
    const summary = {
      schemaVersion: FORM_ROLE_AUDIT_SCHEMA_VERSION,
      manifestVersion: FORM_ROLE_MANIFEST_META.version,
      ok: false,
      counts: null,
      errors: [
        issue(
          "AUDIT_INPUT_ERROR",
          snapshotPath,
          error instanceof Error ? error.message : String(error),
        ),
      ],
    };
    console.log(JSON.stringify(summary, null, 2));
    process.exitCode = 1;
  }
}

if (
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
) {
  await runCli();
}
