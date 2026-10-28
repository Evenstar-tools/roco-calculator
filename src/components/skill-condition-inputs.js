import {
  dynamicInputsForSkill, mergeDynamicInputs, isDynamicInputVisible,
} from "./SingleSkillEditor.jsx";
import { getChoiceTraitInput, supportsChoiceTrait } from "../domain/choice-skill-sequence.js";
import { getGaleTurbineCompanionInput } from "../domain/wing-extension.js";

// Both presentations must expose the same rule-defined controls and visibility.
export function getSkillSlotConditions({ selected, result, selectedSkills = [], index = 0,
  trait, defenseTrait, traits = [], health, opponentHealth, negativeStatusEnabled = false }) {
  const effectiveTraits = traits.length ? traits : trait ? [trait] : [];
  const names = effectiveTraits.map((candidate) => candidate?.displayName ?? candidate?.name);
  const choiceTraitName = names.find(supportsChoiceTrait) ?? null;
  const wingTraitName = names.find((name) => name === "展翅") ?? null;
  const choiceTraitInput =
    selected && choiceTraitName
      ? getChoiceTraitInput(selected)
      : null;
  const galeTurbineInput = getGaleTurbineCompanionInput({
    currentIndex: index,
    selectedSkills,
    traitName: wingTraitName,
  });
  const skillInputs = selected
    ? [
        ...dynamicInputsForSkill(selected, {
          includeNegativeStatusEffects: negativeStatusEnabled,
          includeStatusEffects: true,
        }),
        ...(choiceTraitInput ? [choiceTraitInput] : []),
        ...(galeTurbineInput ? [galeTurbineInput] : []),
      ]
    : [];
  const traitInputs =
    selected
      ? [
          ...(trait?.inputs?.filter(
            (input) => input.scope === "slot",
          ) ??
            (trait?.conditionKey
              ? [{
                  defaultValue: false,
                  key: trait.conditionKey,
                  label: trait.conditionLabel,
                  id: trait.conditionKey,
                  scope: "slot",
                  type: "boolean",
                }]
              : [])),
          ...(defenseTrait?.inputs?.filter(
            (input) => input.scope === "slot",
          ) ?? []),
        ]
      : [];
  const skillDynamicInputs = mergeDynamicInputs(
    skillInputs,
    result?.inputs ?? [],
  ).map((input) =>
    selected?.name === "雷暴" &&
    (input.contextKey ?? input.key) === "burstTriggered"
      ? { ...input, label: "雷暴迸发" }
      : input,
  );
  const traitDynamicInputs = mergeDynamicInputs(traitInputs).map(
    (input) =>
      (input.contextKey ?? input.key) === "burstTriggered"
        ? {
            ...input,
            controlGroup: "trait",
            label: trait?.name
              ? `触发${trait.name}`
              : "触发特性迸发",
          }
        : { ...input, controlGroup: "trait" },
  );
  const dynamicInputs = [
    ...skillDynamicInputs,
    ...traitDynamicInputs,
  ];
  const editableHitCountInput = skillDynamicInputs.find(
    (input) => input.drivesHitCount === true,
  );
  const hitCountMaximum = editableHitCountInput
    ? editableHitCountInput.max ?? Number.POSITIVE_INFINITY
    : 99;
  const visibleInputs = (inputs) =>
    inputs
      .filter(
        (input) =>
          ((input.contextKey ?? input.key) !== "attackerHpPercent" ||
            !health) &&
          ((input.contextKey ?? input.key) !== "defenderHpPercent" ||
            !opponentHealth),
      )
      .filter((input) =>
        isDynamicInputVisible(input, selected?.slotContext),
      )
      .filter((input) => !input.burstSource);
  const visibleSkillInputs = visibleInputs(skillDynamicInputs);
  const visibleTraitInputs = visibleInputs(traitDynamicInputs);
  const visibleDynamicInputs = [
    ...visibleSkillInputs,
    ...visibleTraitInputs,
  ];
  const hasBurstSources = skillDynamicInputs.some(
    (input) => input.burstSource,
  );
  return { dynamicInputs, skillDynamicInputs, visibleDynamicInputs, hasBurstSources, hitCountMaximum };
}
