import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import {
  FORM_ROLE_MANIFEST,
  FORM_ROLE_MANIFEST_META,
  FORM_ROLE_MANIFEST_VERSION,
} from "../../src/data/form-role-manifest-v1.js";
import { resolveSpiritFormRole } from "../../src/features/team-ability/domain/spirit-form-role.js";

const candidate = JSON.parse(
  readFileSync("data/candidates/s4-preview-new-spirits.json", "utf8"),
);
const catalog = JSON.parse(
  readFileSync("data/form-roles/form-role-v1.json", "utf8"),
);
const current = JSON.parse(
  readFileSync("data/snapshots/current.json", "utf8"),
);

describe("resolveSpiritFormRole", () => {
  test("uses the explicit manual S4 terminal-form record instead of guessing from stage", () => {
    expect(
      resolveSpiritFormRole({
        id: "spirit_8735efa1d0793f6a",
        fullName: "测风蝉",
        stage: "二阶",
        sourceCategory: "S4前瞻",
      }),
    ).toEqual({
      evolutionFamilyId: "s4-family-01",
      formRole: "final",
      formRoleStatus: "manual",
    });
  });

  test("verifies a boss only when stage and source category agree", () => {
    expect(
      resolveSpiritFormRole({
        id: "spirit_f60e2755ae42cf41",
        fullName: "圣光迪莫",
        stage: "首领",
        sourceCategory: "首领形态",
      }),
    ).toEqual({
      evolutionFamilyId: null,
      formRole: "boss",
      formRoleStatus: "verified",
    });
  });

  test("keeps corroborated boss identity ahead of a conflicting curated entry", () => {
    expect(
      resolveSpiritFormRole({
        id: "spirit_8735efa1d0793f6a",
        stage: "首领",
        sourceCategory: "首领形态",
      }),
    ).toEqual({
      evolutionFamilyId: null,
      formRole: "boss",
      formRoleStatus: "verified",
    });
  });

  test("marks an unclassified form for manual review without admitting it to ranking", () => {
    expect(
      resolveSpiritFormRole({
        id: "unverified-boss",
        stage: "首领",
        sourceCategory: "原始形态",
      }),
    ).toEqual({
      evolutionFamilyId: null,
      formRole: "unknown",
      formRoleStatus: "manual",
    });
  });
});

test("runtime manifest is the exact non-boss projection of the auditable catalog", () => {
  const expected = Object.fromEntries(
    catalog.records
      .filter(
        ({ formRole, formRoleStatus }) =>
          formRoleStatus === "manual" || formRole === "final",
      )
      .map(
        ({
          evolutionFamilyId,
          formRole,
          formRoleStatus,
          spiritId,
        }) => [
          spiritId,
          {
            evolutionFamilyId:
              formRoleStatus === "verified" ? null : evolutionFamilyId,
            formRole,
            formRoleStatus,
          },
        ],
      ),
  );

  expect(FORM_ROLE_MANIFEST_VERSION).toBe("form-role-v1");
  expect(FORM_ROLE_MANIFEST).toEqual(expected);
});

test("catalog preserves fixed source identity, coverage, and evidence status", () => {
  const bwikiSource = current.meta.sources.find(
    ({ revision, title }) => title === "精灵筛选" && revision === 41360,
  );
  const manifestBwikiSource = catalog.meta.sources.find(
    ({ id }) => id === "bwiki-spirit-filter-41360",
  );
  const manifestS4Source = catalog.meta.sources.find(
    ({ id }) => id === "s4-preview-new-spirits-2026-09-02",
  );

  expect(catalog.meta).toEqual(FORM_ROLE_MANIFEST_META);
  expect(catalog.meta.counts).toEqual({
    boss: 61,
    final: 253,
    growth: 303,
    manual: 23,
    records: 617,
    runtimeRecords: 556,
    verified: 594,
  });
  expect(manifestBwikiSource).toMatchObject({
    ...bwikiSource,
    extraction: {
      htmlSha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
      normalizedRowsSha256:
        "b07c25f0c7c4c7ef874db266a92b84e5aafb4dad2b51dc77d1de3c812e604460",
      rows: 594,
    },
  });
  expect(manifestS4Source).toMatchObject(candidate.meta.source);
});

test("current snapshot has no unclassified form and only finals or bosses are eligible", () => {
  const roleCounts = current.spirits.reduce((counts, spirit) => {
    const { formRole } = resolveSpiritFormRole(spirit);
    counts[formRole] = (counts[formRole] ?? 0) + 1;
    return counts;
  }, {});

  expect(roleCounts).toEqual({
    boss: 63,
    final: 253,
    growth: 303,
  });
});
