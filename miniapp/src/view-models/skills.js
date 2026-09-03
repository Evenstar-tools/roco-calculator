import { getSkillEffectInputs } from "../shared/domain/skill-effects.js";
import { getSkillStatusEffectInputs } from "../shared/domain/skill-status-effects.js";

const choiceCache = new WeakMap();

export function getSkillChoices(snapshot, spiritId) {
  const spirit = (snapshot?.spirits ?? []).find(
    (entry) => entry.id === spiritId,
  );
  if (spirit?.calculationStatus === "pending-race-stats") return [];
  const learnset = (snapshot?.learnsets ?? []).find(
    (entry) => entry.spiritId === spiritId,
  );
  if (!learnset) return [];

  let choicesBySpirit = choiceCache.get(snapshot);
  if (!choicesBySpirit) {
    choicesBySpirit = new Map();
    choiceCache.set(snapshot, choicesBySpirit);
  }
  const cached = choicesBySpirit.get(spiritId);
  if (cached) return cached;

  const skillIds = learnset.skillIds ?? [];
  const legalSet = new Set(skillIds);
  const skillsById = new Map(
    (snapshot?.skills ?? []).map((skill) => [skill.id, skill]),
  );
  const legal = [...new Set(skillIds)]
    .map((skillId) => skillsById.get(skillId))
    .filter(Boolean)
    .map((skill) => ({ ...skill, learnable: true }));
  const searchable = (snapshot?.skills ?? [])
    .filter((skill) => !legalSet.has(skill.id))
    .map((skill) => ({
      ...skill,
      learnable: false,
      pickerVisibility: "search-only",
    }));
  const choices = [...legal, ...searchable];
  choicesBySpirit.set(spiritId, choices);
  return choices;
}

export function getSkill(snapshot, entry) {
  const skillId =
    typeof entry === "string"
      ? entry
      : entry?.skillId ?? entry?.id ?? null;
  return (snapshot?.skills ?? []).find(
    (skill) => skill.id === skillId,
  ) ?? null;
}

export function getSkillInputs(skill, extraInputs = []) {
  const inputs = [
    ...(skill?.inputs ?? []),
    ...getSkillEffectInputs(skill),
    ...getSkillStatusEffectInputs(skill),
    ...extraInputs,
  ];
  const seen = new Set();
  return inputs.filter((input) => {
    const id = input.id ?? input.contextKey ?? input.key;
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

export function getVisibleSkillInputs(skill, context = {}, extraInputs = []) {
  return getSkillInputs(skill, extraInputs).filter((input) => {
    const condition = input.visibleWhen ?? input.when;
    if (!condition) return true;
    const key = condition.id ?? condition.contextKey ?? condition.key;
    return (context[key] ?? condition.defaultValue) === condition.equals;
  });
}
