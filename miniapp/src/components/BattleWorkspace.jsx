import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import Taro from "@tarojs/taro";
import { Button, Text, View } from "@tarojs/components";
import { restoreResultContext } from "../platform/result-interaction.js";
import {
  applyBattleActivation,
  applyBalanceTraitTrigger,
} from "../shared/state/battle-activation.js";
import { createInitialState } from "../shared/state/defaults.js";
import { selectSpirit } from "../shared/state/calculator-session.js";
import {
  createResultActionRecord,
  restoreResultAction,
} from "../state/result-action-history.js";
import { createCalculationView } from "../view-models/calculation.js";
import { createConditionSummary } from "../view-models/condition-summary.js";
import { createDirectionTraitViews } from "../view-models/traits.js";
import { createResultActions } from "../view-models/result-actions.js";
import { getSkill, getSkillChoices } from "../view-models/skills.js";
import CombatantCard from "./CombatantCard.jsx";
import BattleConditionStrip from "./BattleConditionStrip.jsx";
import BattleEnvironmentEditor from "./BattleEnvironmentEditor.jsx";
import AbilityStageEditor from "./AbilityStageEditor.jsx";
import ActiveAbilityStageBar from "./ActiveAbilityStageBar.jsx";
import CombatantParameterSheet from "./CombatantParameterSheet.jsx";
import DirectionSwitch from "./DirectionSwitch.jsx";
import MarkEditor from "./MarkEditor.jsx";
import ModeSwitch from "./ModeSwitch.jsx";
import QuickCombatantControls from "./QuickCombatantControls.jsx";
import ResultBar from "./ResultBar.jsx";
import ResultSheet from "./ResultSheet.jsx";
import SingleSkillResultRow from "./SingleSkillResultRow.jsx";
import SkillConditionEditor from "./SkillConditionEditor.jsx";
import SkillSlots from "./SkillSlots.jsx";
import TraitConditionEditor from "./TraitConditionEditor.jsx";

const SIDE_LABELS = Object.freeze({
  attacker: "攻击方",
  defender: "防守方",
});

const SIDE_DIRECTIONS = Object.freeze({
  attacker: "forward",
  defender: "reverse",
});

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

