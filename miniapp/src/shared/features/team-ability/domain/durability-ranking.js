import { FORM_ROLE_MANIFEST_VERSION } from "../../../data/form-role-manifest-v1.js";
import { calculateDurability } from "./durability.js";
import { getS5LevelIncomingDamagePercent } from "../../../domain/s5-preview-traits.js";
import { getNatureMultipliers } from "../../../domain/natures.js";
import { getTraitEffectInputs, resolveTraitEffectRule } from "../../../domain/trait-effects.js";
import { defenseStatForDamage } from "../../../domain/skill-result/numeric.js";
import { createRankingLevelVariants, resolveRankingFormRole } from "./ranking-levels.js";
import { ELEMENT_TYPES, getTypeMultiplier } from "../../../domain/type-chart.js";
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
const PASSIVE_CONFIGURATIONS = [
  { name: "蹦床松鼠", traitName: "囤积", label: "10能量", description: "囤积 · 当前能量10，双防+100%", context: { defenderTraitStacks: 10 } },
  { name: "鸡麻麻", traitName: "护犊", label: "护犊已触发", description: "护犊 · 队友存在萌化，双防+50%", context: { defenderTraitS5EggTriggered: true } },
  { name: "卷胡巨獭", traitName: "保守派", label: "总能耗＜4", description: "保守派 · 总技能能耗＜4，双防+80%", context: { traitActivated: true } },
  { name: "古卷匣魔像", traitName: "构装契约者", label: "入场敌方魔力1", description: "构装契约者 · 入场时敌方魔力为1，双防+100%", context: { traitActivated: true } },
  { name: "上岸蛙", traitName: "张弛有度", label: "非周末", description: "张弛有度 · 非周末，双防+40%", context: { traitActivated: false } },
];

function createPassiveVariants(spirit, traits) {
  return PASSIVE_CONFIGURATIONS.filter(preset => preset.name === spirit.fullName).flatMap(preset => {
    const trait = traits.find(entry => entry.name === preset.traitName && spirit.traitIds?.includes(entry.id));
    if (!trait) return [];
    const context = Object.fromEntries(getTraitEffectInputs(trait, "defender").map(control => [
      control.id, preset.context[control.contextKey] ?? control.defaultValue,
    ]));
    const defenseStages = Object.fromEntries(["physical", "magical"].map(category => [category,
      resolveTraitEffectRule(trait, "defender", {
        attacker: {}, defender: {}, context, skill: { category, type: "普通" },
      })?.defenseLevelBonus ?? 0,
    ]));
    if (!Object.values(defenseStages).some(value => value > 0)) return [];
    return [{
      id: `${spirit.id}:passive:${trait.id}`, level: 60,
      name: `${spirit.fullName} · ${preset.label}`,
      passiveLabel: preset.label, passiveDescription: preset.description, defenseStages,
    }];
  });
}

export const DURABILITY_MULTIPLIERS = Object.freeze([0.25, 0.5, 1, 2, 3]);

export function getDurabilityMultipliers(typeChart) {
  return typeChart?.matrix?.some((row) => row.includes(0))
    ? [0, ...DURABILITY_MULTIPLIERS] : [...DURABILITY_MULTIPLIERS];
}
const identityCollator = typeof Intl !== "undefined" && typeof Intl.Collator === "function"
  ? new Intl.Collator("zh-CN", { numeric: true, sensitivity: "base" })
  : {
      compare(left, right) {
        if (left !== "" && right !== "" &&
          Number.isFinite(Number(left)) && Number.isFinite(Number(right))) {
          return Number(left) - Number(right);
        }
        return left.localeCompare(right);
      },
    };

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
  return String(left.id).localeCompare(String(right.id));
}

function compareByMetric(metric) {
  return (left, right) =>
    right.durability.display[metric] - left.durability.display[metric] ||
    compareIdentity(left, right);
}

function rankEntries(entries, rankKey) {
  // Rank cloned entries directly, without allocating three intermediate Maps.
  const ranked = entries.map((entry) => ({ ...entry, [rankKey]: {} }));
  for (const metric of RANKING_METRICS) {
    let previousScore;
    let rank = 0;
    [...ranked].sort(compareByMetric(metric)).forEach((entry, index) => {
      const score = entry.durability.display[metric];
      if (index === 0 || score !== previousScore) rank = index + 1;
      entry[rankKey][metric] = rank;
      previousScore = score;
    });
  }
  return ranked;
}

function normalizeSearchText(value) {
  return String(value ?? "").normalize("NFKC").toLocaleLowerCase("zh-CN");
}

function matchesQuery(entry, query) {
  const normalizedQuery = normalizeSearchText(query).trim();
  if (!normalizedQuery) return true;
  return [
    entry.name,
    entry.spirit.fullName,
    entry.spirit.baseName,
    entry.spirit.variantName,
    entry.spirit.dexNo,
    entry.spirit.searchText,
    ...(entry.spirit.aliases ?? []),
    ...(entry.spirit.types ?? []),
  ].some((value) => normalizeSearchText(value).includes(normalizedQuery));
}

