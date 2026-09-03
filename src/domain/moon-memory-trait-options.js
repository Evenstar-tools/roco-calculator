import { supportsChoiceTrait } from "./choice-skill-sequence.js";
import { hasNegativeStatusTraitApplication } from "./negative-status-rules.js";
import { getDirectTraitDamageRule } from "./trait-damage.js";
import {
  getTraitEffectInputs,
  getTraitSkillPowerBonuses,
  hasNamedTraitEffectRule,
} from "./trait-effects.js";
import { getTraitHitCountInputs } from "./trait-hit-count.js";
import { MOON_MEMORY_TRAIT_LIMIT } from "./moon-memory.js";
import { canonicalTraitControlKey } from "./trait-runtime.js";

const MOON_MEMORY_TRAIT_NAME = "铭记于月亮";

const DECLARATIVE_TRAIT_RULE_IDS = new Set([
  "damage_reduction_multiplier",
  "final_damage_multiplier",
  "physical_power_first_turn",
  "power_by_enemy_marks",
  "power_by_enemy_total_cost",
  "power_if_acted_before_enemy",
  "power_if_faster",
  "power_multiplier",
  "reduce_matching_skill_type",
  "reduce_matching_skill_type_strong",
  "reduce_off_type",
]);

const DECLARATIVE_TRAIT_NAMES = new Set([
  "冰钻",
  "偏振",
  "破空",
  "绝对秩序",
  "完全偏振",
  "顺风",
  "专注力",
]);

const SPECIAL_TRAIT_NAMES = new Set([
  "复方汤剂",
  "煤渣草",
  "耐活王",
  "契约的形状",
  "仁心",
  "稀兽花宝",
  "戏耍",
  "展翅",
  "贪得无厌",
]);

function normalizeSearch(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase("zh-CN")
    .replace(/[\s\-‐‑‒–—―_/\\|·•・:：,，.。'‘’"“”()[\]{}【】（）]+/gu, "");
}

export function getMoonMemoryTraitSupport(trait) {
  const traitName = trait?.displayName ?? trait?.name;
  const supported =
    ["attacker", "defender"].some((role) =>
      hasNamedTraitEffectRule(trait, role),
    ) ||
    getTraitHitCountInputs(trait, "attacker").length > 0 ||
    getTraitHitCountInputs(trait, "defender").length > 0 ||
    getTraitSkillPowerBonuses(trait).length > 0 ||
    Boolean(getDirectTraitDamageRule(trait)) ||
    hasNegativeStatusTraitApplication(traitName) ||
    supportsChoiceTrait(traitName) ||
    SPECIAL_TRAIT_NAMES.has(traitName) ||
    DECLARATIVE_TRAIT_NAMES.has(traitName) ||
    DECLARATIVE_TRAIT_RULE_IDS.has(trait?.ruleId);
  return supported
    ? { id: "supported", label: "已适配" }
    : { id: "display-only", label: "仅展示" };
}

export function getMoonMemoryTraitControls(trait) {
  if (getMoonMemoryTraitSupport(trait).id !== "supported") return [];
  const traitName = trait?.displayName ?? trait?.name;
  const seen = new Set();
  return ["attacker", "defender"].flatMap((role) =>
    getTraitEffectInputs(trait, role),
  ).flatMap((control) => {
    if (
      ["戏耍", "贪得无厌"].includes(traitName) &&
      control.contextKey === "attackerHpPercent"
    ) return [];
    const canonicalKey = canonicalTraitControlKey(control);
    if (seen.has(canonicalKey)) return [];
    seen.add(canonicalKey);
    return [{ ...control, canonicalKey }];
  });
}

export function createMoonMemoryTraitSearchIndex(snapshot) {
  const traitsById = new Map(
    (snapshot?.traits ?? []).map((trait) => [trait.id, trait]),
  );
  return (snapshot?.spirits ?? []).flatMap((spirit) =>
    (spirit.traitIds ?? []).flatMap((traitId) => {
      const trait = traitsById.get(traitId);
      if (!trait) return [];
      const spiritName = spirit.fullName ?? spirit.baseName ?? spirit.id;
      const traitName = trait.displayName ?? trait.name ?? trait.id;
      return [{
        key: `${spirit.id}:${trait.id}`,
        label: `${spiritName} · ${traitName}`,
        searchFields: [
          spiritName,
          spirit.baseName,
          spirit.variantName,
          spirit.dexNo,
          spirit.pinyin,
          spirit.initials,
          trait.displayName,
          trait.name,
        ].map(normalizeSearch).filter(Boolean),
        spiritId: spirit.id,
        spiritName,
        support: getMoonMemoryTraitSupport(trait),
        trait,
        traitId: trait.id,
        traitName,
      }];
    }),
  );
}

export function hasNativeMoonMemoryTrait(snapshot, spirit) {
  const traitsById = new Map(
    (snapshot?.traits ?? []).map((trait) => [trait.id, trait]),
  );
  const nativeTraits = (spirit?.traitIds ?? [])
    .map((traitId) => traitsById.get(traitId))
    .filter(Boolean);
  return nativeTraits.some(
    (trait) => (trait.displayName ?? trait.name) === MOON_MEMORY_TRAIT_NAME,
  );
}

export function getMoonMemorySelectedTraits(snapshot, side = {}) {
  const traitsById = new Map(
    (snapshot?.traits ?? []).map((trait) => [trait.id, trait]),
  );
  const seen = new Set();
  return (side.acquiredTraitIds ?? []).flatMap((traitId) => {
    if (seen.has(traitId)) return [];
    seen.add(traitId);
    const trait = traitsById.get(traitId);
    return trait
      ? [{ support: getMoonMemoryTraitSupport(trait), trait }]
      : [];
  }).slice(0, MOON_MEMORY_TRAIT_LIMIT);
}

export function searchMoonMemoryTraitOptions(searchIndex, query, limit = 50) {
  const needle = normalizeSearch(query);
  if (!needle) return [];
  const matches = [];
  const seen = new Set();
  for (const option of Array.isArray(searchIndex) ? searchIndex : []) {
    if (
      seen.has(option.traitId) ||
      !option.searchFields.some((field) => field.includes(needle))
    ) continue;
    seen.add(option.traitId);
    matches.push(option);
    if (matches.length >= limit) break;
  }
  return matches;
}
