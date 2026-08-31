import { getNature, STAT_LABELS } from "../shared/domain/natures.js";
import { createConditionSummary } from "./condition-summary.js";
import { createDirectionTraitViews } from "./traits.js";

const STAT_KEYS = [
  "hp",
  "physicalAttack",
  "magicalAttack",
  "speed",
  "physicalDefense",
  "magicalDefense",
];

function spiritName(snapshot, spiritId) {
  return (snapshot?.spirits ?? []).find((spirit) => spirit.id === spiritId)
    ?.fullName ?? "未选择宠物";
}

function natureLabel(side) {
  const nature = getNature(side?.nature);
  if (!nature.upStat || !nature.downStat) return nature.name;
  return `${nature.name} · ${STAT_LABELS[nature.upStat]}↑ / ${STAT_LABELS[nature.downStat]}↓`;
}

function ivLabel(side) {
  const ivs = side?.displayIvs ?? {};
  const changed = STAT_KEYS.filter((key) => Number(ivs[key]) !== 60);
  return changed.length
    ? changed.map((key) => `${STAT_LABELS[key]}${ivs[key]}`).join(" · ")
    : "个体全60";
}

function stageLabel(value) {
  const stage = Math.max(-6, Math.min(6, Math.trunc(Number(value) || 0)));
  return stage > 0 ? `+${stage}` : String(stage);
}

function actionList(actions) {
  return [
    ...(actions?.defense ?? []),
    ...(actions?.modifiers ?? []),
  ];
}

function controlValue(action, control) {
  return action.values?.[control.canonicalKey] ??
    action.values?.[control.contextKey] ??
    action.value ??
    control.defaultValue;
}

function controlValueLabel(control, value) {
  if (control.type === "boolean") {
    return value === true ? control.label : `${control.label}关闭`;
  }
  const option = control.options?.find((candidate) =>
    Object.is(candidate.value, value)
  );
  return `${control.label} ${option?.label ?? value}`;
}

function traitConditionLabels(actions) {
  return actionList(actions)
    .filter((action) => action.kind === "trait")
    .flatMap((action) => {
      const controls = action.controls ?? (action.control ? [action.control] : []);
      const active = controls.some((control) =>
        !Object.is(controlValue(action, control), control.defaultValue)
      );
      if (!active) return [];
      return [`${action.name}：${controls
        .map((control) => controlValueLabel(
          control,
          controlValue(action, control),
        ))
        .join("；")}`];
    });
}

function appliedSkillEffectLabels(actions, activeActionKeys) {
  const activeKeys = new Set(activeActionKeys ?? []);
  return actionList(actions)
    .filter((action) => action.kind === "skill" && activeKeys.has(action.key))
    .map((action) => {
      const detail = action.effectHint?.trim();
      return `${action.name}已应用${detail ? `（${detail}）` : ""}`;
    });
}

function uniqueLabels(labels) {
  return [...new Set(labels.filter(Boolean))];
}

export function createShareSummary({
  actions,
  activeActionKeys,
  direction = "forward",
  snapshot,
  state,
}) {
  const normalizedDirection = direction === "reverse" ? "reverse" : "forward";
  const attackerSide = normalizedDirection === "reverse"
    ? state.sides.defender
    : state.sides.attacker;
  const defenderSide = normalizedDirection === "reverse"
    ? state.sides.attacker
    : state.sides.defender;
  const directionState = state.directions[normalizedDirection] ?? {};
  const conditionSummary = createConditionSummary({
    direction: normalizedDirection,
    state,
    traitViews: createDirectionTraitViews(
      snapshot,
      state,
      normalizedDirection,
    ),
  });
  const traitConditions = traitConditionLabels(actions);

  return {
    appliedSkillEffects: appliedSkillEffectLabels(actions, activeActionKeys),
    attackerIvs: ivLabel(attackerSide),
    attackerName: spiritName(snapshot, attackerSide.spiritId),
    attackerNature: natureLabel(attackerSide),
    attackStageLabel: stageLabel(
      directionState.overrides?.attackLevelStage,
    ),
    conditions: uniqueLabels([
      ...conditionSummary.labels.filter(
        (label) => !/^特性 \d+$/u.test(label),
      ),
      ...traitConditions,
    ]),
    defenderIvs: ivLabel(defenderSide),
    defenderName: spiritName(snapshot, defenderSide.spiritId),
    defenderNature: natureLabel(defenderSide),
    defenseStageLabel: stageLabel(
      directionState.overrides?.defenseLevelStage,
    ),
    modeLabel: state.mode === "four" ? "四技能" : "单技能",
  };
}