export default function BattleWorkspace({
  configPresetsBySpirit = {},
  favoriteIds = [],
  onFavoriteToggle,
  onShareChange,
  petImages,
  showTypeAnalysis = false,
  snapshot,
  store,
}) {
  const [activeLayer, setActiveLayer] = useState(null);
  const [actionFeedback, setActionFeedback] = useState(null);
  const [direction, setDirection] = useState("forward");
  const resultActionHistoryRef = useRef(new Map());
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
        hitCount: selectedSlotDetails.hitCount ?? 1,
        overrides: selectedSlotDetails.overrides ?? {},
      }
    : activeDirectionState;
  const traitViews = createDirectionTraitViews(
    snapshot,
    state,
    direction,
  );
  const resultActions = createResultActions({
    direction,
    snapshot,
    state,
    traitViews,
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
    return {
      calculation: calculations[panelDirection],
      choices: getSkillChoices(snapshot, configuration.spiritId),
      configuration,
      direction: panelDirection,
      directionState: state.directions[panelDirection],
      label: SIDE_LABELS[side],
      side,
    };
  });

  useEffect(() => {
    onShareChange?.(calculation, state);
  }, [calculation, onShareChange, state]);

  function setSpirit(side, value) {
    const preset = configPresetsBySpirit[value];
    const result = selectSpirit(store.getState(), {
      initialState: createInitialState(snapshot),
      personalConfiguration: preset ?? null,
      side,
      snapshot,
      spiritId: value,
    });
    store.dispatch({
      type: "state/replace",
      value: result.state,
    });
  }

  function resetBattleState(nextState = store.getState()) {
    const initialState = createInitialState(snapshot);
    return {
      ...nextState,
      directions: initialState.directions,
      marks: initialState.marks,
    };
  }

  function swapSides() {
    store.dispatch({ type: "sides/swap" });
    store.dispatch({
      type: "state/replace",
      value: resetBattleState(),
    });
  }

  function setNature(side, value) {
    store.dispatch({ type: "side/set-nature", side, value });
  }

  function setIv(side, stat, value) {
    store.dispatch({ type: "side/set-iv", side, stat, value });
  }

  function setTraitValue(side, key, value, control) {
    if (control?.scope === "battle") {
      const previousValue = state.directions[direction].context?.[control.id];
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
    store.dispatch({ key, side, type: "side/set-trait-value", value });
  }

  function setGlobalRain(value) {
    store.dispatch({ type: "battle/set-rain", value });
  }

  function setAbilityStage(side, role, value) {
    const targetDirection = role === "attack"
      ? SIDE_DIRECTIONS[side]
      : SIDE_DIRECTIONS[side] === "forward" ? "reverse" : "forward";
    updateDirection(targetDirection, {
      overrides: { [`${role}LevelStage`]: value },
    });
  }

  function setMark(side, polarity, value) {
    store.dispatch({ polarity, side, type: "mark/update", value });
  }

  function updateDirection(targetDirection, value) {
    store.dispatch({
      direction: targetDirection,
      type: "direction/update",
      value,
    });
  }

  function setSingleSkill(side, value) {
    store.dispatch({ side, type: "side/set-single-skill", value });
  }

  function setFourSkill(side, index, value) {
    store.dispatch({ index, side, type: "side/set-four-skill", value });
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

  function applyResultAction(action) {
    const history = resultActionHistoryRef.current;
    const previousRecord = history.get(action.key);
    if (previousRecord) {
      const restored = restoreResultAction(store.getState(), previousRecord);
      if (restored.restored) {
        store.dispatch({ type: "state/replace", value: restored.state });
        history.delete(action.key);
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
      store.dispatch({ type: "state/replace", value: result.state });
      history.set(
        action.key,
        createResultActionRecord(action.key, beforeState, result.state),
      );
      setActionFeedback({
        actionKey: action.key,
        message: `${action.name}状态已应用`,
      });
    } else {
      if (result.stateChanged) {
        store.dispatch({ type: "state/replace", value: result.state });
      }
      setActionFeedback({
        actionKey: action.key,
        message: result.reason ?? "当前没有可应用的状态",
      });
    }
  }

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
    <View className="battle-workspace">
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
            <DirectionSwitch onSwap={swapSides} />
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

          <View className="calculation-direction calculation-direction--a11y">
            <Button
              aria-label="查看攻击方攻击结果"
              aria-pressed={direction === "forward"}
              onClick={() => setDirection("forward")}
            >
              攻击方 → 防守方
            </Button>
            <Button
              aria-label="查看防守方攻击结果"
              aria-pressed={direction === "reverse"}
              onClick={() => setDirection("reverse")}
            >
              防守方 → 攻击方
            </Button>
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

          <View className="workspace-section workspace-section--skills">
            <ActiveAbilityStageBar
              direction={direction}
              onChange={(role, value) => updateDirection(direction, {
                overrides: { [`${role}LevelStage`]: value },
              })}
              state={activeDirectionState}
            />
            <ModeSwitch
              onChange={(value) => store.dispatch({ type: "mode/set", value })}
              value={state.mode}
            />
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
                      resultsHidden={resultOpen}
                      rows={panel.calculation.rows}
                      selectedIndex={panel.directionState.selectedSkillIndex}
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
                      value={panel.configuration.skills.single}
                    />
                  )}
                </View>
              ))}
            </View>
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
                skill={selectedSkill}
              />
            </View>
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
                onChange={(value) => updateDirection(direction, value)}
                onRainChange={setGlobalRain}
              />
              <AbilityStageEditor
                onChange={setAbilityStage}
                state={state}
              />
              <TraitConditionEditor
                battleContext={activeDirectionState.context}
                onChange={setTraitValue}
                values={{
                  attacker: state.sides.attacker.traitValues,
                  defender: state.sides.defender.traitValues,
                }}
                views={traitViews}
              />
              <View className="conditions-sheet__marks">
                <MarkEditor
                  marks={state.marks.attacker}
                  onChange={(polarity, value) =>
                    setMark("attacker", polarity, value)
                  }
                  side="attacker"
                />
                <MarkEditor
                  marks={state.marks.defender}
                  onChange={(polarity, value) =>
                    setMark("defender", polarity, value)
                  }
                  side="defender"
                />
              </View>
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

      <ResultSheet
        actions={resultActions}
        activeActionKeys={[...resultActionHistoryRef.current.keys()]}
        actionFeedback={actionFeedback}
        onActionControlChange={updateResultActionControl}
        onApplyAction={applyResultAction}
        onClose={closeResults}
        onSelectSkill={(selectedSkillIndex) => updateDirection(direction, {
          selectedDamageSource: "skill",
          selectedSkillIndex,
        })}
        onSelectTrait={() => updateDirection(direction, {
          selectedDamageSource: "trait",
        })}
        onTraitHitCountChange={(traitDamageHitCount) =>
          updateDirection(direction, { traitDamageHitCount })
        }
        open={resultOpen}
        selectedIndex={activeDirectionState.selectedSkillIndex}
        showTypeAnalysis={showTypeAnalysis}
        traitDamageHitCount={activeDirectionState.traitDamageHitCount}
        view={calculation}
      />
    </View>
  );
}
