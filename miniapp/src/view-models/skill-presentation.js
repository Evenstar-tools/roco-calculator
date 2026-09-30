import {
  getChoiceTraitInput,
  supportsChoiceTrait,
} from "../shared/domain/choice-skill-sequence.js";
import { buildRefractionHint } from "../shared/domain/refraction.js";
import { describeSkillResolution, describeSkillUsage, skillUsageExplanation, skillUsageDetails } from "../shared/domain/skill-presentation.js";
import { getGaleTurbineCompanionInput } from "../shared/domain/wing-extension.js";
import { getVisibleSkillInputs } from "./skills.js";
import { getDefaultHitCount } from "../shared/domain/skill-effects.js";
import { hasNegativeStatusSkillApplication, resolveNegativeStatusApplications } from "../shared/domain/negative-status-rules.js";
import { NEGATIVE_STATUS_DEFINITIONS } from "../shared/domain/negative-status.js";

function counterReflectionHint(result) {
  if (
    !result?.reflectedSourceSkillName ||
    !Number.isFinite(Number(result?.reflectedPower))
  ) return null;
  return `\u53cd\u5f39\u300c${result.reflectedSourceSkillName}\u300d\u00b7\u663e\u793a\u5a01\u529b ${Number(result.reflectedPower)}`;
}

export function createSkillPresentation({
  baselineStatuses = {},
  carriedSkills = [],
  context = {},
  currentIndex = 0,
  includeGaleTurbineCompanion = true,
  negativeStatusEnabled = false,
  negativeStatusContext = context,
  result,
  skill,
  sproutStacks = 0,
  traitName,
  traits = [],
} = {}) {
  if (!skill) return { description: "", effectHint: "", inputs: [] };
  const pureStateSkill = ["status", "defense"].includes(skill.category);
  const negativeApplication = pureStateSkill && negativeStatusEnabled
    ? resolveNegativeStatusApplications({
        baselineStatuses,
        context: negativeStatusContext,
        selectedSkills: carriedSkills,
        skill: Number.isFinite(result?.skillCost)
          ? { ...skill, cost: result.skillCost }
          : skill,
        skillIndex: currentIndex,
        traits: traits.map(trait => ({ ...trait, name: trait.displayName ?? trait.name })),
        effectiveHitCount: result?.hitCount ?? getDefaultHitCount(skill),
      })
    : null;
  const negativeStatusApplication = pureStateSkill && negativeStatusEnabled &&
    (hasNegativeStatusSkillApplication(skill) || result?.negativeStatusCanApply === true ||
      negativeApplication.sources.length > 0);
  const negativeStatusEffectHint = negativeStatusApplication
    ? Object.entries(negativeApplication.stacks).filter(([, stacks]) => stacks > 0)
        .map(([key, stacks]) => `敌方${NEGATIVE_STATUS_DEFINITIONS[key].label} +${stacks}层`)
        .join(" · ") || "当前条件不追加异常"
    : null;
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
    choiceTrait: context.choiceTraitTriggered === true && supportsChoiceTrait(traitName) && getChoiceTraitInput(skill) ? traitName : null,
    effectHint,
    negativeStatusApplication,
    negativeStatusEffectHint,
    usageSummary: describeSkillUsage(result),
    usage: result?.usageSummary,
    usageExplanation: skillUsageExplanation(result),
    usageDetails: skillUsageDetails(result),
    inputs: getVisibleSkillInputs(skill, context, extraInputs),
  };
}
