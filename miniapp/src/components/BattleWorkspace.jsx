import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import Taro from "@tarojs/taro";
import { Button, Text, View } from "@tarojs/components";
import { restoreResultContext } from "../platform/result-interaction.js";
import { getLegalSkillIds } from "../shared/domain/skill-loadout.js";
import { createCalculationView } from "../view-models/calculation.js";
import {
  getSkill,
  getSkillChoices,
} from "../view-models/skills.js";
import CombatantCard from "./CombatantCard.jsx";
import DirectionSwitch from "./DirectionSwitch.jsx";
import ModeSwitch from "./ModeSwitch.jsx";
import ResultBar from "./ResultBar.jsx";
import ResultSheet from "./ResultSheet.jsx";
import SkillConditionEditor from "./SkillConditionEditor.jsx";
import SkillPicker from "./SkillPicker.jsx";
import SkillSlots from "./SkillSlots.jsx";

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

export default function BattleWorkspace({
  favoriteIds = [],
  onFavoriteToggle,
  onShareChange,
  petImages,
  snapshot,
  store,
}) {
  const [direction, setDirection] = useState("forward");
  const [resultOpen, setResultOpen] = useState(false);
  const resultTriggerRef = useRef(null);
  const state = useSyncExternalStore(
    store.subscribe,
    store.getState,
    store.getState,
  );
  const attacker = getSpirit(
    snapshot,
    state.sides.attacker.spiritId,
  );
  const defender = getSpirit(
    snapshot,
    state.sides.defender.spiritId,
  );
  const activeSide =
    direction === "forward" ? "attacker" : "defender";
  const activeSideLabel =
    activeSide === "attacker" ? "攻击方" : "防守方";
  const activeConfiguration = state.sides[activeSide];
  const directionState = state.directions[direction];
  const skillChoices = getSkillChoices(
    snapshot,
    activeConfiguration.spiritId,
  );
  const selectedSkillEntry =
    state.mode === "four"
      ? activeConfiguration.skills.four[
          directionState.selectedSkillIndex
        ]
      : activeConfiguration.skills.single;
  const selectedSkill = getSkill(snapshot, selectedSkillEntry);
  const selectedSlotDetails =
    selectedSkillEntry &&
    typeof selectedSkillEntry === "object"
      ? selectedSkillEntry
      : {};
  const conditionContext =
    state.mode === "four"
      ? selectedSlotDetails.context ?? {}
      : directionState.context;
  const conditionDirection =
    state.mode === "four"
      ? {
          hitCount: selectedSlotDetails.hitCount ?? 1,
          overrides: selectedSlotDetails.overrides ?? {},
        }
      : directionState;
  const calculation = createCalculationView(
    snapshot,
    state,
    direction,
  );

  useEffect(() => {
    onShareChange?.(calculation, state);
  }, [calculation, onShareChange, state]);

  function setSpirit(side, value) {
    store.dispatch({
      type: "side/set-spirit",
      side,
      value,
      legalSkillIds: getLegalSkillIds(snapshot, value),
    });
  }

  function setNature(side, value) {
    store.dispatch({
      type: "side/set-nature",
      side,
      value,
    });
  }

  function setIv(side, stat, value) {
    store.dispatch({
      type: "side/set-iv",
      side,
      stat,
      value,
    });
  }

  function updateDirection(value) {
    store.dispatch({
      direction,
      type: "direction/update",
      value,
    });
  }

  function setSingleSkill(value) {
    store.dispatch({
      side: activeSide,
      type: "side/set-single-skill",
      value,
    });
  }

  function setFourSkill(index, value) {
    store.dispatch({
      index,
      side: activeSide,
      type: "side/set-four-skill",
      value,
    });
  }

  function updateSelectedSlot(value) {
    const index = directionState.selectedSkillIndex;
    const current = activeConfiguration.skills.four[index];
    const entry =
      current && typeof current === "object"
        ? current
        : { skillId: current };
    const next = { ...entry, ...value };
    if (value.context) {
      next.context = {
        ...(entry.context ?? {}),
        ...value.context,
      };
    }
    if (value.overrides) {
      next.overrides = {
        ...(entry.overrides ?? {}),
        ...value.overrides,
      };
    }
    setFourSkill(index, next);
  }

  function updateSkillContext(context) {
    if (state.mode === "four") {
      updateSelectedSlot({ context });
      return;
    }
    updateDirection({ context });
  }

  function updateSkillDirection(value) {
    if (state.mode === "four") {
      updateSelectedSlot(value);
      return;
    }
    updateDirection(value);
  }

  function closeResults() {
    setResultOpen(false);
    restoreResultContext({
      platform: Taro,
      trigger: resultTriggerRef.current,
    });
  }

  function selectResultSkill(index) {
    updateDirection({ selectedSkillIndex: index });
  }

  return (
    <View className="battle-workspace">
      <View className="battle-workspace__duel">
        <CombatantCard
          configuration={state.sides.attacker}
          favorite={favoriteIds.includes(attacker?.id)}
          favoriteIds={favoriteIds}
          imageUrl={getSpiritImageUrl(petImages, attacker)}
          onIvChange={(stat, value) => setIv("attacker", stat, value)}
          onChange={(value) => setSpirit("attacker", value)}
          onFavoriteToggle={onFavoriteToggle}
          onNatureChange={(value) => setNature("attacker", value)}
          side="attacker"
          snapshot={snapshot}
          spirit={attacker}
          spirits={snapshot.spirits ?? []}
        />
        <DirectionSwitch
          onSwap={() => store.dispatch({ type: "sides/swap" })}
        />
        <CombatantCard
          configuration={state.sides.defender}
          favorite={favoriteIds.includes(defender?.id)}
          favoriteIds={favoriteIds}
          imageUrl={getSpiritImageUrl(petImages, defender)}
          onIvChange={(stat, value) => setIv("defender", stat, value)}
          onChange={(value) => setSpirit("defender", value)}
          onFavoriteToggle={onFavoriteToggle}
          onNatureChange={(value) => setNature("defender", value)}
          side="defender"
          snapshot={snapshot}
          spirit={defender}
          spirits={snapshot.spirits ?? []}
        />
      </View>
      <View className="workspace-section">
        <Text className="workspace-section__title">快速配置</Text>
        <View className="calculation-direction">
          <Button
            aria-label="查看攻击方攻击结果"
            aria-pressed={direction === "forward"}
            className={
              direction === "forward"
                ? "calculation-direction__button calculation-direction__button--active"
                : "calculation-direction__button"
            }
            onClick={() => setDirection("forward")}
          >
            攻击方 → 防守方
          </Button>
          <Button
            aria-label="查看防守方攻击结果"
            aria-pressed={direction === "reverse"}
            className={
              direction === "reverse"
                ? "calculation-direction__button calculation-direction__button--active"
                : "calculation-direction__button"
            }
            onClick={() => setDirection("reverse")}
          >
            防守方 → 攻击方
          </Button>
        </View>
        <ModeSwitch
          onChange={(value) =>
            store.dispatch({ type: "mode/set", value })
          }
          value={state.mode}
        />
        {state.mode === "four" ? (
          <SkillSlots
            choices={skillChoices}
            label={activeSideLabel}
            onChange={setFourSkill}
            onSelect={(selectedSkillIndex) =>
              updateDirection({ selectedSkillIndex })
            }
            selectedIndex={directionState.selectedSkillIndex}
            values={activeConfiguration.skills.four}
          />
        ) : (
          <SkillPicker
            choices={skillChoices}
            label={`${activeSideLabel}单技能`}
            onChange={setSingleSkill}
            value={activeConfiguration.skills.single}
          />
        )}
        <SkillConditionEditor
          context={conditionContext}
          direction={conditionDirection}
          onContextChange={updateSkillContext}
          onDirectionChange={updateSkillDirection}
          skill={selectedSkill}
        />
      </View>
      <ResultBar
        onOpen={() => setResultOpen(true)}
        open={resultOpen}
        ref={resultTriggerRef}
        view={calculation}
      />
      <ResultSheet
        onClose={closeResults}
        onSelectSkill={selectResultSkill}
        open={resultOpen}
        selectedIndex={directionState.selectedSkillIndex}
        view={calculation}
      />
    </View>
  );
}
