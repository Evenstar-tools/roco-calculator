import { getSkillEffectInputs } from "../shared/domain/skill-effects.js";
import { getSkillStatusEffectInputs } from "../shared/domain/skill-status-effects.js";

function unique(values) {
  return [...new Set(values)];
}

function isGlobalCalculatorSkill(skill) {
  return skill?.pickerVisibility === "search-only" &&
    skill?.provenance?.ruleId ===
      "rock-calculator:reviewed-special-skill-2026-07-24";
}

export function getSkillChoices(snapshot, spiritId) {
  const learnset = (snapshot?.learnsets ?? []).find(
    (entry) => entry.spiritId === spiritId,
  );
  if (!learnset) return [];

  const skillIds = learnset.skillIds ?? [];
  const skillsById = new Map(
    (snapshot?.skills ?? []).map((skill) => [skill.id, skill]),
  );
  const specialSkillIds = (snapshot?.skills ?? [])
    .filter(isGlobalCalculatorSkill)
    .map((skill) => skill.id);

  return unique([...skillIds, ...specialSkillIds])
    .map((skillId) => skillsById.get(skillId))
    .filter(Boolean);
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