function calculateRankingEntry(spirit, template, variant) {
  const form = resolveRankingFormRole(spirit);
  const basePanelStats = calculateAllPanelStats({
    raceStats: spirit.raceStats,
    displayIvs: template.displayIvs,
    natureMultipliers: getNatureMultipliers(template.natureId),
    level: variant.level,
  });
  const panelStats = variant.defenseStages ? {
    ...basePanelStats,
    physicalDefense: defenseStatForDamage(basePanelStats.physicalDefense, variant.defenseStages.physical),
    magicalDefense: defenseStatForDamage(basePanelStats.magicalDefense, variant.defenseStages.magical),
  } : basePanelStats;
  const panelDurability = calculateDurability({
    maxHp: panelStats.hp,
    physicalDefense: panelStats.physicalDefense,
    magicalDefense: panelStats.magicalDefense,
  });
  // Non-standard levels currently belong only to the verified S5 Minggulong.
  // Passive configurations are separate rows; ordinary rows remain trait-free.
  const incomingDamageMultiplier = variant.level === 60 ? 1 :
    1 + getS5LevelIncomingDamagePercent(variant.level) / 100;
  const raw = Object.fromEntries(RANKING_METRICS.map(key => [key, panelDurability.raw[key] / incomingDamageMultiplier]));
  return {
    ...variant,
    incomingDamageMultiplier,
    panelDurability,
    durability: {
      ...panelDurability, raw,
      display: Object.fromEntries(RANKING_METRICS.map(key => [key, Math.round(raw[key])])),
    },
    evolutionFamilyId: form.evolutionFamilyId,
    formRole: form.formRole,
    formRoleStatus: form.formRoleStatus,
    basePanelStats,
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
  attackType = "",
  multipliers,
  typeChart,
  filter,
  query = "",
  spirits = [],
  traits = [],
  spiritFilterRevision,
  sortBy = "combined",
  templateId = "standard-hp-v1",
  includeLevelVariants = true,
  includePassiveVariants = false,
} = {}) {
  const knownTypes = typeChart?.types ?? ELEMENT_TYPES;
  if (attackType && !knownTypes.includes(attackType)) {
    throw new TypeError(`未知承受属性：${attackType}`);
  }
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
    const form = resolveRankingFormRole(spirit, { spiritFilterRevision, includeLevelVariants });
    if (["final", "boss"].includes(form.formRole)) {
      if (attackType && (!spirit.types?.length || spirit.types.some((type) => !knownTypes.includes(type)))) {
        excluded.push(exclusionFor(spirit, form, "UNKNOWN_DEFENSIVE_TYPE"));
      } else if (hasCompleteRaceStats(spirit.raceStats)) {
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
  const entries = eligible.flatMap((spirit) => [
    ...createRankingLevelVariants(spirit, { includeLevelVariants }),
    ...(includePassiveVariants ? createPassiveVariants(spirit, traits) : []),
  ].map(variant => {
    const entry = calculateRankingEntry(spirit, template, variant);
    if (!attackType) return entry;
    const multiplier = getTypeMultiplier(attackType, spirit.types, typeChart);
    const raw = Object.fromEntries(RANKING_METRICS.map((key) => [key, multiplier === 0 ? null : entry.durability.raw[key] / multiplier]));
    return { ...entry, multiplier, baseDurability: entry.durability, durability: {
      ...entry.durability, raw,
      display: Object.fromEntries(RANKING_METRICS.map((key) => [key, raw[key] === null ? null : Math.round(raw[key])])),
    } };
  }));
  const selected = multipliers ?? getDurabilityMultipliers(typeChart);
  const immuneRows = entries.filter((entry) => entry.multiplier === 0
    && selected.includes(0) && (!filter || filter(entry))).sort(compareIdentity);
  const globallyRanked = rankEntries(entries.filter((entry) => entry.multiplier !== 0), "globalRank");
  const filtered = typeof filter === "function"
    ? globallyRanked.filter((entry) => filter(entry))
    : globallyRanked;
  const candidates = attackType ? filtered.filter((entry) => selected.includes(entry.multiplier)) : filtered;
  const rows = rankEntries(candidates, "filteredRank");
  const excludedByReason = Object.fromEntries(
    [...new Set(excluded.map(({ reason }) => reason))].map((reason) => [
      reason,
      excluded.filter((entry) => entry.reason === reason).length,
    ]),
  );
  return selectDurabilityRanking({
    counts: {
      eligible: entries.length,
      excluded: excluded.length,
      excludedByReason,
      total: spirits.length,
      visible: rows.length + immuneRows.length,
    },
    excluded,
    formRoleManifestVersion: FORM_ROLE_MANIFEST_VERSION,
    rows,
    immuneRows,
    template,
  }, { query, sortBy });
}

// Search and metric changes operate on existing ranked values, not on recalculated panels.
export function selectDurabilityRanking(ranking, { query = "", sortBy = "combined" } = {}) {
  if (!RANKING_METRICS.includes(sortBy)) throw new TypeError(String(sortBy));
  const rows = ranking.rows.filter((entry) => matchesQuery(entry, query)).sort(compareByMetric(sortBy));
  const immuneRows = ranking.immuneRows.filter((entry) => matchesQuery(entry, query));
  return { ...ranking, rows, immuneRows, counts: { ...ranking.counts, visible: rows.length + immuneRows.length } };
}
