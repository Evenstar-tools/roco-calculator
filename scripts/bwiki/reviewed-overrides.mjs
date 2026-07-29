import { sha256Hex } from "./normalize.mjs";

const RULE_REVIEW_SOURCE = Object.freeze({
  title: "PVP 动态规则人工审查",
  url: "urn:rock-calculator:review:pvp-rules:2026-07-23",
  revision: "2026-07-23",
  reviewedAt: "2026-07-23T00:00:00.000+08:00",
});

export const REVIEWED_OVERRIDES = Object.freeze([
  {
    id: "override_skill_flash_speed_difference_v1",
    entityType: "skill",
    targetName: "闪击",
    upstreamFingerprint:
      "6d0fc6975872478e516700dd526b3109f95f1ef53cfb4070e67fc748a9191ffd",
    values: { ruleId: "speed_difference", ruleParams: null },
    source: RULE_REVIEW_SOURCE,
  },
  {
    id: "override_skill_quicksand_defense_difference_v1",
    entityType: "skill",
    targetName: "鸣沙陷阱",
    upstreamFingerprint:
      "3b7afe1290ec5fa42c0f2d05622039e132a1b06284d8572e5194b5adecc5a823",
    values: { ruleId: "physical_defense_difference", ruleParams: null },
    source: RULE_REVIEW_SOURCE,
  },
  {
    id: "override_skill_mana_burst_v1",
    entityType: "skill",
    targetName: "魔能爆",
    upstreamFingerprint:
      "335e9acb215f973b6b1d308bab37183cb13b79770fe9e2d7ca0290e75d4107eb",
    values: { ruleId: "mana_burst", ruleParams: null },
    source: RULE_REVIEW_SOURCE,
  },
  {
    id: "override_trait_focus_first_turn_v1",
    entityType: "trait",
    targetName: "专注力",
    upstreamFingerprint:
      "2c6bda4b623ca8a88c9d9f41aa3fede1445160919bfb249b091e9b9b77da8003",
    values: {
      ruleId: "physical_power_first_turn",
      ruleParams: { multiplier: 2 },
      affectsDamage: true,
    },
    source: {
      ...RULE_REVIEW_SOURCE,
      title: "音速犬专注力首回合规则审查",
      url: "https://wiki.biligame.com/rocom/%E9%9F%B3%E9%80%9F%E7%8A%AC",
    },
  },
  {
    id: "override_trait_moisture_no_damage_v1",
    entityType: "trait",
    targetName: "浸润",
    upstreamFingerprint:
      "85a177dc32ffc1f949c8162837a6020773950c0989359bab5a8dc687b4e2ed66",
    values: {
      ruleId: null,
      ruleParams: null,
      affectsDamage: false,
    },
    source: {
      ...RULE_REVIEW_SOURCE,
      title: "水灵浸润非伤害规则审查",
      url: "https://wiki.biligame.com/rocom/%E6%B0%B4%E7%81%B5",
    },
  },
]);

export function upstreamFingerprint(entityType, entity) {
  const content =
    entityType === "skill"
      ? {
          kind: "skill",
          name: entity.name,
          type: entity.type,
          category: entity.category,
          cost: entity.cost,
          basePower: entity.basePower,
          description: entity.description,
        }
      : {
          kind: "trait",
          name: entity.name,
          description: entity.description,
        };
  return sha256Hex(JSON.stringify(content));
}

function applyOne(entity, override, actualFingerprint) {
  const provenance = { ...(entity.provenance ?? {}) };
  for (const field of Object.keys(override.values)) {
    provenance[field] = {
      ...override.source,
      upstreamFingerprint: override.upstreamFingerprint,
      overrideId: override.id,
    };
  }
  return {
    ...entity,
    ...override.values,
    provenance,
    reviewedOverrideIds: [...(entity.reviewedOverrideIds ?? []), override.id],
    actualFingerprint,
  };
}

export function applyReviewedOverrides(
  skills,
  traits,
  overrides = REVIEWED_OVERRIDES,
) {
  const skillIndex = new Map(skills.map((entity, index) => [entity.name, index]));
  const traitIndex = new Map(traits.map((entity, index) => [entity.name, index]));
  const nextSkills = [...skills];
  const nextTraits = [...traits];
  const applied = [];
  const stale = [];

  for (const override of overrides) {
    const entities = override.entityType === "skill" ? nextSkills : nextTraits;
    const index =
      override.entityType === "skill"
        ? skillIndex.get(override.targetName)
        : traitIndex.get(override.targetName);
    if (index == null) {
      stale.push({ ...override, status: "missing_target" });
      continue;
    }
    const entity = entities[index];
    const actualFingerprint = upstreamFingerprint(override.entityType, entity);
    if (actualFingerprint !== override.upstreamFingerprint) {
      stale.push({ ...override, status: "stale", actualFingerprint });
      continue;
    }
    entities[index] = applyOne(entity, override, actualFingerprint);
    applied.push({
      ...override,
      status: "applied",
      entityId: entity.id,
      actualFingerprint,
    });
  }
  return { skills: nextSkills, traits: nextTraits, applied, stale };
}
