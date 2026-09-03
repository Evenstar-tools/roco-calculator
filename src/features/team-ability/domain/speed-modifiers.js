import { CONTRACT_SHAPE_TRAIT_NAME } from "../../../domain/contract-shape.js";
import { getSnapshotIndexes } from "../../../domain/snapshot-indexes.js";
import {
  getSkillStatusEffectInputs,
  isPureStatusSkill,
  resolveSkillStatusActivation,
} from "../../../domain/skill-status-effects.js";
import { resolveSkillEntity } from "../../../domain/skill-result/loadout.js";
import { getTraitEffectRule } from "../../../domain/trait-effects.js";

function carriedEntries(configuration) {
  const four = configuration?.skills?.four ?? configuration?.fourSkills ?? [];
  const single = configuration?.skills?.single ?? configuration?.singleSkill;
  return [...four, ...(single ? [single] : [])].filter(Boolean);
}

function entryContext(entry) {
  return entry && typeof entry === "object" ? (entry.context ?? {}) : {};
}

function skillSpeedModifiers(configuration, skillsById) {
  const entries = carriedEntries(configuration);
  const carriedSkills = entries
    .map((entry) => resolveSkillEntity(entry, skillsById))
    .filter(Boolean);
  const seenSkills = new Set();
  return entries.flatMap((entry) => {
    const skill = resolveSkillEntity(entry, skillsById);
    const skillKey = skill?.id ?? skill?.name;
    const isRefraction = skill?.name === "折射";
    if (
      !skillKey ||
      seenSkills.has(skillKey) ||
      (!isPureStatusSkill(skill) && !isRefraction)
    ) return [];
    seenSkills.add(skillKey);

    const baseContext = { ...entryContext(entry), carriedSkills };
    const contexts = [{ context: baseContext, suffix: "" }];
    for (const input of getSkillStatusEffectInputs(skill)) {
      if (input.type !== "boolean") continue;
      contexts.push({
        context: { ...baseContext, [input.contextKey ?? input.key]: true },
        suffix: `（${input.label}）`,
      });
    }

    const seenAmounts = new Set();
    return contexts.flatMap(({ context, suffix }) => {
      const amount = Number(resolveSkillStatusActivation(skill, context)?.deltas?.ownSpeedFlat ?? 0);
      if (!Number.isFinite(amount) || amount <= 0 || seenAmounts.has(amount)) return [];
      seenAmounts.add(amount);
      return [{
        amount,
        groupId: `skill:${skillKey}`,
        id: `skill:${skillKey}:${amount}`,
        label: isRefraction ? "折射（携带电系技能）" : `${skill.name}${suffix}`,
        source: "skill",
      }];
    });
  });
}

function traitSpeedModifiers(spirit, traitsById, currentSpeed) {
  return (spirit?.traitIds ?? []).flatMap((traitId) => {
    const trait = traitsById[traitId];
    if (!trait) return [];
    if (trait.name === CONTRACT_SHAPE_TRAIT_NAME) {
      return [{
        amount: 50,
        groupId: `trait:${trait.id}`,
        id: `trait:${trait.id}:insulation`,
        label: `${trait.name}（绝缘球）`,
        source: "trait",
      }];
    }

    const rule = getTraitEffectRule(trait, "attacker");
    if (!rule) return [];
    if (rule.kind === "speed_flat") {
      const amount = Number(rule.effect ?? 0);
      if (!Number.isFinite(amount) || amount <= 0) return [];
      return [{
        amount,
        groupId: `trait:${trait.id}`,
        id: `trait:${trait.id}:triggered`,
        label: rule.condition ? `${trait.name}（${rule.condition.label}）` : trait.name,
        source: "trait",
      }];
    }
    if (rule.speedEffect === undefined) return [];

    const stacks = rule.stack
      ? Math.min(5, Number(rule.max ?? rule.stack.max ?? 5))
      : 1;
    const speedEffect = Number(rule.speedEffect ?? 0);
    if (!Number.isFinite(speedEffect) || speedEffect <= 0) return [];
    return Array.from({ length: stacks }, (_, index) => {
      const stack = index + 1;
      const amount = rule.speedMode === "percent"
        ? Math.floor(currentSpeed * speedEffect * stack / 100)
        : speedEffect * stack;
      return {
        amount,
        groupId: `trait:${trait.id}`,
        id: `trait:${trait.id}:${stack}`,
        label: rule.stack ? `${trait.name}（${stack}层）` : trait.name,
        maxStacks: stacks,
        source: "trait",
        stack: rule.stack ? stack : null,
      };
    });
  });
}

export function createSpeedModifiers({
  configuration,
  currentSpeed,
  snapshot,
  spirit,
} = {}) {
  const normalizedSpeed = Number(currentSpeed);
  if (!Number.isFinite(normalizedSpeed) || normalizedSpeed <= 0) return [];
  const indexes = getSnapshotIndexes(snapshot);
  return [
    ...skillSpeedModifiers(configuration, indexes.skills),
    ...traitSpeedModifiers(spirit, indexes.traits, normalizedSpeed),
  ];
}
