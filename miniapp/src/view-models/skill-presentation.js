import {
  getChoiceTraitInput,
  supportsChoiceTrait,
} from "../shared/domain/choice-skill-sequence.js";
import { buildRefractionHint } from "../shared/domain/refraction.js";
import { describeSkillResolution } from "../shared/domain/skill-presentation.js";
import { getGaleTurbineCompanionInput } from "../shared/domain/wing-extension.js";
import { getVisibleSkillInputs } from "./skills.js";

function counterReflectionHint(result) {
  if (
    !result?.reflectedSourceSkillName ||
    !Number.isFinite(Number(result?.reflectedPower))
  ) return null;
  return `\u53cd\u5f39\u300c${result.reflectedSourceSkillName}\u300d\u00b7\u5a01\u529b ${Number(result.reflectedPower)}`;
}

export function createSkillPresentation({
  carriedSkills = [],
  context = {},
  currentIndex = 0,
  includeGaleTurbineCompanion = true,
  result,
  skill,
  sproutStacks = 0,
  traitName,
} = {}) {
  if (!skill) return { description: "", effectHint: "", inputs: [] };
  const extraInputs = [
    ...(result?.inputs ?? []),
    supportsChoiceTrait(traitName) ? getChoiceTraitInput(skill) : null,
    includeGaleTurbineCompanion ? getGaleTurbineCompanionInput({
      currentIndex,
      selectedSkills: carriedSkills,
      traitName,
    }) : null,
  ].filter(Boolean);
  const effectHint = [
    describeSkillResolution(result),
    buildRefractionHint({ selectedSkill: skill, carriedSkills, sproutStacks }),
    counterReflectionHint(result),
  ].filter(Boolean).join("\u00b7");
  return {
    description: skill.description ?? "",
    effectHint,
    inputs: getVisibleSkillInputs(skill, context, extraInputs),
  };
}
