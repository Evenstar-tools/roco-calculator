import { getSkillEffectInputs } from "../shared/domain/skill-effects.js";

function unique(values) {
  return [...new Set(values)];
}

export function getSkillChoices(snapshot, spiritId) {
  const skillIds =
    (snapshot?.learnsets ?? []).find(
      (learnset) => learnset.spiritId === spiritId,
    )?.skillIds ?? [];
  const skillsById = new Map(
    (snapshot?.skills ?? []).map((skill) => [skill.id, skill]),
  );

  return unique(skillIds)
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

export function getVisibleSkillInputs(skill, context = {}) {
  const inputs = skill?.inputs ?? getSkillEffectInputs(skill);

  return inputs.filter((input) => {
    if (!input.when) return true;
    const controllingValue =
      context[input.when.key] ?? input.when.defaultValue;
    return controllingValue === input.when.equals;
  });
}
