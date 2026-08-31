import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import Taro from "@tarojs/taro";
import { Button, Text, View } from "@tarojs/components";
import { restoreResultContext } from "../platform/result-interaction.js";
import { encodeSharePayloadWithMeta } from "../share/payload.js";
import {
  applyBattleActivation,
  applyBalanceTraitTrigger,
} from "../shared/state/battle-activation.js";
import { isPureStatusSkill } from "../shared/domain/skill-status-effects.js";
import { createInitialState } from "../shared/state/defaults.js";
import {
  selectSpirit,
  updateGlobalWeather,
} from "../shared/state/calculator-session.js";
import {
  createResultActionRecord,
  hasPersistedStatusAction,
  persistStatusAction,
  restorePersistedStatusAction,
  restoreResultAction,
} from "../state/result-action-history.js";
import { createUndoHistory } from "../state/undo-history.js";
import { createCalculationView } from "../view-models/calculation.js";
import { createConditionSummary } from "../view-models/condition-summary.js";
import { createDirectionTraitViews } from "../view-models/traits.js";
import { createResultActions } from "../view-models/result-actions.js";
import { createShareSummary } from "../view-models/share-summary.js";
import { createSkillPresentation } from "../view-models/skill-presentation.js";
import { getSkill, getSkillChoices } from "../view-models/skills.js";
import CombatantCard from "./CombatantCard.jsx";
import BattleAdvancedEditor from "./BattleAdvancedEditor.jsx";
import BattleConditionStrip from "./BattleConditionStrip.jsx";
import BattleEnvironmentEditor from "./BattleEnvironmentEditor.jsx";
import BattleMarksEditor from "./BattleMarksEditor.jsx";
import ActiveAbilityStageBar from "./ActiveAbilityStageBar.jsx";
import CombatantParameterSheet from "./CombatantParameterSheet.jsx";
import DirectionSwitch from "./DirectionSwitch.jsx";
import ModeSwitch from "./ModeSwitch.jsx";
import NegativeStatusEditor from "./NegativeStatusEditor.jsx";
import QuickCombatantControls from "./QuickCombatantControls.jsx";
import ResultBar from "./ResultBar.jsx";
import ResultSheet from "./ResultSheet.jsx";
import SingleSkillResultRow from "./SingleSkillResultRow.jsx";
import SkillConditionEditor from "./SkillConditionEditor.jsx";
import SkillSlots from "./SkillSlots.jsx";
import TraitConditionEditor from "./TraitConditionEditor.jsx";
import TeamTypeAnalysisSheet from "./TeamTypeAnalysisSheet.jsx";

const SIDE_LABELS = Object.freeze({
  attacker: "攻击方",
  defender: "防守方",
});

const SIDE_DIRECTIONS = Object.freeze({
  attacker: "forward",
  defender: "reverse",
});

function nestedKeys(value, prefix = "") {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return prefix ? [prefix] : [];
  }
  return Object.keys(value).sort().flatMap((key) => {
    const path = prefix ? `${prefix}.${key}` : key;
    const nested = nestedKeys(value[key], path);
    return nested.length ? nested : [path];
  });
}

function actionUndoGroup(action) {
  if (!action || action.type === "mode/set" || action.type === "state/replace") {
    return null;
  }
  const scope = [
    action.type,
    action.side,
    action.direction,
    action.index,
    action.key,
    action.polarity,
    ...nestedKeys(action.value),
  ].filter((value) => value !== undefined && value !== null && value !== "");
  return scope.join(":");
}

function getSpirit(snapshot, spiritId) {
  return (snapshot.spirits ?? []).find(
    (candidate) => candidate.id === spiritId,
  );
}

function getSpiritImageUrl(petImages, spirit) {
  if (!spirit) return null;
  const imageUrl = petImages?.[spirit.id] ?? null;
  return typeof imageUrl === "string" && imageUrl.trim()
    ? imageUrl
    : null;
}

function selectedSlot(configuration, directionState, mode) {
  return mode === "four"
    ? configuration.skills.four[directionState.selectedSkillIndex]
    : configuration.skills.single;
}

function skillForResultAction(snapshot, state, action) {
  if (action?.kind !== "skill") return null;
  const skills = state?.sides?.[action.side]?.skills;
  const entry = action.mode === "single"
    ? skills?.single
    : skills?.four?.[action.slotIndex];
  return getSkill(snapshot, entry);
}

