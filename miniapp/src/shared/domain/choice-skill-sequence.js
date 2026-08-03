import { getSkillEffectInputs } from "./skill-effects.js";

const CHOICE_TRAITS = new Set(["有求必应", "一意孤行"]);
const RESPONSE_KEYS = [
  "counterTriggered",
  "counterDefenseSucceeded",
  "defenseCounterSucceeded",
];

function choiceControl(skill) {
  return getSkillEffectInputs(skill).find(
    (input) => input.type === "choice" && input.options?.length >= 2,
  );
}

function selectedChoice(control, context) {
  if (!control) return null;
  return context[control.id] ??
    context[control.contextKey ?? control.key] ??
    control.defaultValue ??
    control.options[0].value;
}

function otherChoice(control, selected) {
  return control?.options.find((option) => option.value !== selected)?.value ??
    selected;
}

function withSelectedChoice(context, control, value) {
  if (!control) return { ...context };
  return {
    ...context,
    [control.id]: value,
    [control.contextKey ?? control.key]: value,
  };
}

function responseControls(skill) {
  return getSkillEffectInputs(skill).filter((input) =>
    RESPONSE_KEYS.includes(input.contextKey ?? input.key),
  );
}

function hasResponse(skill, context) {
  return responseControls(skill).some((input) =>
    context[input.id] === true || context[input.contextKey ?? input.key] === true,
  ) || RESPONSE_KEYS.some((key) => context[key] === true);
}

function withoutResponse(skill, context) {
  const next = RESPONSE_KEYS.reduce(
    (value, key) => ({ ...value, [key]: false }),
    { ...context },
  );
  for (const input of responseControls(skill)) {
    next[input.id] = false;
    next[input.contextKey ?? input.key] = false;
  }
  return next;
}

function persistentControl(skill, contextKey) {
  return getSkillEffectInputs(skill).find(
    (input) => (input.contextKey ?? input.key) === contextKey,
  );
}

function persistentValue(skill, context, contextKey) {
  const control = persistentControl(skill, contextKey);
  if (control && Object.hasOwn(context, control.id)) {
    return { key: control.id, value: context[control.id] };
  }
  return { key: contextKey, value: context[contextKey] };
}

function advancePersistentContext(skill, context) {
  if (
    skill?.name === "友谊满溢" &&
    context.friendshipMode === "growth"
  ) {
    const stored = persistentValue(skill, context, "skillUseCount");
    return {
      ...context,
      [stored.key]:
        Math.max(0, Math.floor(Number(stored.value) || 0)) + 1,
    };
  }
  if (skill?.name === "撒娇") {
    const stored = persistentValue(skill, context, "moeGainCount");
    return {
      ...context,
      [stored.key]:
        Math.max(0, Math.floor(Number(stored.value) || 0)) + 1,
    };
  }
  return { ...context };
}

function persistentContextPatch(skill, context) {
  if (skill?.name === "友谊满溢") {
    const stored = persistentValue(skill, context, "skillUseCount");
    return { [stored.key]: stored.value };
  }
  if (skill?.name === "撒娇") {
    const stored = persistentValue(skill, context, "moeGainCount");
    return { [stored.key]: stored.value };
  }
  return {};
}

export function isChoiceSkill(skill) {
  return String(skill?.description ?? "").includes("选择：");
}

export function hasPersistentSkillProgression(skill) {
  return skill?.name === "友谊满溢" || skill?.name === "撒娇";
}

export function supportsChoiceTrait(traitName) {
  return CHOICE_TRAITS.has(traitName);
}

export function getChoiceTraitInput(skill) {
  if (!isChoiceSkill(skill)) return null;
  return {
    contextKey: "choiceTraitTriggered",
    defaultValue: false,
    id: "choiceTraitTriggered",
    key: "choiceTraitTriggered",
    label: "触发特性",
    scope: "slot",
    type: "boolean",
  };
}

export function buildChoiceSkillSequence({ skill, traitName, context = {} }) {
  const control = choiceControl(skill);
  const selected = selectedChoice(control, context);
  const firstContext = { ...context };
  const shouldRepeat =
    isChoiceSkill(skill) &&
    supportsChoiceTrait(traitName) &&
    context.choiceTraitTriggered === true;

  if (!shouldRepeat) {
    const afterFirst = advancePersistentContext(skill, firstContext);
    return {
      executions: [
        {
          branch: selected,
          context: firstContext,
          label: "当前分支",
          responseTriggered: hasResponse(skill, firstContext),
        },
      ],
      nextContext: {
        ...context,
        ...persistentContextPatch(skill, afterFirst),
      },
      traitName: null,
    };
  }

  const afterFirst = advancePersistentContext(skill, firstContext);
  const repeated =
    traitName === "有求必应" ? otherChoice(control, selected) : selected;
  const secondContext = withoutResponse(
    skill,
    withSelectedChoice(afterFirst, control, repeated),
  );
  const afterSecond = advancePersistentContext(skill, secondContext);

  return {
    executions: [
      {
        branch: selected,
        context: firstContext,
        label: "第一段",
        responseTriggered: hasResponse(skill, firstContext),
      },
      {
        branch: repeated,
        context: secondContext,
        label: "第二段",
        responseTriggered: false,
      },
    ],
    nextContext: {
      ...context,
      ...persistentContextPatch(skill, afterSecond),
    },
    traitName,
  };
}
