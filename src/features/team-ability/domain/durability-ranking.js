import { FORM_ROLE_MANIFEST_VERSION } from "../../../data/form-role-manifest-v1.js";
import { calculateDurability } from "./durability.js";
import { getNatureMultipliers } from "../../../domain/natures.js";
import { resolveSpiritFormRole } from "./spirit-form-role.js";
import {
  calculateAllPanelStats,
  hasCompleteRaceStats,
} from "../../../domain/stat.js";

const STANDARD_DISPLAY_IVS = Object.freeze({
  hp: 60,
  magicalAttack: 0,
  magicalDefense: 60,
  physicalAttack: 0,
  physicalDefense: 60,
  speed: 0,
});

export const STANDARD_DURABILITY_TEMPLATES = Object.freeze({
  "standard-hp-v1": Object.freeze({
    displayIvs: STANDARD_DISPLAY_IVS,
    id: "standard-hp-v1",
    label: "生命性格",
    level: 60,
    natureId: "grounded",
  }),
  "standard-neutral-v1": Object.freeze({
    displayIvs: STANDARD_DISPLAY_IVS,
    id: "standard-neutral-v1",
    label: "中性性格",
    level: 60,
    natureId: "neutral",
  }),
  "standard-physical-v1": Object.freeze({
    displayIvs: STANDARD_DISPLAY_IVS,
    id: "standard-physical-v1",
    label: "物防性格",
    level: 60,
    natureId: "relaxed",
  }),
  "standard-magical-v1": Object.freeze({
    displayIvs: STANDARD_DISPLAY_IVS,
    id: "standard-magical-v1",
    label: "魔防性格",
    level: 60,
    natureId: "cautious",
  }),
});

const RANKING_METRICS = Object.freeze(["physical", "magical", "combined"]);
const identityCollator = new Intl.Collator("zh-CN", {
  numeric: true,
  sensitivity: "base",
});

function compareIdentity(left, right) {
  const leftDexNo = left.spirit.dexNo;
  const rightDexNo = right.spirit.dexNo;
  if (leftDexNo == null && rightDexNo != null) return 1;
  if (leftDexNo != null && rightDexNo == null) return -1;
  const dexDifference = identityCollator.compare(
    String(leftDexNo ?? ""),
    String(rightDexNo ?? ""),
  );
  if (dexDifference !== 0) return dexDifference;
  const nameDifference = identityCollator.compare(
    left.spirit.fullName ?? left.spirit.baseName ?? "",
    right.spirit.fullName ?? right.spirit.baseName ?? "",
  );
  if (nameDifference !== 0) return nameDifference;
  return String(left.spiritId).localeCompare(String(right.spiritId));
}

function compareByMetric(metric) {
  return (left, right) =>
    right.durability.display[metric] - left.durability.display[metric] ||
    compareIdentity(left, right);
}

function rankEntries(entries, rankKey) {
  const rankByMetric = Object.fromEntries(
    RANKING_METRICS.map((metric) => {
      const sorted = [...entries].sort(compareByMetric(metric));
      const ranks = new Map();
      let previousScore;
      let previousRank = 0;
      sorted.forEach((entry, index) => {
        const score = entry.durability.display[metric];
        const rank = index > 0 && score === previousScore
          ? previousRank
          : index + 1;
        ranks.set(entry.spiritId, rank);
        previousRank = rank;
        previousScore = score;
      });
      return [metric, ranks];
    }),
  );
  return entries.map((entry) => ({
    ...entry,
    [rankKey]: Object.fromEntries(
      RANKING_METRICS.map((metric) => [
        metric,
        rankByMetric[metric].get(entry.spiritId),
      ]),
    ),
  }));
}

function normalizeSearchText(value) {
  return String(value ?? "").normalize("NFKC").toLocaleLowerCase("zh-CN");
}

function matchesQuery(entry, query) {
  const normalizedQuery = normalizeSearchText(query).trim();
  if (!normalizedQuery) return true;
  return [
    entry.spirit.fullName,
    entry.spirit.baseName,
    entry.spirit.variantName,
    entry.spirit.dexNo,
    entry.spirit.searchText,
    ...(entry.spirit.aliases ?? []),
    ...(entry.spirit.types ?? []),
  ].some((value) => normalizeSearchText(value).includes(normalizedQuery));
}

function calculateRankingEntry(spirit, template) {
  const form = resolveSpiritFormRole(spirit);
  const panelStats = calculateAllPanelStats({
    raceStats: spirit.raceStats,
    displayIvs: template.displayIvs,
    natureMultipliers: getNatureMultipliers(template.natureId),
  });
  return {
    durability: calculateDurability({
      maxHp: panelStats.hp,
      physicalDefense: panelStats.physicalDefense,
      magicalDefense: panelStats.magicalDefense,
    }),
    evolutionFamilyId: form.evolutionFamilyId,
    formRole: form.formRole,
    formRoleStatus: form.formRoleStatus,
    panelStats,
    spirit,
    spiritId: spirit.id,
  };
}

function exclusionFor(spirit, form, reason) {
  return {
    evolutionFamilyId: form.evolutionFamilyId,
    formRole: form.formRole,
    formRoleStatus: form.formRoleStatus,
    fullName: spirit?.fullName ?? spirit?.baseName ?? "",
    reason,
    spiritId: spirit?.id ?? null,
  };
}

export function createDurabilityRanking({
  filter,
  query = "",
  spirits = [],
  spiritFilterRevision,
  sortBy = "combined",
  templateId = "standard-hp-v1",
} = {}) {
  const template = STANDARD_DURABILITY_TEMPLATES[templateId];
  if (!template) {
    const error = new TypeError(`未知耐久榜模板：${templateId}`);
    error.code = "UNKNOWN_DURABILITY_TEMPLATE";
    throw error;
  }
  if (!RANKING_METRICS.includes(sortBy)) {
    const error = new TypeError(`未知耐久榜指标：${sortBy}`);
    error.code = "UNKNOWN_DURABILITY_METRIC";
    throw error;
  }
  const eligible = [];
  const excluded = [];
  for (const spirit of spirits) {
    const form = resolveSpiritFormRole(spirit, { spiritFilterRevision });
    if (["final", "boss"].includes(form.formRole)) {
      if (hasCompleteRaceStats(spirit.raceStats)) {
        eligible.push(spirit);
      } else {
        excluded.push(
          exclusionFor(spirit, form, "INCOMPLETE_RACE_STATS"),
        );
      }
    } else {
      excluded.push(
        exclusionFor(
          spirit,
          form,
          form.formRole === "growth" ? "GROWTH_FORM" : "UNKNOWN_FORM_ROLE",
        ),
      );
    }
  }
  const globallyRanked = rankEntries(
    eligible.map((spirit) => calculateRankingEntry(spirit, template)),
    "globalRank",
  );
  const filtered = typeof filter === "function"
    ? globallyRanked.filter((entry) => filter(entry))
    : globallyRanked;
  const rows = rankEntries(filtered, "filteredRank")
    .filter((entry) => matchesQuery(entry, query))
    .sort(compareByMetric(sortBy));
  const excludedByReason = Object.fromEntries(
    [...new Set(excluded.map(({ reason }) => reason))].map((reason) => [
      reason,
      excluded.filter((entry) => entry.reason === reason).length,
    ]),
  );
  return {
    counts: {
      eligible: globallyRanked.length,
      excluded: excluded.length,
      excludedByReason,
      total: spirits.length,
      visible: rows.length,
    },
    excluded,
    formRoleManifestVersion: FORM_ROLE_MANIFEST_VERSION,
    rows,
    template,
  };
}