function presentationForSide({
  calculation,
  configuration,
  directionState,
  mode,
  side,
  snapshot,
  state,
  traitViews,
}) {
  const currentIndex = mode === "four"
    ? directionState.selectedSkillIndex
    : 0;
  const entry = selectedSlot(configuration, directionState, mode);
  const details = entry && typeof entry === "object" ? entry : {};
  const selectedSkill = getSkill(snapshot, entry);
  const configuredSkills = (configuration.skills.four ?? [])
    .map((candidate) => getSkill(snapshot, candidate));
  const carriedSkills = mode === "single"
    ? [selectedSkill, ...configuredSkills]
    : configuredSkills;
  const positiveMark = state.marks?.[side]?.positive;
  return createSkillPresentation({
    carriedSkills,
    context: mode === "four" ? details.context ?? {} : directionState.context,
    currentIndex,
    includeGaleTurbineCompanion: mode === "four",
    result: calculation?.rows?.[currentIndex],
    skill: selectedSkill,
    sproutStacks: positiveMark?.id === "sprout" ? positiveMark.stacks : 0,
    traitName: traitViews?.attacker?.name,
  });
}

export default function BattleWorkspace({
  compactDemo = true,
  configPresetsBySpirit = {},
  favoriteIds = [],
  onFavoriteToggle,
  onShareChange,
  negativeStatusEnabled = false,
  petImages,
  quickUndoEnabled = false,
  showSkillIcons = true,
  showTypeAnalysis = false,
  snapshot,
  store,
  teamAnalysisEnabled = false,
  teamAnalysisMembers = [],
  onTeamAnalysisMembersChange,
}) {
  const [activeLayer, setActiveLayer] = useState(null);
  const [actionFeedback, setActionFeedback] = useState(null);
  const [direction, setDirection] = useState("forward");
  const [quickUndoDepth, setQuickUndoDepth] = useState(0);
  const quickUndoHistoryRef = useRef(createUndoHistory({
    coalesceMs: 400,
    limit: 50,
  }));
  const resultActionHistoryRef = useRef(new Map());
  const statusAutoTriggerOptOutRef = useRef(new Set());
  const resultTriggerRef = useRef(null);
  const state = useSyncExternalStore(
    store.subscribe,
    store.getState,
    store.getState,
  );
  const attacker = getSpirit(snapshot, state.sides.attacker.spiritId);
  const defender = getSpirit(snapshot, state.sides.defender.spiritId);
  const calculations = {
    forward: createCalculationView(snapshot, state, "forward"),
    reverse: createCalculationView(snapshot, state, "reverse"),
  };
  const calculation = calculations[direction];
  const shareCompleteness = encodeSharePayloadWithMeta(state, {
    direction,
  }).completeness;
  const activeSide = direction === "forward" ? "attacker" : "defender";
  const activeConfiguration = state.sides[activeSide];
  const activeDirectionState = state.directions[direction];
  const activeSelectedEntry = selectedSlot(
    activeConfiguration,
    activeDirectionState,
    state.mode,
  );
  const selectedSkill = getSkill(snapshot, activeSelectedEntry);
  const selectedSlotDetails =
    activeSelectedEntry && typeof activeSelectedEntry === "object"
      ? activeSelectedEntry
      : {};
  const conditionContext = state.mode === "four"
    ? selectedSlotDetails.context ?? {}
    : activeDirectionState.context;
  const conditionDirection = state.mode === "four"
    ? {
        hitCount: selectedSlotDetails.hitCount,
        statusTriggerCount: selectedSlotDetails.statusTriggerCount,
        overrides: selectedSlotDetails.overrides ?? {},
      }
    : activeDirectionState;
  const traitViews = createDirectionTraitViews(
    snapshot,
    state,
    direction,
  );
  const resultActions = createResultActions({
    calculation,
    direction,
    snapshot,
    state,
    traitViews,
  });
  const selectedStatusAction = isPureStatusSkill(selectedSkill)
    ? [
        ...(resultActions.defense ?? []),
        ...(resultActions.modifiers ?? []),
      ].find((action) =>
        action.kind === "skill" &&
        action.mode === state.mode &&
        action.side === activeSide &&
        action.slotIndex === (state.mode === "four"
          ? activeDirectionState.selectedSkillIndex
          : 0)
      ) ?? null
    : null;
  const restoredStatusAction = selectedStatusAction
    ? restorePersistedStatusAction(state, selectedStatusAction)
    : null;
  const persistedStatusAction = selectedStatusAction
    ? hasPersistedStatusAction(state, selectedStatusAction)
    : false;
  const activeActionKeys = [...resultActionHistoryRef.current.keys()];
  if (
    selectedStatusAction &&
    (restoredStatusAction || persistedStatusAction) &&
    !activeActionKeys.includes(selectedStatusAction.key)
  ) {
    activeActionKeys.push(selectedStatusAction.key);
  }
  const selectedStatusActionActive = selectedStatusAction
    ? activeActionKeys.includes(selectedStatusAction.key)
    : false;
  const selectedStatusActionKey = selectedStatusAction?.key ?? null;
  const shareSummary = createShareSummary({
    actions: resultActions,
    activeActionKeys,
    direction,
    snapshot,
    state,
  });
  const conditionSummary = createConditionSummary({
    direction,
    skill: selectedSkill,
    state,
    traitViews,
  });
  const conditionsOpen = activeLayer === "conditions";
  const resultOpen = activeLayer === "result";
  const pickerSide = activeLayer?.startsWith("spirit-")
    ? activeLayer.slice("spirit-".length)
    : null;
  const parameterSide = activeLayer?.startsWith("parameter-")
    ? activeLayer.slice("parameter-".length)
    : null;

  const panels = ["attacker", "defender"].map((side) => {
    const panelDirection = SIDE_DIRECTIONS[side];
    const configuration = state.sides[side];
    const panelTraitViews = createDirectionTraitViews(
      snapshot,
      state,
      panelDirection,
    );
    return {
      calculation: calculations[panelDirection],
      choices: getSkillChoices(snapshot, configuration.spiritId),
      configuration,
      direction: panelDirection,
      directionState: state.directions[panelDirection],
      label: SIDE_LABELS[side],
      presentation: presentationForSide({
        calculation: calculations[panelDirection],
        configuration,
        directionState: state.directions[panelDirection],
        mode: state.mode,
        side,
        snapshot,
        state,
        traitViews: panelTraitViews,
      }),
      side,
    };
  });
  const activePresentation = panels.find(
    (panel) => panel.direction === direction,
  )?.presentation;

  useEffect(() => {
    onShareChange?.(calculation, state, direction);
  }, [calculation, direction, onShareChange, state]);

  useEffect(() => {
    if (!quickUndoEnabled) {
      quickUndoHistoryRef.current.clear();
      setQuickUndoDepth(0);
    }
  }, [quickUndoEnabled, store]);

  function recordQuickUndo(options = {}) {
    if (quickUndoEnabled) {
      quickUndoHistoryRef.current.record(store.getState(), options);
      setQuickUndoDepth(quickUndoHistoryRef.current.size());
    }
  }

  function dispatchWithUndo(action, options = {}) {
    if (action.type !== "mode/set") {
      recordQuickUndo({
        groupKey: actionUndoGroup(action),
        ...options,
      });
    }
    store.dispatch(action);
  }

  function undoLastChange() {
    const previous = quickUndoHistoryRef.current.undo();
    if (!previous) return;
    store.dispatch({ type: "state/replace", value: previous.state });
    setQuickUndoDepth(quickUndoHistoryRef.current.size());
  }

  function setSpirit(side, value) {
    const initialState = createInitialState(snapshot);
    const preset = configPresetsBySpirit[value];
    const result = selectSpirit(store.getState(), {
      initialState,
      personalConfiguration: preset ?? null,
      side,
      snapshot,
      spiritId: value,
    });
    dispatchWithUndo({
      type: "state/replace",
      value: {
        ...result.state,
        negativeStatuses: initialState.negativeStatuses,
      },
    });
  }

  function resetBattleState(nextState = store.getState()) {
    const initialState = createInitialState(snapshot);
    return {
      ...nextState,
      directions: initialState.directions,
      marks: initialState.marks,
      negativeStatuses: initialState.negativeStatuses,
    };
  }

  function setNature(side, value) {
    dispatchWithUndo({ type: "side/set-nature", side, value });
  }

  function setIv(side, stat, value) {
    dispatchWithUndo({ type: "side/set-iv", side, stat, value });
  }

  function setTraitValue(side, key, value, control) {
    if (control?.scope === "battle") {
      const previousValue = state.directions[direction].context?.[control.id];
      recordQuickUndo();
      store.dispatch({
        direction,
        key: control.id,
        type: "battle/set-trait-control",
        value,
      });
      if (
        control.contextKey === "balanceTriggered" &&
        value === true &&
        previousValue !== true
      ) {
        store.dispatch({
          type: "state/replace",
          value: applyBalanceTraitTrigger({
            side,
            state: store.getState(),
          }),
        });
      }
      return;
    }
    dispatchWithUndo({ key, side, type: "side/set-trait-value", value });
  }

  function setGlobalRain(value) {
    dispatchWithUndo({ type: "battle/set-rain", value });
  }

  function setGlobalWeather(value) {
    dispatchWithUndo({
      type: "state/replace",
      value: updateGlobalWeather(store.getState(), value).state,
    });
  }

  function setMark(side, polarity, value) {
    dispatchWithUndo({ polarity, side, type: "mark/update", value });
  }

  function updateDirection(targetDirection, value) {
    dispatchWithUndo({
      direction: targetDirection,
      type: "direction/update",
      value,
    });
  }

  function setSingleSkill(side, value) {
    dispatchWithUndo({ side, type: "side/set-single-skill", value });
  }

  function setFourSkill(side, index, value) {
    dispatchWithUndo({ index, side, type: "side/set-four-skill", value });
  }

  function updateSelectedSlot(targetDirection, side, value) {
    const index = state.directions[targetDirection].selectedSkillIndex;
    const current = state.sides[side].skills.four[index];
    const entry = current && typeof current === "object"
      ? current
      : { skillId: current };
    const next = { ...entry, ...value };
    if (value.context) {
      next.context = { ...(entry.context ?? {}), ...value.context };
    }
    if (value.overrides) {
      next.overrides = { ...(entry.overrides ?? {}), ...value.overrides };
    }
    setFourSkill(side, index, next);
  }

  function updateSkillContext(context) {
    if (state.mode === "four") {
      updateSelectedSlot(direction, activeSide, { context });
      return;
    }
    updateDirection(direction, { context });
  }

  function updateSkillDirection(value) {
    if (state.mode === "four") {
      updateSelectedSlot(direction, activeSide, value);
      return;
    }
    updateDirection(direction, value);
  }

  function updateResultActionControl(action, input, value) {
    const key = input.contextKey ?? input.key ?? input.id;
    if (action.kind === "trait") {
      const currentValue = action.values?.[input.canonicalKey] ?? action.value;
      const nextValue = input.type === "choice" && currentValue === value
        ? input.defaultValue
        : value;
      setTraitValue(action.side, input.canonicalKey, nextValue, input);
      return;
    }
    if (action.mode === "single") {
      updateDirection(direction, {
        context: {
          ...(state.directions[direction].context ?? {}),
          [key]: value,
        },
      });
      return;
    }
    const current = state.sides[action.side].skills.four[action.slotIndex];
    const entry = current && typeof current === "object"
      ? current
      : { skillId: current };
    setFourSkill(action.side, action.slotIndex, {
      ...entry,
      context: { ...(entry.context ?? {}), [key]: value },
    });
  }

  function applyResultAction(action, { automatic = false } = {}) {
    const history = resultActionHistoryRef.current;
    let previousRecord = history.get(action.key);
    if (!previousRecord && action.kind === "skill") {
      previousRecord = restorePersistedStatusAction(store.getState(), action);
      if (previousRecord) {
        history.set(action.key, previousRecord);
      } else if (hasPersistedStatusAction(store.getState(), action)) {
        setActionFeedback({
          actionKey: action.key,
          message: "状态已被其他条件修改，请在战斗条件中调整后再触发",
        });
        return;
      }
    }
    if (previousRecord) {
      const restored = restoreResultAction(store.getState(), previousRecord);
      if (restored.restored) {
        dispatchWithUndo({ type: "state/replace", value: restored.state });
        history.delete(action.key);
        if (!automatic && action.kind === "skill") {
          statusAutoTriggerOptOutRef.current.add(action.key);
        }
        setActionFeedback({
          actionKey: action.key,
          message: `${action.name}触发已取消`,
        });
      } else {
        setActionFeedback({
          actionKey: action.key,
          message: restored.reason,
        });
      }
      return;
    }

    if (!automatic && action.kind === "skill") {
      statusAutoTriggerOptOutRef.current.delete(action.key);
    }

    const beforeState = store.getState();
    if (action.kind === "trait") {
      const control = action.control;
      if (control.type === "boolean" && action.value === true) {
        setTraitValue(
          action.side,
          control.canonicalKey,
          control.defaultValue,
          control,
        );
        setActionFeedback({
          actionKey: action.key,
          message: `${action.name}触发已取消`,
        });
        return;
      }
      const value = control.type === "boolean"
        ? action.value !== true
        : control.defaultValue;
      setTraitValue(action.side, control.canonicalKey, value, control);
      const afterState = store.getState();
      history.set(
        action.key,
        createResultActionRecord(action.key, beforeState, afterState),
      );
      setActionFeedback({
        actionKey: action.key,
        message: `${action.name}已触发`,
      });
      return;
    }

    const result = applyBattleActivation({
      calculation: {
        [direction]: { results: calculations[direction].rows },
      },
      side: action.side,
      skillIndex: action.slotIndex,
      skillMode: action.mode,
      snapshot,
      state: beforeState,
    });
    if (result.applied) {
      const activatedState = isPureStatusSkill(
        skillForResultAction(snapshot, beforeState, action),
      )
        ? persistStatusAction({
            action,
            afterState: result.state,
            beforeState,
          })
        : result.state;
      dispatchWithUndo({ type: "state/replace", value: activatedState });
      history.set(
        action.key,
        createResultActionRecord(action.key, beforeState, activatedState),
      );
      setActionFeedback({
        actionKey: action.key,
        message: `${action.name}状态已应用`,
      });
    } else {
      if (result.stateChanged) {
        dispatchWithUndo({ type: "state/replace", value: result.state });
      }
      setActionFeedback({
        actionKey: action.key,
        message: result.reason ?? "当前没有可应用的状态",
      });
    }
  }

  function updateStatusParameter(action, parameter, value, label) {
    const count = Math.min(99, Math.max(1, Math.floor(Number(value) || 1)));
    const history = resultActionHistoryRef.current;
    let previousRecord = history.get(action?.key);
    if (!previousRecord && action) {
      previousRecord = restorePersistedStatusAction(store.getState(), action);
      if (previousRecord) history.set(action.key, previousRecord);
    }
    if (!action || !previousRecord) {
      if (action && hasPersistedStatusAction(store.getState(), action)) {
        setActionFeedback({
          actionKey: action.key,
          message: "状态已被其他条件修改，请在战斗条件中调整后再触发",
        });
        return;
      }
      updateSkillDirection({ [parameter]: count });
      return;
    }

    const restored = restoreResultAction(store.getState(), previousRecord);
    if (!restored.restored) {
      updateSkillDirection({ [parameter]: count });
      setActionFeedback({
        actionKey: action.key,
        message: `状态已变化，${label}已更新；请重新触发后查看累计效果`,
      });
      return;
    }

    const baseState = restored.state;
    if (action.mode === "single") {
      const actionDirection = action.side === "attacker" ? "forward" : "reverse";
      baseState.directions[actionDirection] = {
        ...baseState.directions[actionDirection],
        [parameter]: count,
      };
    } else {
      const entry = baseState.sides[action.side].skills.four[action.slotIndex];
      baseState.sides[action.side].skills.four[action.slotIndex] = {
        ...(entry && typeof entry === "object" ? entry : { skillId: entry }),
        [parameter]: count,
      };
    }

    const updatedCalculation = createCalculationView(snapshot, baseState, direction);
    const reapplied = applyBattleActivation({
      calculation: {
        [direction]: { results: updatedCalculation.rows },
      },
      side: action.side,
      skillIndex: action.slotIndex,
      skillMode: action.mode,
      snapshot,
      state: baseState,
    });
    if (!reapplied.applied) {
      dispatchWithUndo({ type: "state/replace", value: baseState });
      history.delete(action.key);
      setActionFeedback({
        actionKey: action.key,
        message: reapplied.reason ?? "当前状态无法重新触发",
      });
      return;
    }
    const activatedState = persistStatusAction({
      action,
      afterState: reapplied.state,
      beforeState: baseState,
    });
    dispatchWithUndo({ type: "state/replace", value: activatedState });
    history.set(
      action.key,
      createResultActionRecord(action.key, baseState, activatedState),
    );
    setActionFeedback({
      actionKey: action.key,
      message: parameter === "statusTriggerCount"
        ? `${action.name}已按 ${count} 次触发更新`
        : `${action.name}已按每次 ${count} 连击更新`,
    });
  }

  function updateStatusTriggerCount(action, value) {
    updateStatusParameter(action, "statusTriggerCount", value, "触发次数");
  }

  function updateStatusHitCount(action, value) {
    updateStatusParameter(action, "hitCount", value, "每次连击数");
  }

  useEffect(() => {
    if (
      activeLayer !== "result" ||
      !selectedStatusAction ||
      selectedStatusActionActive ||
      statusAutoTriggerOptOutRef.current.has(selectedStatusAction.key)
    ) return;
    applyResultAction(selectedStatusAction, { automatic: true });
  }, [
    activeLayer,
    selectedStatusActionKey,
    selectedStatusActionActive,
  ]);

  function closeResults() {
    setActiveLayer(null);
    restoreResultContext({
      platform: Taro,
      trigger: resultTriggerRef.current,
    });
  }

  function openConditions() {
    setActiveLayer("conditions");
  }

  function openResults() {
    setActiveLayer("result");
  }

  function setTargetHp(currentHp) {
    const maxHp = calculation.defenderMaxHp;
    const safeHp = Number.isFinite(maxHp)
      ? Math.min(maxHp, Math.max(0, Number(currentHp) || 0))
      : Math.max(0, Number(currentHp) || 0);
    updateDirection(direction, {
      context: {
        currentHpPercent:
          Number.isFinite(maxHp) && maxHp > 0
            ? safeHp / maxHp * 100
            : 0,
      },
      currentHp: safeHp,
    });
  }

  return (
    <View
      className={compactDemo
        ? "battle-workspace battle-workspace--compact-demo"
        : "battle-workspace"}
    >
      <View className="workspace-layout">
        <View className="workspace-layout__main">
          <View aria-label="对战对象" className="battle-workspace__duel">
            <CombatantCard
              active={direction === "forward"}
              favorite={favoriteIds.includes(attacker?.id)}
              favoriteIds={favoriteIds}
              identityOnly
              imageUrl={getSpiritImageUrl(petImages, attacker)}
              imageUrls={petImages}
              onActivate={() => setDirection("forward")}
              onChange={(value) => setSpirit("attacker", value)}
              onFavoriteToggle={onFavoriteToggle}
              onPickerOpenChange={(open) =>
                setActiveLayer(open ? "spirit-attacker" : null)
              }
              pickerOpen={pickerSide === "attacker"}
              side="attacker"
              spirit={attacker}
              spirits={snapshot.spirits ?? []}
            />
            <DirectionSwitch
              onSwap={() => setDirection(
                direction === "forward" ? "reverse" : "forward",
              )}
            />
            <CombatantCard
              active={direction === "reverse"}
              favorite={favoriteIds.includes(defender?.id)}
              favoriteIds={favoriteIds}
              identityOnly
              imageUrl={getSpiritImageUrl(petImages, defender)}
              imageUrls={petImages}
              onActivate={() => setDirection("reverse")}
              onChange={(value) => setSpirit("defender", value)}
              onFavoriteToggle={onFavoriteToggle}
              onPickerOpenChange={(open) =>
                setActiveLayer(open ? "spirit-defender" : null)
              }
              pickerOpen={pickerSide === "defender"}
              side="defender"
              spirit={defender}
              spirits={snapshot.spirits ?? []}
            />
          </View>

          <View aria-label="双方快速配置" className="configuration-grid">
            {panels.map((panel) => (
              <View
                aria-label={`${panel.label}快速配置`}
                className={[
                  `side-configuration side-configuration--${panel.side}`,
                  panel.direction === direction ? "side-configuration--active" : "",
                ].filter(Boolean).join(" ")}
                key={panel.side}
              >
                <View
                  aria-label={`打开${panel.label}详细参数`}
                  className="side-configuration__heading"
                  hoverClass="button-hover"
                  onClick={() => {
                    setDirection(SIDE_DIRECTIONS[panel.side]);
                    setActiveLayer(`parameter-${panel.side}`);
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <Text>{panel.label}设置</Text>
                </View>
                <QuickCombatantControls
                  configuration={panel.configuration}
                  onIvChange={(stat, value) =>
                    setIv(panel.side, stat, value)
                  }
                  onNatureChange={(value) => setNature(panel.side, value)}
                  side={panel.side}
                />
              </View>
            ))}
          </View>

          {compactDemo ? (
            <ActiveAbilityStageBar
              direction={direction}
              onChange={(role, value) => updateDirection(direction, {
                overrides: { [`${role}LevelStage`]: value },
              })}
              state={activeDirectionState}
            />
          ) : null}

          {teamAnalysisEnabled ? (
            <Button
              aria-label="打开队伍防守面分析"
              className="team-analysis-entry"
              hoverClass="team-analysis-entry--pressed"
              onClick={() => setActiveLayer("team-analysis")}
            >
              <View className="team-analysis-entry__copy">
                <Text className="team-analysis-entry__title">队伍防守面</Text>
                <Text className="team-analysis-entry__summary">
                  已配置 {teamAnalysisMembers.filter(Boolean).length}/6
                </Text>
              </View>
              <Text aria-hidden="true" className="team-analysis-entry__chevron">
                ›
              </Text>
            </Button>
          ) : null}

          <View className="workspace-section workspace-section--skills">
            <View aria-label="技能操作" className="skills-toolbar">
              <ModeSwitch
                onChange={(value) => store.dispatch({ type: "mode/set", value })}
                value={state.mode}
              />
              {teamAnalysisEnabled || quickUndoEnabled ? (
                <View aria-label="技能辅助操作" className="skills-toolbar__actions">
                  {teamAnalysisEnabled ? (
                    <Button
                      aria-label="手机打开队伍防守面分析"
                      className="team-analysis-quick"
                      hoverClass="team-analysis-entry--pressed"
                      onClick={() => setActiveLayer("team-analysis")}
                    >
                      <Text>队伍</Text>
                      <Text className="team-analysis-quick__count">
                        {teamAnalysisMembers.filter(Boolean).length}/6
                      </Text>
                    </Button>
                  ) : null}
                  {quickUndoEnabled ? (
                    <Button
                      aria-label="撤回上一步"
                      className="quick-undo"
                      disabled={quickUndoDepth === 0}
                      hoverClass="quick-undo--pressed"
                      onClick={undoLastChange}
                    >
                      <Text aria-hidden="true" className="quick-undo__icon">↶</Text>
                      <Text className="quick-undo__label">撤回</Text>
                    </Button>
                  ) : null}
                </View>
              ) : null}
            </View>
            <View className="skills-grid">
              {panels.map((panel) => (
                <View
                  aria-label={`${panel.label}技能面板`}
                  className={[
                    `skill-panel skill-panel--${panel.side}`,
                    panel.direction === direction ? "skill-panel--active" : "",
                  ].filter(Boolean).join(" ")}
                  key={panel.side}
                >
                  <Text className="skill-panel__title">
                    {panel.configuration.spiritId
                      ? getSpirit(snapshot, panel.configuration.spiritId)?.fullName
                      : panel.label}
                  </Text>
                  {state.mode === "four" ? (
                    <SkillSlots
                      choices={panel.choices}
                      fallbackSkills={panel.configuration.skills.four.map(
                        (entry) => getSkill(snapshot, entry),
                      )}
                      label={panel.label}
                      onChange={(index, value) =>
                        setFourSkill(panel.side, index, value)
                      }
                      onSelect={(selectedSkillIndex) => {
                        setDirection(panel.direction);
                        updateDirection(panel.direction, {
                          selectedDamageSource: "skill",
                          selectedSkillIndex,
                        });
                      }}
                      onOpenResult={(selectedSkillIndex) => {
                        setDirection(panel.direction);
                        updateDirection(panel.direction, {
                          selectedDamageSource: "skill",
                          selectedSkillIndex,
                        });
                        setActiveLayer("result");
                      }}
                      presentation={panel.presentation}
                      resultsHidden={resultOpen}
                      rows={panel.calculation.rows}
                      selectedIndex={panel.directionState.selectedSkillIndex}
                      showSkillIcons={showSkillIcons}
                      values={panel.configuration.skills.four}
                    />
                  ) : (
                    <SingleSkillResultRow
                      choices={panel.choices}
                      fallbackSkill={
                        getSkill(
                          snapshot,
                          panel.configuration.skills.single,
                        ) ?? panel.calculation.rows[0]
                      }
                      label={`${panel.label}单技能`}
                      onChange={(value) => {
                        setDirection(panel.direction);
                        setSingleSkill(panel.side, value);
                        updateDirection(panel.direction, {
                          selectedDamageSource: "skill",
                        });
                      }}
                      onOpen={() => {
                        setDirection(panel.direction);
                        updateDirection(panel.direction, {
                          selectedDamageSource: "skill",
                        });
                      }}
                      onOpenResult={() => {
                        setDirection(panel.direction);
                        setActiveLayer("result");
                      }}
                      resultsHidden={resultOpen}
                      row={panel.calculation.rows[0]}
                      selected={panel.direction === direction}
                      showSkillIcons={showSkillIcons}
                      value={panel.configuration.skills.single}
                    />
                  )}
                </View>
              ))}
            </View>
            {state.mode === "single" ? (
              <View className="active-skill-conditions">
                <View className="active-skill-conditions__heading">
                  <Text className="active-skill-conditions__title">
                    当前技能参数
                  </Text>
                  <Text className="active-skill-conditions__context">
                    {SIDE_LABELS[activeSide]} · {selectedSkill?.name ?? "未选择技能"}
                  </Text>
                </View>
                <SkillConditionEditor
                  context={conditionContext}
                  direction={conditionDirection}
                  onContextChange={updateSkillContext}
                  onDirectionChange={updateSkillDirection}
                  presentation={activePresentation}
                  result={calculation.rows[0]}
                  skill={selectedSkill}
                />
              </View>
            ) : null}
          </View>

          <BattleConditionStrip
            currentHp={calculation.defenderHp}
            maxHp={calculation.defenderMaxHp}
            onCurrentHpChange={setTargetHp}
            onOpen={openConditions}
            open={conditionsOpen}
            summary={conditionSummary}
          />
        </View>

        <ResultBar
          mode={state.mode}
          onCurrentHpChange={setTargetHp}
          onOpen={openResults}
          open={resultOpen}
          ref={resultTriggerRef}
          selectedSkillIndex={activeDirectionState.selectedSkillIndex}
          view={calculation}
        />
      </View>

      {conditionsOpen ? (
        <View
          className="conditions-sheet__overlay"
          onClick={() => setActiveLayer(null)}
        >
          <View
            aria-label="战斗条件"
            className="conditions-sheet"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <View className="conditions-sheet__header">
              <View className="conditions-sheet__heading">
                <Text className="conditions-sheet__title">战斗条件</Text>
                <Text className="conditions-sheet__subtitle">
                  {SIDE_LABELS[activeSide]} · {selectedSkill?.name ?? "未选择技能"}
                </Text>
              </View>
              <Button
                aria-label="关闭战斗条件"
                className="conditions-sheet__close"
                onClick={() => setActiveLayer(null)}
              >
                完成
              </Button>
            </View>
            <View className="conditions-sheet__content">
              <BattleEnvironmentEditor
                defenderMaxHp={calculation.defenderMaxHp}
                direction={activeDirectionState}
                onCurrentHpChange={setTargetHp}
                onRainChange={setGlobalRain}
                onWeatherChange={setGlobalWeather}
                showThunder={negativeStatusEnabled}
              />
              {!compactDemo ? (
                <ActiveAbilityStageBar
                  direction={direction}
                  onChange={(role, value) => updateDirection(direction, {
                    overrides: { [`${role}LevelStage`]: value },
                  })}
                  state={activeDirectionState}
                />
              ) : null}
              {negativeStatusEnabled ? (
                <NegativeStatusEditor
                  onChange={(side, key, value) => dispatchWithUndo({
                    key,
                    side,
                    type: "negative-status/update",
                    value,
                  })}
                  statuses={state.negativeStatuses}
                />
              ) : null}
              <TraitConditionEditor
                battleContext={activeDirectionState.context}
                onChange={setTraitValue}
                values={{
                  attacker: state.sides.attacker.traitValues,
                  defender: state.sides.defender.traitValues,
                }}
                views={traitViews}
              />
              <BattleMarksEditor
                marks={state.marks}
                onChange={setMark}
              />
              <BattleAdvancedEditor
                direction={activeDirectionState}
                onChange={(value) => updateDirection(direction, value)}
              />
            </View>
          </View>
        </View>
      ) : null}

      {parameterSide ? (
        <CombatantParameterSheet
          configuration={state.sides[parameterSide]}
          onClose={() => setActiveLayer(null)}
          onIvChange={(stat, value) => setIv(parameterSide, stat, value)}
          onNatureChange={(value) => setNature(parameterSide, value)}
          open
          side={parameterSide}
          snapshot={snapshot}
        />
      ) : null}

      <TeamTypeAnalysisSheet
        members={teamAnalysisMembers}
        onClose={() => setActiveLayer(null)}
        onMembersChange={onTeamAnalysisMembersChange}
        open={activeLayer === "team-analysis"}
        petImages={petImages}
        snapshot={snapshot}
      />

      <ResultSheet
        actions={resultActions}
        activeActionKeys={activeActionKeys}
        actionFeedback={actionFeedback}
        hiddenActionKeys={selectedStatusAction ? [selectedStatusAction.key] : []}
        onActionControlChange={updateResultActionControl}
        onApplyAction={applyResultAction}
        onClose={closeResults}
        onSkillConditionContextChange={updateSkillContext}
        onSkillConditionDirectionChange={updateSkillDirection}
        onSelectSkill={(selectedSkillIndex) => updateDirection(direction, {
          selectedDamageSource: "skill",
          selectedSkillIndex,
        })}
        onSelectBloodline={() => updateDirection(direction, {
          selectedDamageSource: "bloodline",
        })}
        onSelectTrait={() => updateDirection(direction, {
          selectedDamageSource: "trait",
        })}
        onTraitHitCountChange={(traitDamageHitCount) =>
          updateDirection(direction, { traitDamageHitCount })
        }
        open={resultOpen}
        selectedIndex={activeDirectionState.selectedSkillIndex}
        shareCompleteness={shareCompleteness}
        shareSummary={shareSummary}
        showSkillConditions={Boolean(selectedSkill)}
        showTypeAnalysis={showTypeAnalysis}
        skillConditionContext={conditionContext}
        skillConditionDirection={conditionDirection}
        skillConditionPresentation={activePresentation}
        skillConditionSkill={selectedSkill}
        skillConditionStatusActivation={selectedStatusAction ? {
          active: selectedStatusActionActive,
          available: true,
          onToggle: () => applyResultAction(selectedStatusAction),
          onTriggerCountChange: (count) => updateStatusTriggerCount(
            selectedStatusAction,
            count,
          ),
          onHitCountChange: (count) => updateStatusHitCount(
            selectedStatusAction,
            count,
          ),
        } : null}
        traitDamageHitCount={activeDirectionState.traitDamageHitCount}
        view={calculation}
      />
    </View>
  );
}
