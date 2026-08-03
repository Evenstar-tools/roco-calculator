export const WING_EXTENSION_TRAIT_NAME = "展翅";
export const GALE_TURBINE_SKILL_NAME = "疾风涡轮";
export const GALE_TURBINE_COMPANION_KEY = "galeTurbineCompanionSlot";

const GALE_TURBINE_COMPANION_CONTROL = {
  contextKey: GALE_TURBINE_COMPANION_KEY,
  defaultValue: "",
  id: GALE_TURBINE_COMPANION_KEY,
  key: GALE_TURBINE_COMPANION_KEY,
  label: "前置翼技",
  options: [
    { label: "仅计算疾风涡轮", value: "" },
    ...Array.from({ length: 7 }, (_, index) => ({
      label: `技能${index + 1}`,
      value: String(index + 1),
    })),
  ],
  scope: "slot",
  type: "choice",
};

function traitName(trait) {
  return trait?.displayName ?? trait?.name ?? trait;
}

export function hasWingExtensionTrait(traits = []) {
  return traits.some((trait) => traitName(trait) === WING_EXTENSION_TRAIT_NAME);
}

export function resolveWingExtensionSkill({ skill, traits = [] } = {}) {
  if (
    !skill ||
    skill.type !== "普通" ||
    !hasWingExtensionTrait(traits)
  ) {
    return skill;
  }
  return {
    ...skill,
    originalType: skill.type,
    type: "翼",
    typeChangedByTrait: WING_EXTENSION_TRAIT_NAME,
  };
}

export function isGaleTurbine(skill) {
  return skill?.name === GALE_TURBINE_SKILL_NAME;
}

export function isDamageSkill(skill) {
  return ["physical", "magical", "dual"].includes(skill?.category);
}

export function getGaleTurbineCompanionControl(skill) {
  return isGaleTurbine(skill)
    ? {
        ...GALE_TURBINE_COMPANION_CONTROL,
        options: GALE_TURBINE_COMPANION_CONTROL.options.map((option) => ({
          ...option,
        })),
      }
    : null;
}

export function galeTurbineCompanionIndex(context = {}, slotCount = 4) {
  const slot = Math.floor(Number(context[GALE_TURBINE_COMPANION_KEY]));
  return Number.isInteger(slot) && slot >= 1 && slot <= slotCount
    ? slot - 1
    : null;
}

export function getGaleTurbineCompanionInput({
  currentIndex,
  selectedSkills = [],
  traitName: ownerTraitName,
} = {}) {
  const current = selectedSkills[currentIndex];
  if (!isGaleTurbine(current)) return null;
  const traits = ownerTraitName ? [{ name: ownerTraitName }] : [];
  const options = selectedSkills.flatMap((skill, index) => {
    if (!skill || index === currentIndex) return [];
    const effective = resolveWingExtensionSkill({ skill, traits });
    if (effective.type !== "翼") return [];
    return [{
      label: `${index + 1} · ${skill.name}`,
      value: String(index + 1),
    }];
  });
  return {
    ...getGaleTurbineCompanionControl(current),
    options: [{ label: "仅计算疾风涡轮", value: "" }, ...options],
  };
}
