import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import {
  auditFormRoleManifest,
  FORM_ROLE_AUDIT_SCHEMA_VERSION,
} from "../../scripts/audit-form-role-manifest.mjs";
import {
  FORM_ROLE_MANIFEST,
  FORM_ROLE_MANIFEST_META,
} from "../../src/data/form-role-manifest-v1.js";

const current = JSON.parse(
  readFileSync("data/snapshots/current.json", "utf8"),
);

describe("form-role manifest audit", () => {
  test("reports the current manifest, verified bosses, and unknown forms", () => {
    const result = auditFormRoleManifest({
      manifest: FORM_ROLE_MANIFEST,
      manifestMeta: FORM_ROLE_MANIFEST_META,
      snapshot: current,
    });

    expect(result).toMatchObject({
      ok: true,
      schemaVersion: FORM_ROLE_AUDIT_SCHEMA_VERSION,
      manifestVersion: "form-role-v1",
      counts: {
        bossCrossCheckMismatches: 0,
        duplicateManifestNames: 0,
        duplicateSnapshotSpiritIds: 0,
        final: 253,
        growth: 303,
        invalidRoles: 0,
        manifestRecords: 265,
        missingFamilies: 0,
        missingManifestSpirits: 0,
        nameMismatches: 0,
        snapshotSpirits: 617,
        unknownForms: 0,
        verifiedBosses: 61,
      },
      errors: [],
    });
  });

  test("collects malformed entries, duplicates, omissions, and boss disagreement", () => {
    const result = auditFormRoleManifest({
      manifest: {
        spirit_alpha: {
          evolutionFamilyId: "family-a",
          formRole: "final",
          fullName: "错名",
        },
        spirit_beta: {
          evolutionFamilyId: "",
          formRole: "boss",
          fullName: "重复名",
        },
        spirit_missing: {
          evolutionFamilyId: "family-c",
          formRole: "growth",
          fullName: "重复名",
        },
      },
      manifestMeta: {
        counts: { final: 99, growth: 99, records: 99 },
        version: "fixture-v1",
      },
      snapshot: {
        spirits: [
          {
            id: "spirit_alpha",
            fullName: "正确名",
            sourceCategory: "原始形态",
            stage: "一阶",
          },
          {
            id: "spirit_alpha",
            fullName: "正确名副本",
            sourceCategory: "原始形态",
            stage: "一阶",
          },
          {
            id: "spirit_beta",
            fullName: "重复名",
            sourceCategory: "原始形态",
            stage: "首领",
          },
          {
            id: "spirit_gamma",
            fullName: "未归类",
            sourceCategory: "原始形态",
            stage: "一阶",
          },
        ],
      },
    });

    expect(result.ok).toBe(false);
    expect(result.counts).toMatchObject({
      bossCrossCheckMismatches: 1,
      duplicateManifestNames: 1,
      duplicateSnapshotSpiritIds: 1,
      invalidRoles: 1,
      missingFamilies: 1,
      missingManifestSpirits: 1,
      nameMismatches: 1,
      unknownForms: 1,
      verifiedBosses: 0,
    });
    expect(result.errors.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        "BOSS_CROSS_CHECK_MISMATCH",
        "DUPLICATE_MANIFEST_NAME",
        "DUPLICATE_SNAPSHOT_SPIRIT_ID",
        "INVALID_FORM_ROLE",
        "MANIFEST_COUNT_MISMATCH",
        "MANIFEST_SPIRIT_MISSING",
        "MISSING_EVOLUTION_FAMILY_ID",
        "SPIRIT_NAME_MISMATCH",
      ]),
    );
  });

  test("CLI prints one parseable JSON summary", () => {
    const output = execFileSync(
      process.execPath,
      ["scripts/audit-form-role-manifest.mjs"],
      { encoding: "utf8" },
    );
    const summary = JSON.parse(output);

    expect(summary.ok).toBe(true);
    expect(summary.counts.unknownForms).toBe(0);
    expect(summary.errors).toEqual([]);
  });
});
