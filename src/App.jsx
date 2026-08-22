import { useEffect, useMemo, useRef, useState } from "react";
import { AdvancedOptions } from "./components/AdvancedOptions.jsx";
import { AppHeader } from "./components/AppHeader.jsx";
import {
  CompactFourSkillEditor,
  CompactSingleSkillEditor,
} from "./components/CompactSkillEditor.jsx";
import { FourSkillEditor } from "./components/FourSkillEditor.jsx";
import { FloatingUndoButton } from "./components/FloatingUndoButton.jsx";
import { NatureStatsStep } from "./components/NatureStatsStep.jsx";
import { QuickNaturePicker } from "./components/QuickNaturePicker.jsx";
import { QuickIvPicker } from "./components/QuickIvPicker.jsx";
import { ResultRail } from "./components/ResultRail.jsx";
import { SingleSkillEditor } from "./components/SingleSkillEditor.jsx";
import { SkillStep } from "./components/SkillStep.jsx";
import { SpiritStep } from "./components/SpiritStep.jsx";
import { WorkspaceOverlays } from "./components/WorkspaceOverlays.jsx";
import { FEEDBACK_QQ } from "./components/DataSourceDialog.jsx";
import {
  completeFirstRunGuide,
  isFirstRunGuideCompleted,
} from "./state/first-run-guide.js";
import {
  readNegativeStatusSettlementSetting,
  readPowerDisplayMode,
  readTypeCoverageSetting,
  writeNegativeStatusSettlementSetting,
  writePowerDisplayMode,
  writeTypeCoverageSetting,
} from "./state/display-settings.js";
import {
  buildCalculatorViewModel,
  clampStage,
  getPanelView,
  getSkill,
  getSkillSlotView,
  getSpirit,
  getTraitView,
  stageMultiplier,
} from "./domain/calculator-view-model.js";
import {
  buildChoiceSkillSequence,
  hasPersistentSkillProgression,
  isChoiceSkill,
  supportsChoiceTrait,
} from "./domain/choice-skill-sequence.js";
import { resolveSkillStatusActivation } from "./domain/skill-status-effects.js";
import {
  hasNegativeStatusSkillApplication,
  hasNegativeStatusTraitApplication,
} from "./domain/negative-status-rules.js";
import { hasDeclaredHitCount } from "./domain/skill-effects.js";
import {
  copyPositiveAbilityStages,
  hasFairPigeonBalance,
} from "./domain/fair-pigeon.js";
import { getNatureMultipliers } from "./domain/natures.js";
import { calculateAllPanelStats } from "./domain/stat.js";
import { createSpiritSearchIndex } from "./data/search-index.js";
import { withCalculatorExtras } from "./data/snapshot-extras.js";
import { useStoredCalculatorData } from "./hooks/useStoredCalculatorData.js";
import {
  applyConfiguration as applySessionConfiguration,
  abilityLevelMultiplier,
  assertSnapshotReferences,
  createProductInitialState,
  migrateSharedConfiguration,
  patchFourSkill,
  reduceSessionAction,
  rememberSingleSkill as rememberSessionSingleSkill,
  replaceConfiguration,
  selectFourSkill as selectSessionFourSkill,
  selectSingleSkill as selectSessionSingleSkill,
  selectSpirit,
  shareHashFromInput,
  sameConfigurationVersions,
  toggleDirection,
  updateGlobalRain,
  updateGlobalWeather,
  updateMirroredTraitContext,
} from "./state/calculator-session.js";
import { decodeShareState, encodeShareState } from "./state/share.js";
import { createUndoHistory } from "./state/undo-history.js";
import packageInfo from "../package.json";

const POPULAR_CONFIG_COUNT = 193;

function configLibraryFileName(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return `洛克计算器-收藏配置-${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}.json`;
}

async function saveConfigLibraryFile(library) {
  const content = `${JSON.stringify(library, null, 2)}\n`;
  const filename = configLibraryFileName();
  const file = new File([content], filename, { type: "application/json" });
  if (
    globalThis.navigator?.share &&
    globalThis.navigator?.canShare?.({ files: [file] })
  ) {
    await globalThis.navigator.share({ files: [file], title: "洛克计算器配置库" });
    return;
  }
  const url = URL.createObjectURL(file);
  const anchor = document.createElement("a");
  anchor.download = filename;
  anchor.href = url;
  anchor.click();
  URL.revokeObjectURL(url);
}

function CalculatorWorkspace({ snapshot }) {
  const initialState = useMemo(() => {
    const next = createProductInitialState(snapshot);
    return {
      ...next,
      calculationOptions: {
        ...next.calculationOptions,
        includeNegativeStatusSettlement:
          readNegativeStatusSettlementSetting(),
      },
    };
  }, [snapshot]);
  const [state, setState] = useState(initialState);
  const stateRef = useRef(initialState);
  const undoHistoryRef = useRef(createUndoHistory({ limit: 50 }));
  const undoBatchRef = useRef(null);
  const undoBatchSequenceRef = useRef(0);
  const [undoCount, setUndoCount] = useState(0);
  const [activeDirection, setActiveDirection] = useState("forward");
  const [configLibraryError, setConfigLibraryError] = useState("");
  const [configLibraryMode, setConfigLibraryMode] = useState(null);
  const [configLibraryParsed, setConfigLibraryParsed] = useState(null);
  const [configLibrarySummary, setConfigLibrarySummary] = useState(null);
  const [cleanupConfigsOpen, setCleanupConfigsOpen] = useState(false);
  const [dataSourceOpen, setDataSourceOpen] = useState(false);
  const [displaySettingsOpen, setDisplaySettingsOpen] = useState(false);
  const [powerDisplayMode, setPowerDisplayMode] = useState(() =>
    readPowerDisplayMode(),
  );
  const [typeCoverageEnabled, setTypeCoverageEnabled] = useState(() =>
    readTypeCoverageSetting(),
  );
  const [importDraft, setImportDraft] = useState("");
  const [firstRunGuideError, setFirstRunGuideError] = useState("");
  const [firstRunGuideImporting, setFirstRunGuideImporting] = useState(false);
  const [firstRunGuideOpen, setFirstRunGuideOpen] = useState(
    () => !isFirstRunGuideCompleted(),
  );
  const [firstRunGuideStep, setFirstRunGuideStep] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileResultOpen, setMobileResultOpen] = useState(false);
  const [pendingSharedState, setPendingSharedState] = useState(null);
  const [shareLink, setShareLink] = useState("");
  const [shareOpen, setShareOpen] = useState(false);
  const [teamOpen, setTeamOpen] = useState(false);
  const [viewMode, setViewMode] = useState("compact");
  const drawerCloseRef = useRef(null);
  const menuButtonRef = useRef(null);
  const menuRef = useRef(null);
  const mobileResultTriggerRef = useRef(null);
  const resultDrawerRef = useRef(null);
  const shareDialogRef = useRef(null);
  const teamsButtonRef = useRef(null);
  const versionDialogRef = useRef(null);
  const [toast, setToast] = useState("");
  const storedData = useStoredCalculatorData(snapshot, { onToast: setToast });
  const {
    completeSpiritIds,
    favoriteSpiritIds,
    teams: teamActions,
    teamsState,
    toggleSpiritFavorite,
  } = storedData;

  useEffect(() => {
    if (teamsState.warning) setToast(teamsState.warning);
  }, [teamsState.warning]);

  function startUndoBatch() {
    if (undoBatchRef.current !== null) return undoBatchRef.current;
    undoBatchSequenceRef.current += 1;
    undoBatchRef.current = undoBatchSequenceRef.current;
    queueMicrotask(() => {
      undoBatchRef.current = null;
    });
    return undoBatchRef.current;
  }

  function commitState(nextState, rememberSide = null, {
    groupKey = null,
    recordHistory = true,
  } = {}) {
    if (nextState === stateRef.current) return nextState;
    if (recordHistory) {
      undoHistoryRef.current.record(stateRef.current, {
        batchToken: startUndoBatch(),
        groupKey,
        rememberSide,
      });
      setUndoCount(undoHistoryRef.current.size());
    }
    stateRef.current = nextState;
    setState(nextState);
    const configuredSide = rememberSide
      ? nextState.sides[rememberSide]
      : null;
    if (configuredSide?.spiritId) storedData.rememberSide(configuredSide);
    return nextState;
  }

  function commitSession(result, options) {
    commitState(result.state, result.persistence.rememberSide, options);
    return result.state;
  }

  function dispatch(action) {
    const valueKeys = action?.value && typeof action.value === "object"
      ? Object.keys(action.value).sort().join(",")
      : "";
    const groupKey = [
      action?.type,
      action?.side,
      action?.direction,
      action?.index,
      action?.stat,
      action?.key,
      valueKeys,
    ].filter((value) => value !== undefined && value !== "").join(":");
    return commitSession(reduceSessionAction(stateRef.current, action), { groupKey });
  }

  function undoLastChange() {
    const previous = undoHistoryRef.current.undo();
    if (!previous) return;
    undoBatchRef.current = null;
    stateRef.current = previous.state;
    setState(previous.state);
    for (const side of previous.rememberSides) {
      const configuredSide = previous.state.sides?.[side];
      if (configuredSide?.spiritId) storedData.rememberSide(configuredSide);
    }
    setUndoCount(undoHistoryRef.current.size());
    setToast("已撤回上一步");
  }

  function closeConfigLibrary() {
    setConfigLibraryError("");
    setConfigLibraryMode(null);
    setConfigLibraryParsed(null);
    setConfigLibrarySummary(null);
  }

  function openConfigLibraryExport() {
    setConfigLibraryError("");
    setConfigLibraryParsed(null);
    setConfigLibrarySummary(storedData.buildFavoriteConfigLibrary({
      appVersion: packageInfo.version,
      versions: initialState.versions,
    }));
    setConfigLibraryMode("export");
  }

  function openConfigLibraryImport() {
    setConfigLibraryError("");
    setConfigLibraryParsed(null);
    setConfigLibrarySummary(null);
    setConfigLibraryMode("import");
  }

  async function loadPopularConfigLibrary() {
    const response = await fetch("/data/presets/pvp-popular-configs.json");
    if (!response.ok) {
      throw new Error(`内置配置读取失败：${response.status}`);
    }
    return storedData.previewFavoriteConfigLibrary(
      await response.text(),
      initialState.versions,
    );
  }

  async function openPopularConfigLibrary() {
    setConfigLibraryError("");
    setConfigLibraryParsed(null);
    setConfigLibrarySummary(null);
    setConfigLibraryMode("popular");
    try {
      setConfigLibraryParsed(await loadPopularConfigLibrary());
    } catch (error) {
      setConfigLibraryError(
        error instanceof Error ? error.message : "内置配置无法读取",
      );
    }
  }

  function finishFirstRunGuide() {
    completeFirstRunGuide();
    setFirstRunGuideError("");
    setFirstRunGuideOpen(false);
    setFirstRunGuideStep(0);
  }

  async function importPopularConfigFromGuide() {
    setFirstRunGuideError("");
    setFirstRunGuideImporting(true);
    try {
      const parsed = await loadPopularConfigLibrary();
      const result = storedData.importFavoriteConfigLibrary(parsed);
      finishFirstRunGuide();
      setToast(
        `已导入 ${result.preview.added + result.preview.overwritten} 只常用配置，后续修改仍会记忆`,
      );
    } catch (error) {
      setFirstRunGuideError(
        error instanceof Error ? error.message : "常用配置导入失败",
      );
    } finally {
      setFirstRunGuideImporting(false);
    }
  }

  async function previewConfigLibraryFile(file) {
    setConfigLibraryError("");
    setConfigLibraryParsed(null);
    if (!file) return;
    try {
      if (file.size > 5 * 1024 * 1024) {
        throw new TypeError("配置库文件不能超过 5 MB");
      }
      const parsed = storedData.previewFavoriteConfigLibrary(
        await file.text(),
        initialState.versions,
      );
      setConfigLibraryParsed(parsed);
    } catch (error) {
      setConfigLibraryError(
        error instanceof Error ? error.message : "配置库文件无法读取",
      );
    }
  }

  function applySharedConfiguration(configuration, options) {
    commitSession(
      replaceConfiguration(stateRef.current, configuration, {
        remember: false,
        source: "share",
      }),
      options,
    );
  }

  async function loadSharedState(value) {
    const hash = shareHashFromInput(value);
    const decodedState = await decodeShareState(hash);
    const sharedState = migrateSharedConfiguration(
      decodedState,
      decodedState.versions,
      snapshot,
    );
    assertSnapshotReferences(sharedState, snapshot);
    if (!sameConfigurationVersions(sharedState.versions, initialState.versions)) {
      setPendingSharedState(sharedState);
      return;
    }
    applySharedConfiguration(sharedState);
    setToast("分享配置已载入");
  }

  useEffect(() => {
    if (!globalThis.location?.hash?.startsWith("#v1.")) return undefined;
    let active = true;
    decodeShareState(globalThis.location.hash)
      .then((decodedState) => {
        if (!active) return;
        const sharedState = migrateSharedConfiguration(
          decodedState,
          decodedState.versions,
          snapshot,
        );
        assertSnapshotReferences(sharedState, snapshot);
        if (!sameConfigurationVersions(sharedState.versions, initialState.versions)) {
          setPendingSharedState(sharedState);
        } else {
          applySharedConfiguration(sharedState, { recordHistory: false });
        }
      })
      .catch((error) => {
        if (active) setToast(error.message);
      });
    return () => {
      active = false;
    };
  }, [initialState]);

  const spiritIndex = useMemo(
    () => createSpiritSearchIndex(snapshot.spirits),
    [snapshot.spirits],
  );
  const viewModel = useMemo(
    () =>
      buildCalculatorViewModel({
        activeDirection,
        completeSpiritIds,
        favoriteSpiritIds,
        snapshot,
        spiritIndex,
        state,
      }),
    [
      activeDirection,
      completeSpiritIds,
      favoriteSpiritIds,
      snapshot,
      spiritIndex,
      state,
    ],
  );
  const { calculation, configurationReady, currentDirection } = viewModel;
  const { attacker: attackerView, defender: defenderView } = viewModel.sides;
  const attacker = attackerView.spirit;
  const defender = defenderView.spirit;
  const fairPigeonPresent =
    hasFairPigeonBalance(attacker) || hasFairPigeonBalance(defender);
  const attackerHealth = attackerView.health;
  const defenderHealth = defenderView.health;
  const activeAttackSideKey = viewModel.active.attackSideKey;
  const activeAttackSpirit = viewModel.active.attackSpirit;
  const activeDefenseSpirit = viewModel.active.defenseSpirit;
  const activeAttackSkills = viewModel.skills.activeChoices;
  const attackerSkillChoices = viewModel.skills.attackerChoices;
  const defenderSkillChoices = viewModel.skills.defenderChoices;
  const selectedSingleSkill = viewModel.skills.selectedSingle;
  const selectableSpirits = viewModel.selectableSpirits;
  const resultModel = viewModel.result;
  const selectedFourSkill =
    state.mode === "four"
      ? getSkill(
          snapshot,
          state.sides[activeAttackSideKey]?.skills?.four?.[
            currentDirection.selectedSkillIndex
          ],
        )
      : null;
  const reductionDirectionKey =
    selectedFourSkill?.category === "defense"
      ? activeDirection === "forward"
        ? "reverse"
        : "forward"
      : activeDirection;
  const reductionDirection = state.directions[reductionDirectionKey];
  const {
    attackLevelStage,
    defenseLevelStage,
    weatherRainTurns,
  } = viewModel.environment;

  async function generateShareLink() {
    if (!configurationReady) {
      setShareLink("");
      return "";
    }
    const hash = await encodeShareState(state);
    globalThis.history?.replaceState?.(null, "", hash);
    const nextShareLink = globalThis.location.href;
    setShareLink(nextShareLink);
    return nextShareLink;
  }

  async function openShareConfiguration() {
    setImportDraft("");
    setShareOpen(true);
    try {
      await generateShareLink();
    } catch (error) {
      setToast(error instanceof Error ? error.message : "分享失败");
    }
  }

  async function copyShareLink() {
    try {
      const link = shareLink || await generateShareLink();
      if (!link) {
        setToast("请先选择双方精灵");
        return;
      }
      if (!globalThis.navigator?.clipboard?.writeText) {
        setToast("复制受限，请手动复制上方链接");
        return;
      }
      try {
        await globalThis.navigator.clipboard.writeText(link);
        setToast("分享链接已复制");
      } catch {
        setToast("复制受限，请手动复制上方链接");
      }
    } catch (error) {
      setToast(error instanceof Error ? error.message : "分享失败");
    }
  }

  function updateDirection(value) {
    dispatch({
      direction: activeDirection,
      type: "direction/update",
      value,
    });
  }

  function updatePowerLevel(role, nextStage) {
    const stage = clampStage(nextStage);
    const nextAttackStage =
      role === "attack" ? stage : attackLevelStage;
    const nextDefenseStage =
      role === "defense" ? stage : defenseLevelStage;
    updateDirection({
      overrides: {
        attackDefenseLevelMultiplier:
          abilityLevelMultiplier(nextAttackStage, nextDefenseStage),
        [`${role}LevelStage`]: stage,
      },
    });
  }

  function abilityStagesForSide(currentState, side) {
    return side === "attacker"
      ? {
          attack:
            currentState.directions.forward.overrides.attackLevelStage ?? 0,
          defense:
            currentState.directions.reverse.overrides.defenseLevelStage ?? 0,
        }
      : {
          attack:
            currentState.directions.reverse.overrides.attackLevelStage ?? 0,
          defense:
            currentState.directions.forward.overrides.defenseLevelStage ?? 0,
        };
  }

  function updateSideAbilityLevel(side, role, nextStage) {
    const direction = role === "attack"
      ? side === "attacker" ? "forward" : "reverse"
      : side === "attacker" ? "reverse" : "forward";
    dispatch({
      direction,
      type: "direction/update",
      value: {
        overrides: { [`${role}LevelStage`]: clampStage(nextStage) },
      },
    });
  }

  function copyAbilityStages(sourceSide, targetSide, sourceStages = null) {
    const latest = stateRef.current;
    const source = sourceStages ?? abilityStagesForSide(latest, sourceSide);
    const target = abilityStagesForSide(latest, targetSide);
    const copied = copyPositiveAbilityStages(source, target);
    updateSideAbilityLevel(targetSide, "attack", copied.attack);
    updateSideAbilityLevel(targetSide, "defense", copied.defense);
  }

  function balanceTriggerId(side) {
    const spirit = side === "attacker" ? attacker : defender;
    return getTraitView(snapshot, spirit, "attacker")?.inputs?.find(
      (input) => input.contextKey === "balanceTriggered",
    )?.id;
  }

  function balanceIsTriggered(currentState, side) {
    const inputId = balanceTriggerId(side);
    if (!inputId) return false;
    const direction = side === "attacker" ? "forward" : "reverse";
    return currentState.directions[direction].context?.[inputId] === true;
  }

  function updateWeatherRainTurns(value) {
    commitSession(updateGlobalRain(stateRef.current, value));
  }

  function updateWeather(weather) {
    commitSession(updateGlobalWeather(stateRef.current, weather));
  }

  function updateTraitContext(direction, key, value) {
    const previousValue = stateRef.current.directions[direction].context?.[key];
    commitSession(
      updateMirroredTraitContext(stateRef.current, { direction, key, value }),
    );
    const attackingSide = direction === "forward" ? "attacker" : "defender";
    const defendingSide = attackingSide === "attacker" ? "defender" : "attacker";
    const ownerSide = key.startsWith("defenderTrait.")
      ? defendingSide
      : attackingSide;
    commitSession(
      rememberSessionSingleSkill(stateRef.current, {
        direction,
        side: ownerSide,
        snapshot,
      }),
    );
    if (
      value === true &&
      previousValue !== true &&
      key.includes(".balanceTriggered.") &&
      hasFairPigeonBalance(ownerSide === "attacker" ? attacker : defender)
    ) {
      copyAbilityStages(
        ownerSide === "attacker" ? "defender" : "attacker",
        ownerSide,
      );
      setToast("衡量已触发：已复制对方当前正面攻防等级");
    }
  }

  function updateSideHealth(side, currentHp) {
    dispatch({
      direction: side === "attacker" ? "reverse" : "forward",
      type: "direction/update",
      value: { currentHp },
    });
  }

  function updateSideHealthPercent(side, currentHpPercent) {
    dispatch({
      direction: side === "attacker" ? "reverse" : "forward",
      type: "direction/update",
      value: { context: { currentHpPercent } },
    });
  }

  function applySpiritConfiguration(side, configuration, { source, remember }) {
    const result = applySessionConfiguration(stateRef.current, configuration, {
      initialState,
      remember,
      side,
      snapshot,
      source,
    });
    commitSession(result);
    setActiveDirection(result.activeDirection);
  }

  function changeSpirit(side, spiritId) {
    const remembered = storedData.getSpiritConfiguration(spiritId);
    const result = selectSpirit(stateRef.current, {
      initialState,
      personalConfiguration: remembered,
      side,
      snapshot,
      spiritId,
    });
    commitSession(result);
    setActiveDirection(result.activeDirection);
  }

  function updateFourSkillEntry(side, index, patch) {
    commitSession(
      patchFourSkill(stateRef.current, { index, patch, side, snapshot }),
      { groupKey: `four:${side}:${index}:${Object.keys(patch).sort().join(",")}` },
    );
  }

  function addFixedPowerToFirstAttackOfEachType(side, amount, current = {}) {
    const next = { ...current };
    const seenTypes = new Set();
    for (const [index, entry] of stateRef.current.sides[side].skills.four.entries()) {
      const carriedSkill = getSkill(snapshot, entry);
      if (
        !carriedSkill ||
        carriedSkill.category === "status" ||
        carriedSkill.category === "defense" ||
        seenTypes.has(carriedSkill.type)
      ) {
        continue;
      }
      seenTypes.add(carriedSkill.type);
      const slot = String(index + 1);
      next[slot] = Number(next[slot] ?? 0) + amount;
    }
    return next;
  }

  function addPowerPercentToAttacksOfType(side, type, amount, current = {}) {
    const next = { ...current };
    for (const [index, entry] of stateRef.current.sides[side].skills.four.entries()) {
      const carriedSkill = getSkill(snapshot, entry);
      if (
        !carriedSkill ||
        carriedSkill.category === "status" ||
        carriedSkill.category === "defense" ||
        carriedSkill.type !== type
      ) {
        continue;
      }
      const slot = String(index + 1);
      next[slot] = Number(next[slot] ?? 0) + amount;
    }
    return next;
  }

  function addPowerPercentToAllAttacks(side, amount, current = {}) {
    const next = { ...current };
    for (const [index, entry] of stateRef.current.sides[side].skills.four.entries()) {
      const carriedSkill = getSkill(snapshot, entry);
      if (
        !carriedSkill ||
        carriedSkill.category === "status" ||
        carriedSkill.category === "defense"
      ) {
        continue;
      }
      const slot = String(index + 1);
      next[slot] = Number(next[slot] ?? 0) + amount;
    }
    return next;
  }

  function mergePowerPercentAdds(current = {}, additions = {}) {
    const next = { ...current };
    for (const [slot, amount] of Object.entries(additions)) {
      next[slot] = Number(next[slot] ?? 0) + Number(amount ?? 0);
    }
    return next;
  }

  function removePowerPercentAdds(current = {}, additions = {}) {
    const next = { ...current };
    for (const [slot, amount] of Object.entries(additions)) {
      const value = Number(next[slot] ?? 0) - Number(amount ?? 0);
      if (Math.abs(value) < 1e-9) delete next[slot];
      else next[slot] = value;
    }
    return next;
  }

  function setSkillMode(value) {
    dispatch({ type: "mode/set", value });
  }

  function rememberSingleSkill(skillId) {
    commitSession(
      rememberSessionSingleSkill(stateRef.current, {
        direction: activeDirection,
        side: activeAttackSideKey,
        skillId,
        snapshot,
      }),
    );
  }

  function activateFourSkill(side, index) {
    let latest = stateRef.current;
    const entry = latest.sides[side].skills.four[index];
    const skill = getSkill(snapshot, entry);
    const context =
      entry && typeof entry === "object" ? entry.context ?? {} : {};
    const activationContextSignature = JSON.stringify(context);
    const selfDirection = side === "attacker" ? "forward" : "reverse";
    const oppositeDirection =
      selfDirection === "forward" ? "reverse" : "forward";
    const activeDefenseStatus =
      latest.directions[selfDirection].overrides?.activeDefenseStatus;
    const isSameActiveStatus =
      activeDefenseStatus?.skillId === skill?.id &&
      activeDefenseStatus?.slotIndex === index &&
      activeDefenseStatus?.contextSignature === activationContextSignature;
    if (activeDefenseStatus) {
      const currentOverrides =
        latest.directions[selfDirection].overrides ?? {};
      dispatch({
        direction: selfDirection,
        type: "direction/update",
        value: {
          overrides: {
            activeDefenseStatus: null,
            skillPowerPercentAddsBySlot: removePowerPercentAdds(
              currentOverrides.skillPowerPercentAddsBySlot,
              activeDefenseStatus.powerPercentAddsBySlot,
            ),
          },
        },
      });
      dispatch({
        direction: oppositeDirection,
        type: "direction/set-reduction",
        value: 1,
      });
      latest = stateRef.current;
      if (isSameActiveStatus) {
        setActiveDirection(selfDirection);
        setToast(`${skill.name}的状态已解除`);
        return;
      }
    }
    const spirit = getSpirit(snapshot, latest.sides[side]);
    const detectedChoiceTrait = getTraitView(snapshot, spirit, "attacker").name;
    let negativeStatusUseCount = null;
    const canApplyNegativeStatus =
      latest.calculationOptions?.includeNegativeStatusSettlement === true &&
      (hasNegativeStatusSkillApplication(skill) ||
        hasNegativeStatusTraitApplication(detectedChoiceTrait));
    if (canApplyNegativeStatus) {
      const currentCounts =
        latest.directions[selfDirection].context
          ?.negativeStatusUseCountsBySlot ?? {};
      const currentCount = Math.min(
        2,
        Math.max(0, Math.floor(Number(currentCounts[index + 1]) || 0)),
      );
      negativeStatusUseCount = currentCount >= 2 ? 0 : currentCount + 1;
      dispatch({
        direction: selfDirection,
        type: "direction/update",
        value: {
          context: {
            negativeStatusUseCountsBySlot: {
              ...currentCounts,
              [index + 1]: negativeStatusUseCount,
            },
          },
        },
      });
      if (negativeStatusUseCount === 0) {
        setActiveDirection(selfDirection);
        setToast(`${skill.name}的负面状态已取消`);
        return;
      }
    }
    const choiceTrait =
      context.choiceTraitTriggered === true &&
      supportsChoiceTrait(detectedChoiceTrait)
        ? detectedChoiceTrait
        : null;
    const healthDirection =
      side === "attacker" ? latest.directions.reverse : latest.directions.forward;
    const panelStats = calculateAllPanelStats({
      raceStats: spirit.raceStats,
      displayIvs: latest.sides[side].displayIvs,
      natureMultipliers: getNatureMultipliers(latest.sides[side].nature),
    });
    const storedHpPercent = Number(healthDirection.context?.currentHpPercent);
    const attackerHpPercent = Number.isFinite(storedHpPercent)
      ? storedHpPercent
      : ((healthDirection.currentHp ?? panelStats.hp) / Math.max(1, panelStats.hp)) *
        100;
    const positiveMark = latest.marks?.[side]?.positive;
    const sproutStacks = positiveMark?.id === "sprout"
      ? Math.min(99, Math.max(0, Math.floor(Number(positiveMark.stacks) || 0)))
      : 0;
    const resolution = resolveSkillStatusActivation(skill, {
      ...context,
      attackerHpPercent,
      carriedSkills: latest.sides[side].skills.four
        .map((carriedEntry) => getSkill(snapshot, carriedEntry))
        .filter(Boolean),
      choiceTrait,
      effectiveHitCount:
        calculation?.[selfDirection]?.results?.[index]?.hitCount,
      sproutStacks,
    });
    const postAttackStageAdd = Math.max(
      0,
      Math.floor(Number(
        calculation?.[selfDirection]?.results?.[index]
          ?.postAttackEffects?.attackLevelStageAdd,
      ) || 0),
    );
    if (!resolution) {
      if (postAttackStageAdd > 0) {
        const currentOverrides =
          latest.directions[selfDirection].overrides ?? {};
        dispatch({
          direction: selfDirection,
          type: "direction/update",
          value: {
            overrides: {
              attackLevelStage: clampStage(
                Number(currentOverrides.attackLevelStage ?? 0) +
                  postAttackStageAdd,
              ),
            },
          },
        });
        setActiveDirection(selfDirection);
        setToast(`贪得无厌：本次共加攻 +${postAttackStageAdd * 10}%`);
        return;
      }
      if (!isChoiceSkill(skill) && !hasPersistentSkillProgression(skill)) {
        if (negativeStatusUseCount !== null) {
          setActiveDirection(selfDirection);
          setToast(
            negativeStatusUseCount === 1
              ? `${skill.name}：本回合`
              : `${skill.name}：本回合 + 下回合`,
          );
        }
        return;
      }
      const sequence = buildChoiceSkillSequence({
        context,
        skill,
        sproutStacks,
        traitName: detectedChoiceTrait,
      });
      updateFourSkillEntry(side, index, { context: sequence.nextContext });
      setActiveDirection(
        side === "attacker" ? "forward" : "reverse",
      );
      setToast(
        sequence.executions.length > 1
          ? `${detectedChoiceTrait}已应用：本次按两段结算`
          : `${skill.name}已记为使用1次`,
      );
      return;
    }
    if (!resolution.applied) {
      setToast(resolution.reason);
      return;
    }

    const selfOverrides =
      latest.directions[selfDirection].overrides ?? {};
    const oppositeOverrides =
      latest.directions[oppositeDirection].overrides ?? {};
    const { deltas, operations = {} } = resolution;
    const doublePositive = (value) =>
      operations.doublePositiveOwnBuffs && value > 0 ? value * 2 : value;
    const ownAttackStage = clampStage(
      doublePositive(
        Number(selfOverrides.attackLevelStage ?? 0) +
          deltas.ownAttack +
          postAttackStageAdd,
      ),
    );
    const ownDefenseStage = clampStage(
      doublePositive(
        Number(oppositeOverrides.defenseLevelStage ?? 0) + deltas.ownDefense,
      ),
    );
    const ownFixedPower = doublePositive(
      Number(selfOverrides.fixedPowerAdd ?? 0) + deltas.ownFixedPower,
    );
    const ownFixedPowerAddsBySlot = operations.fixedPowerOncePerType
      ? addFixedPowerToFirstAttackOfEachType(
          side,
          Number(operations.fixedPowerOncePerType),
          selfOverrides.fixedPowerAddsBySlot,
        )
      : selfOverrides.fixedPowerAddsBySlot;
    let ownSkillPowerPercentAddsBySlot = selfOverrides.skillPowerPercentAddsBySlot;
    if (operations.powerPercentForAllAttacks) {
      ownSkillPowerPercentAddsBySlot = addPowerPercentToAllAttacks(
        side,
        Number(operations.powerPercentForAllAttacks),
        ownSkillPowerPercentAddsBySlot,
      );
    }
    const transientPowerPercent = Number(
      operations.transientPowerPercentForAllAttacks,
    );
    const transientPowerPercentAddsBySlot =
      Number.isFinite(transientPowerPercent) && transientPowerPercent !== 0
        ? addPowerPercentToAllAttacks(
            side,
            transientPowerPercent,
            {},
          )
        : {};
    ownSkillPowerPercentAddsBySlot = mergePowerPercentAdds(
      ownSkillPowerPercentAddsBySlot,
      transientPowerPercentAddsBySlot,
    );
    if (operations.powerPercentForType) {
      ownSkillPowerPercentAddsBySlot = addPowerPercentToAttacksOfType(
        side,
        operations.powerPercentType,
        Number(operations.powerPercentForType),
        ownSkillPowerPercentAddsBySlot,
      );
    }
    const ownSpeedFlat = doublePositive(
      Number(selfOverrides.attackerSpeedFlat ?? 0) + deltas.ownSpeedFlat,
    );
    const ownHitCountAdd = Math.floor(
      Number(selfOverrides.hitCountAdd ?? 0) + deltas.ownHitCountAdd,
    );
    const ownHitCountPercentAdd =
      Number(selfOverrides.hitCountPercentAdd ?? 0) +
      Number(operations.hitCountPercentForAllAttacks ?? 0);
    const targetHitCountAdd = Math.floor(
      Number(oppositeOverrides.hitCountAdd ?? 0) +
      Number(deltas.targetHitCountAdd ?? 0),
    );
    const targetSpeedFlat =
      Number(oppositeOverrides.attackerSpeedFlat ?? 0) +
      Number(deltas.targetSpeedFlat ?? 0);
    const refractionStatuses = [
      ...(selfOverrides.refractionStatuses ?? []),
      ...(operations.refractionStatuses ?? []),
    ];
    const defenseReductionPercent = Number(
      operations.defenseReductionPercent,
    );
    const hasTransientDefenseStatus =
      Number.isFinite(defenseReductionPercent) ||
      Object.keys(transientPowerPercentAddsBySlot).length > 0;

    dispatch({
      direction: selfDirection,
      type: "direction/update",
      value: {
        overrides: {
          attackLevelStage: ownAttackStage,
          attackerSpeedFlat: ownSpeedFlat,
          defenderSpeedFlat:
            Number(selfOverrides.defenderSpeedFlat ?? 0) +
            Number(deltas.targetSpeedFlat ?? 0),
          defenseLevelStage: clampStage(
            Number(selfOverrides.defenseLevelStage ?? 0) + deltas.targetDefense,
          ),
          fixedPowerAdd: ownFixedPower,
          fixedPowerAddsBySlot: ownFixedPowerAddsBySlot,
          skillPowerPercentAddsBySlot: ownSkillPowerPercentAddsBySlot,
          hitCountAdd: ownHitCountAdd,
          hitCountPercentAdd: ownHitCountPercentAdd,
          lifestealPercent:
            Number(selfOverrides.lifestealPercent ?? 0) +
            Number(operations.lifestealPercent ?? 0),
          refractionStatuses,
          ...(hasTransientDefenseStatus
            ? {
                activeDefenseStatus: {
                  contextSignature: activationContextSignature,
                  powerPercentAddsBySlot: transientPowerPercentAddsBySlot,
                  skillId: skill.id,
                  slotIndex: index,
                },
              }
            : {}),
        },
      },
    });
    dispatch({
      direction: oppositeDirection,
      type: "direction/update",
      value: {
        overrides: {
          attackLevelStage: clampStage(
            Number(oppositeOverrides.attackLevelStage ?? 0) + deltas.targetAttack,
          ),
          attackerSpeedFlat: targetSpeedFlat,
          defenderSpeedFlat: ownSpeedFlat,
          defenseLevelStage: ownDefenseStage,
          fixedPowerAdd:
            Number(oppositeOverrides.fixedPowerAdd ?? 0) +
            deltas.targetFixedPower,
          hitCountAdd: targetHitCountAdd,
        },
      },
    });
    const oppositeSide = side === "attacker" ? "defender" : "attacker";
    if (
      hasFairPigeonBalance(oppositeSide === "attacker" ? attacker : defender) &&
      balanceIsTriggered(stateRef.current, oppositeSide)
    ) {
      const gainedAttack = Math.max(
        0,
        ownAttackStage - Number(selfOverrides.attackLevelStage ?? 0),
      );
      const gainedDefense = Math.max(
        0,
        ownDefenseStage - Number(oppositeOverrides.defenseLevelStage ?? 0),
      );
      if (gainedAttack > 0 || gainedDefense > 0) {
        copyAbilityStages(side, oppositeSide, {
          attack: gainedAttack,
          defense: gainedDefense,
        });
      }
    }
    const healPercent = Number(operations.healPercent ?? 0);
    if (healPercent > 0) {
      const currentHp = Math.min(
        panelStats.hp,
        Math.max(
          0,
          Math.round(
            Number(healthDirection.currentHp ?? panelStats.hp) +
            panelStats.hp * healPercent / 100,
          ),
        ),
      );
      dispatch({
        direction: side === "attacker" ? "reverse" : "forward",
        type: "direction/update",
        value: {
          currentHp,
          context: { currentHpPercent: currentHp / panelStats.hp * 100 },
        },
      });
    }
    const targetStarfallStacks = Number(operations.targetStarfallStacks ?? 0);
    if (targetStarfallStacks > 0) {
      const targetSide = side === "attacker" ? "defender" : "attacker";
      const currentMark = latest.marks?.[targetSide]?.negative;
      dispatch({
        polarity: "negative",
        side: targetSide,
        type: "mark/update",
        value: {
          id: "starfall",
          stacks: Math.min(
            99,
            (currentMark?.id === "starfall" ? currentMark.stacks : 0) +
              targetStarfallStacks,
          ),
        },
      });
    }
    for (const markApplication of operations.markApplications ?? []) {
      const markSide = markApplication.target === "self"
        ? side
        : side === "attacker" ? "defender" : "attacker";
      const currentMark = stateRef.current.marks?.[markSide]?.[markApplication.polarity];
      dispatch({
        polarity: markApplication.polarity,
        side: markSide,
        type: "mark/update",
        value: {
          id: markApplication.id,
          stacks: Math.min(
            99,
            (currentMark?.id === markApplication.id ? currentMark.stacks : 0) +
              markApplication.stacks,
          ),
        },
      });
    }
    if (Number.isFinite(defenseReductionPercent)) {
      dispatch({
        direction: oppositeDirection,
        type: "direction/set-reduction",
        value: Math.max(0, 1 - defenseReductionPercent / 100),
      });
    }

    const sequence = buildChoiceSkillSequence({
      context,
      skill,
      sproutStacks,
      traitName: detectedChoiceTrait,
    });
    updateFourSkillEntry(side, index, { context: sequence.nextContext });
    setActiveDirection(selfDirection);
    setToast(
      negativeStatusUseCount === 2
        ? `${skill.name}：本回合 + 下回合`
        : `${skill.name}的状态已应用`,
    );
  }

  function updateRememberedSingleDirection(value) {
    updateDirection(value);
    rememberSingleSkill();
  }

  function selectSingleSkill(skillId) {
    commitSession(
      selectSessionSingleSkill(stateRef.current, {
        direction: activeDirection,
        side: activeAttackSideKey,
        skillId,
        snapshot,
      }),
    );
  }

  function storedHitCount(
    skill,
    direction,
    effectiveHitCount,
    automaticHitCountAdd,
  ) {
    const bonus = Number.isFinite(Number(automaticHitCountAdd))
      ? Math.floor(Number(automaticHitCountAdd))
      : hasDeclaredHitCount(skill)
        ? Math.floor(Number(direction.overrides?.hitCountAdd) || 0)
        : 0;
    return Math.max(1, Math.floor(Number(effectiveHitCount) || 1) - bonus);
  }

  const singleEditor = configurationReady ? (
    <SingleSkillEditor
      attackerHealth={
        activeDirection === "forward" ? attackerHealth : defenderHealth
      }
      attackerLifestealPercent={
        currentDirection.overrides?.lifestealPercent ?? 0
      }
      attackerTrait={getTraitView(snapshot, activeAttackSpirit, "attacker")}
      carriedSkills={state.sides[activeAttackSideKey].skills.four
        .map((entry) => getSkill(snapshot, entry))
        .filter(Boolean)}
      defenderHealth={
        activeDirection === "forward" ? defenderHealth : attackerHealth
      }
      defenderTrait={getTraitView(snapshot, activeDefenseSpirit, "defender")}
      hitCount={resultModel.selectedResult?.hitCount ?? currentDirection.hitCount}
      onHitCountChange={(hitCount) =>
        updateRememberedSingleDirection({
          hitCount: storedHitCount(
            selectedSingleSkill,
            currentDirection,
            hitCount,
            resultModel.selectedResult?.automaticHitCountAdd,
          ),
        })
      }
      onAttackerHealthChange={(currentHp) =>
        updateSideHealth(
          activeDirection === "forward" ? "attacker" : "defender",
          currentHp,
        )
      }
      onAttackerHealthPercentChange={(currentHpPercent) =>
        updateSideHealthPercent(
          activeDirection === "forward" ? "attacker" : "defender",
          currentHpPercent,
        )
      }
      onDefenderHealthChange={(currentHp) =>
        updateSideHealth(
          activeDirection === "forward" ? "defender" : "attacker",
          currentHp,
        )
      }
      onDefenderHealthPercentChange={(currentHpPercent) =>
        updateSideHealthPercent(
          activeDirection === "forward" ? "defender" : "attacker",
          currentHpPercent,
        )
      }
      onPowerOverrideChange={(powerOverride) =>
        updateRememberedSingleDirection({
          overrides: { powerOverride },
        })
      }
      onSkillSelect={selectSingleSkill}
      onTraitContextChange={(key, value) => {
        updateTraitContext(activeDirection, key, value);
      }}
      result={resultModel.selectedResult}
      selectedSkill={selectedSingleSkill}
      skills={activeAttackSkills}
      negativeStatusEnabled={
        state.calculationOptions?.includeNegativeStatusSettlement === true
      }
      powerDisplayMode={powerDisplayMode}
      powerOverride={currentDirection.overrides.powerOverride ?? null}
      traitContext={currentDirection.context}
    />
  ) : null;

  const attackerTraitDamage = calculation.forward.traitResult
    ? {
        basePower: calculation.forward.traitResult.skillPower,
        hitCount: state.directions.forward.traitDamageHitCount ?? 1,
        name: calculation.forward.traitResult.skillName,
        result: calculation.forward.traitResult,
        typeLabel: calculation.forward.traitResult.typeLabel,
      }
    : null;
  const defenderTraitDamage = calculation.reverse.traitResult
    ? {
        basePower: calculation.reverse.traitResult.skillPower,
        hitCount: state.directions.reverse.traitDamageHitCount ?? 1,
        name: calculation.reverse.traitResult.skillName,
        result: calculation.reverse.traitResult,
        typeLabel: calculation.reverse.traitResult.typeLabel,
      }
    : null;
  const activeDamageSource =
    currentDirection.selectedDamageSource === "trait" &&
    calculation[activeDirection].traitResult
      ? "trait"
      : currentDirection.selectedDamageSource === "bloodline" &&
          calculation[activeDirection].bloodlineResult
        ? "bloodline"
        : "skill";

  const fourEditor = configurationReady ? (
    <FourSkillEditor
      activeDamageSource={activeDamageSource}
      activeSide={activeAttackSideKey}
      activeSkillIndex={currentDirection.selectedSkillIndex}
      attackerHealth={attackerHealth}
      attackerHitCount={state.directions.forward.hitCount}
      attackerLifestealPercent={
        state.directions.forward.overrides?.lifestealPercent ?? 0
      }
      attackerName={attacker.fullName}
      attackerResults={calculation.forward.results}
      attackerSkillChoices={attackerSkillChoices}
      attackerSkills={state.sides.attacker.skills.four.map((entry) =>
        getSkillSlotView(snapshot, entry),
      )}
      attackerSproutStacks={
        state.marks?.attacker?.positive?.id === "sprout"
          ? state.marks.attacker.positive.stacks
          : 0
      }
      attackerTrait={getTraitView(snapshot, attacker, "attacker")}
      attackerTraitContext={state.directions.forward.context}
      attackerTraitDamage={attackerTraitDamage}
      attackerDefenseTrait={
        hasFairPigeonBalance(defender)
          ? null
          : getTraitView(snapshot, defender, "defender")
      }
      defenderHitCount={state.directions.reverse.hitCount}
      defenderLifestealPercent={
        state.directions.reverse.overrides?.lifestealPercent ?? 0
      }
      defenderHealth={defenderHealth}
      defenderName={defender.fullName}
      defenderResults={calculation.reverse.results}
      defenderSkillChoices={defenderSkillChoices}
      defenderSkills={state.sides.defender.skills.four.map((entry) =>
        getSkillSlotView(snapshot, entry),
      )}
      defenderSproutStacks={
        state.marks?.defender?.positive?.id === "sprout"
          ? state.marks.defender.positive.stacks
          : 0
      }
      defenderTrait={getTraitView(snapshot, defender, "attacker")}
      defenderTraitContext={state.directions.reverse.context}
      defenderTraitDamage={defenderTraitDamage}
      defenderDefenseTrait={
        hasFairPigeonBalance(attacker)
          ? null
          : getTraitView(snapshot, attacker, "defender")
      }
      onHealthChange={updateSideHealth}
      onHealthPercentChange={updateSideHealthPercent}
      onTraitContextChange={(side, key, value) => {
        const direction = side === "attacker" ? "forward" : "reverse";
        updateTraitContext(direction, key, value);
      }}
      onSkillContextChange={(side, index, key, value) =>
        updateFourSkillEntry(side, index, {
          context: { [key]: value },
        })
      }
      onSkillActivate={activateFourSkill}
      onSkillFocus={(side, index) => {
        const direction = side === "attacker" ? "forward" : "reverse";
        setActiveDirection(direction);
        dispatch({
          direction,
          type: "direction/update",
          value: { selectedDamageSource: "skill", selectedSkillIndex: index },
        });
      }}
      onTraitDamageFocus={(side) => {
        const direction = side === "attacker" ? "forward" : "reverse";
        setActiveDirection(direction);
        dispatch({
          direction,
          type: "direction/update",
          value: { selectedDamageSource: "trait" },
        });
      }}
      onTraitDamageHitCountChange={(side, traitDamageHitCount) => {
        const direction = side === "attacker" ? "forward" : "reverse";
        dispatch({
          direction,
          type: "direction/update",
          value: { selectedDamageSource: "trait", traitDamageHitCount },
        });
      }}
      onSkillSelect={(side, index, skillId) =>
        commitSession(
          selectSessionFourSkill(stateRef.current, {
            index,
            side,
            skillId,
            snapshot,
          }),
        )
      }
      onSkillHitCountChange={(side, index, hitCount) => {
        const directionKey = side === "attacker" ? "forward" : "reverse";
        const direction = stateRef.current.directions[directionKey];
        const entry = stateRef.current.sides[side].skills.four[index];
        const automaticHitCountAdd =
          calculation?.[directionKey]?.results?.[index]?.automaticHitCountAdd;
        updateFourSkillEntry(side, index, {
          hitCount: storedHitCount(
            getSkill(snapshot, entry),
            direction,
            hitCount,
            automaticHitCountAdd,
          ),
        });
      }}
      onSkillPowerChange={(side, index, powerOverride) =>
        updateFourSkillEntry(side, index, {
          overrides: { powerOverride },
        })
      }
      onSkillPowerClear={(side, index) =>
        updateFourSkillEntry(side, index, {
          overrides: { powerOverride: null },
        })
      }
      negativeStatusEnabled={
        state.calculationOptions?.includeNegativeStatusSettlement === true
      }
      powerDisplayMode={powerDisplayMode}
    />
  ) : null;

  const compactSingleEditor = configurationReady ? (
    <CompactSingleSkillEditor
      attackName={activeAttackSpirit.fullName}
      defenseName={activeDefenseSpirit.fullName}
      onSkillSelect={selectSingleSkill}
      result={resultModel.selectedResult}
      selectedSkill={selectedSingleSkill}
      skills={activeAttackSkills}
    />
  ) : null;

  const compactFourEditor = configurationReady ? (
    <CompactFourSkillEditor
      activeDamageSource={activeDamageSource}
      activeSide={activeAttackSideKey}
      activeSkillIndex={currentDirection.selectedSkillIndex}
      attackerName={attacker.fullName}
      attackerResults={calculation.forward.results}
      attackerSkillChoices={attackerSkillChoices}
      attackerSkills={state.sides.attacker.skills.four.map((entry) =>
        getSkillSlotView(snapshot, entry),
      )}
      attackerSproutStacks={
        state.marks?.attacker?.positive?.id === "sprout"
          ? state.marks.attacker.positive.stacks
          : 0
      }
      attackerTraitDamage={attackerTraitDamage}
      defenderName={defender.fullName}
      defenderResults={calculation.reverse.results}
      defenderSkillChoices={defenderSkillChoices}
      defenderSkills={state.sides.defender.skills.four.map((entry) =>
        getSkillSlotView(snapshot, entry),
      )}
      defenderSproutStacks={
        state.marks?.defender?.positive?.id === "sprout"
          ? state.marks.defender.positive.stacks
          : 0
      }
      defenderTraitDamage={defenderTraitDamage}
      onSkillFocus={(side, index) => {
        const direction = side === "attacker" ? "forward" : "reverse";
        setActiveDirection(direction);
        dispatch({
          direction,
          type: "direction/update",
          value: { selectedDamageSource: "skill", selectedSkillIndex: index },
        });
      }}
      onSkillActivate={activateFourSkill}
      onTraitDamageFocus={(side) => {
        const direction = side === "attacker" ? "forward" : "reverse";
        setActiveDirection(direction);
        dispatch({
          direction,
          type: "direction/update",
          value: { selectedDamageSource: "trait" },
        });
      }}
      onTraitDamageHitCountChange={(side, traitDamageHitCount) => {
        const direction = side === "attacker" ? "forward" : "reverse";
        dispatch({
          direction,
          type: "direction/update",
          value: { selectedDamageSource: "trait", traitDamageHitCount },
        });
      }}
      onSkillSelect={(side, index, skillId) =>
        commitSession(
          selectSessionFourSkill(stateRef.current, {
            index,
            side,
            skillId,
            snapshot,
          }),
        )
      }
    />
  ) : null;

  const overlayProps = {
    menu: {
      actions: {
        onClose: () => setMenuOpen(false),
        onConfigLibraryExport: openConfigLibraryExport,
        onConfigLibraryImport: openConfigLibraryImport,
        onPopularConfigLibrary: openPopularConfigLibrary,
        onFirstRunGuide: () => {
          setFirstRunGuideError("");
          setFirstRunGuideStep(0);
          setFirstRunGuideOpen(true);
          setViewMode("compact");
        },
        onClearCurrent: () => {
          dispatch({
            type: "state/replace",
            value: {
              ...initialState,
              calculationOptions: {
                ...stateRef.current.calculationOptions,
              },
            },
          });
        },
        onCleanupConfigs: () => setCleanupConfigsOpen(true),
        onShare: openShareConfiguration,
        onShowDisplaySettings: () => setDisplaySettingsOpen(true),
        onShowDataSource: () => setDataSourceOpen(true),
      },
      buttonRef: menuButtonRef,
      open: menuOpen,
      ref: menuRef,
    },
    cleanupConfigs: {
      onCancel: () => setCleanupConfigsOpen(false),
      onConfirm: () => {
        const next = storedData.clearIncompleteSpiritConfigs();
        setCleanupConfigsOpen(false);
        setToast(
          `已清理未完成配置，保留 ${Object.keys(next.configs).length} 只完整配置`,
        );
      },
      open: cleanupConfigsOpen,
    },
    firstRunGuide: {
      error: firstRunGuideError,
      importCount: POPULAR_CONFIG_COUNT,
      importing: firstRunGuideImporting,
      layoutKey: `${configurationReady}:${viewMode}:${state.mode}`,
      onBack: () => setFirstRunGuideStep((current) => Math.max(0, current - 1)),
      onImport: importPopularConfigFromGuide,
      onNext: () => setFirstRunGuideStep((current) => Math.min(5, current + 1)),
      onOpenDetailed: () => setViewMode("detailed"),
      onSkip: finishFirstRunGuide,
      open: firstRunGuideOpen,
      ready: [
        Boolean(attacker),
        Boolean(defender),
        configurationReady,
        configurationReady,
        true,
        true,
      ][firstRunGuideStep],
      step: firstRunGuideStep,
    },
    configLibrary: {
      error: configLibraryError,
      exportSummary: configLibrarySummary,
      mode: configLibraryMode,
      onClose: closeConfigLibrary,
      onConfirmImport: () => {
        try {
          const result = storedData.importFavoriteConfigLibrary(
            configLibraryParsed,
          );
          closeConfigLibrary();
          setToast(
            `已导入 ${result.preview.added + result.preview.overwritten} 只配置，新增收藏 ${result.preview.favoritesAdded} 只，覆盖 ${result.preview.overwritten} 只，跳过 ${result.preview.missingSpirits + result.preview.invalidEntries} 只。`,
          );
        } catch (error) {
          setConfigLibraryError(
            error instanceof Error ? error.message : "配置库导入失败",
          );
        }
      },
      onExport: () => {
        saveConfigLibraryFile(configLibrarySummary.library)
          .then(() => {
            closeConfigLibrary();
            setToast(`已导出 ${configLibrarySummary.exportedCount} 只精灵`);
          })
          .catch((error) => setConfigLibraryError(
            error instanceof Error ? error.message : "配置库导出失败",
          ));
      },
      onFile: previewConfigLibraryFile,
      parsed: configLibraryParsed,
      snapshot,
    },
    dataSource: {
      onClose: () => setDataSourceOpen(false),
      onCopyFeedback: async () => {
        if (!globalThis.navigator?.clipboard?.writeText) {
          setToast(`反馈 QQ：${FEEDBACK_QQ}`);
          return;
        }
        try {
          await globalThis.navigator.clipboard.writeText(FEEDBACK_QQ);
          setToast("反馈 QQ 已复制");
        } catch {
          setToast(`反馈 QQ：${FEEDBACK_QQ}`);
        }
      },
      open: dataSourceOpen,
    },
    displaySettings: {
      negativeStatusSettlementEnabled:
        state.calculationOptions?.includeNegativeStatusSettlement === true,
      onClose: () => setDisplaySettingsOpen(false),
      onNegativeStatusSettlementChange: (enabled) => {
        const value = writeNegativeStatusSettlementSetting(undefined, enabled);
        dispatch({
          type: "calculation-option/set-negative-status",
          value,
        });
      },
      onPowerDisplayModeChange: (mode) => {
        setPowerDisplayMode(writePowerDisplayMode(undefined, mode));
      },
      onTypeCoverageChange: (enabled) => {
        setTypeCoverageEnabled(writeTypeCoverageSetting(undefined, enabled));
      },
      open: displaySettingsOpen,
      powerDisplayMode,
      typeCoverageEnabled,
    },
    mobileResult: {
      actions: {
        onClose: () => setMobileResultOpen(false),
        onCurrentHpChange: (currentHp) => updateDirection({ currentHp }),
        onCurrentHpPercentChange: (currentHpPercent) =>
          updateDirection({ context: { currentHpPercent } }),
        onDirectionToggle: () => setActiveDirection(toggleDirection),
        onOpen: () => setMobileResultOpen(true),
      },
      configurationReady,
      open: mobileResultOpen,
      refs: {
        close: drawerCloseRef,
        drawer: resultDrawerRef,
        trigger: mobileResultTriggerRef,
      },
      result: resultModel,
      showTypeCoverage: typeCoverageEnabled,
      viewMode,
    },
    share: {
      actions: {
        onCloseAll: () => {
          setPendingSharedState(null);
          setShareOpen(false);
        },
        onClose: () => setShareOpen(false),
        onCopy: copyShareLink,
        onImportDraftChange: setImportDraft,
        onImportSubmit: (event) => {
          event.preventDefault();
          const sharedValue = importDraft.trim();
          if (!sharedValue) return;
          loadSharedState(sharedValue)
            .then(() => {
              setShareOpen(false);
              setImportDraft("");
            })
            .catch((error) =>
              setToast(error instanceof Error ? error.message : "导入失败"),
            );
        },
        onPendingClose: () => setPendingSharedState(null),
        onPendingConfirm: () => {
          applySharedConfiguration(
            migrateSharedConfiguration(
              pendingSharedState,
              initialState.versions,
              snapshot,
            ),
          );
          setPendingSharedState(null);
          globalThis.history?.replaceState?.(
            null,
            "",
            `${globalThis.location.pathname}${globalThis.location.search}`,
          );
          setToast("已按当前版本重算，请核对右侧结果");
        },
      },
      importDraft,
      open: shareOpen,
      pendingState: pendingSharedState,
      refs: {
        dialog: shareDialogRef,
        version: versionDialogRef,
      },
      shareLink,
      versions: initialState.versions,
    },
    team: {
      drawerProps: {
        getSpiritConfiguration: storedData.getSpiritConfiguration,
        onActiveTeamChange: teamActions.setActive,
        onApply: (side, member) => {
          applySpiritConfiguration(side, member, {
            remember: false,
            source: "team",
          });
          setTeamOpen(false);
          const spirit = snapshot.spirits.find(
            (candidate) => candidate.id === member.spiritId,
          );
          setToast(
            `已载入${side === "attacker" ? "攻击方" : "防御方"} ${
              spirit?.fullName ?? "队伍成员"
            }`,
          );
        },
        onCaptureSide: (side, teamId, index) =>
          teamActions.captureSide(side, teamId, index, state.sides[side]),
        onClose: () => setTeamOpen(false),
        onCreateTeam: teamActions.create,
        onDeleteTeam: teamActions.remove,
        onDuplicateTeam: teamActions.duplicate,
        onMemberChange: teamActions.updateMember,
        onRenameTeam: teamActions.rename,
        returnFocusRef: teamsButtonRef,
        snapshot,
        teamsState,
      },
      open: teamOpen,
    },
    toast: { message: toast, onExpire: () => setToast("") },
  };

  return (
    <>
      <AppHeader
        dataVersion={`${snapshot.meta.seasonId ?? "S3季中"} · ${snapshot.meta.bwikiRevision ?? snapshot.meta.snapshotVersion}`}
        menuButtonRef={menuButtonRef}
        menuOpen={menuOpen}
        onMenuOpen={() => setMenuOpen((open) => !open)}
        onTeamsOpen={() => {
          setMenuOpen(false);
          setTeamOpen(true);
        }}
        onThemeChange={(theme) => {
          document.documentElement.dataset.theme = theme;
        }}
        teamsButtonRef={teamsButtonRef}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
      />
      <WorkspaceOverlays {...overlayProps}>
      <div className={`calculator-layout calculator-layout--${viewMode}`}>
        <main className="calculator-main">
          <SpiritStep
            attacker={attacker}
            attackerFavoriteState={
              favoriteSpiritIds.has(attacker?.id)
                ? "manual"
                : completeSpiritIds.has(attacker?.id)
                  ? "complete"
                  : null
            }
            defender={defender}
            defenderFavoriteState={
              favoriteSpiritIds.has(defender?.id)
                ? "manual"
                : completeSpiritIds.has(defender?.id)
                  ? "complete"
                  : null
            }
            onAttackerFavoriteToggle={() => toggleSpiritFavorite(attacker)}
            onAttackerSelect={(value) => changeSpirit("attacker", value)}
            onDefenderFavoriteToggle={() => toggleSpiritFavorite(defender)}
            onDefenderSelect={(value) => changeSpirit("defender", value)}
            onSwap={() => {
              dispatch({ type: "sides/swap" });
              setActiveDirection("forward");
            }}
            spirits={selectableSpirits}
          />
          {configurationReady && viewMode === "compact" ? (
            <section
              aria-label="即时配置"
              className="compact-workspace calculator-step"
            >
              <div
                className="compact-adjustment-grid"
                data-guide-target="quick-settings"
              >
                {["attacker", "defender"].map((side) => {
                  const label = side === "attacker" ? "攻击方" : "防御方";
                  return (
                    <div className="compact-adjustment-side" key={side}>
                      <QuickNaturePicker
                        displayIvs={state.sides[side].displayIvs}
                        label={label}
                        onChange={(value) =>
                          dispatch({
                            side,
                            type: "side/set-nature",
                            value,
                          })
                        }
                        side={side}
                        value={state.sides[side].nature}
                      />
                      <QuickIvPicker
                        label={label}
                        onChange={(stat, value) =>
                          dispatch({
                            side,
                            stat,
                            type: "side/set-iv",
                            value,
                          })
                        }
                        side={side}
                        values={state.sides[side].displayIvs}
                      />
                    </div>
                  );
                })}
              </div>
              <SkillStep
                activeMode={state.mode}
                compact
                fourSkillContent={compactFourEditor}
                onModeChange={setSkillMode}
                singleSkillContent={compactSingleEditor}
              />
            </section>
          ) : null}
          {configurationReady && viewMode === "detailed" ? (
            <>
              <NatureStatsStep
            attacker={{
              id: attacker.id,
              levels: fairPigeonPresent
                ? [
                    {
                      label: "攻击能力等级",
                      multiplier: stageMultiplier(
                        state.directions.forward.overrides.attackLevelStage ?? 0,
                      ),
                      role: "attack",
                      stage:
                        state.directions.forward.overrides.attackLevelStage ?? 0,
                    },
                    {
                      label: "防御能力等级",
                      multiplier: stageMultiplier(
                        state.directions.reverse.overrides.defenseLevelStage ?? 0,
                      ),
                      role: "defense",
                      stage:
                        state.directions.reverse.overrides.defenseLevelStage ?? 0,
                    },
                  ]
                : undefined,
              level:
                activeDirection === "forward"
                  ? {
                      label: "攻击能力等级",
                      multiplier: stageMultiplier(attackLevelStage),
                      role: "attack",
                      stage: attackLevelStage,
                    }
                  : {
                      label: "防御能力等级",
                      multiplier: stageMultiplier(defenseLevelStage),
                      role: "defense",
                      stage: defenseLevelStage,
                    },
              nature: state.sides.attacker.nature,
              stats: getPanelView(attacker, state.sides.attacker, {
                attack:
                  state.directions.forward.overrides.attackLevelStage ?? 0,
                defense:
                  state.directions.reverse.overrides.defenseLevelStage ?? 0,
                speedFlat:
                  state.directions.forward.overrides.attackerSpeedFlat ?? 0,
                finalStats: viewModel.sides.attacker.finalPanelStats,
              }),
            }}
            defender={{
              id: defender.id,
              levels: fairPigeonPresent
                ? [
                    {
                      label: "攻击能力等级",
                      multiplier: stageMultiplier(
                        state.directions.reverse.overrides.attackLevelStage ?? 0,
                      ),
                      role: "attack",
                      stage:
                        state.directions.reverse.overrides.attackLevelStage ?? 0,
                    },
                    {
                      label: "防御能力等级",
                      multiplier: stageMultiplier(
                        state.directions.forward.overrides.defenseLevelStage ?? 0,
                      ),
                      role: "defense",
                      stage:
                        state.directions.forward.overrides.defenseLevelStage ?? 0,
                    },
                  ]
                : undefined,
              level:
                activeDirection === "forward"
                  ? {
                      label: "防御能力等级",
                      multiplier: stageMultiplier(defenseLevelStage),
                      role: "defense",
                      stage: defenseLevelStage,
                    }
                  : {
                      label: "攻击能力等级",
                      multiplier: stageMultiplier(attackLevelStage),
                      role: "attack",
                      stage: attackLevelStage,
                    },
              nature: state.sides.defender.nature,
              stats: getPanelView(defender, state.sides.defender, {
                attack:
                  state.directions.reverse.overrides.attackLevelStage ?? 0,
                defense:
                  state.directions.forward.overrides.defenseLevelStage ?? 0,
                speedFlat:
                  state.directions.reverse.overrides.attackerSpeedFlat ?? 0,
                finalStats: viewModel.sides.defender.finalPanelStats,
              }),
            }}
            onAttackerIvChange={(stat, value) =>
              dispatch({
                side: "attacker",
                stat,
                type: "side/set-iv",
                value,
              })
            }
            onAttackerNatureChange={(value) =>
              dispatch({ side: "attacker", type: "side/set-nature", value })
            }
            onAttackerLevelChange={fairPigeonPresent
              ? (role, stage) =>
                  updateSideAbilityLevel("attacker", role, stage)
              : (stage) =>
                  updatePowerLevel(
                    activeDirection === "forward" ? "attack" : "defense",
                    stage,
                  )}
            onDefenderIvChange={(stat, value) =>
              dispatch({
                side: "defender",
                stat,
                type: "side/set-iv",
                value,
              })
            }
            onDefenderNatureChange={(value) =>
              dispatch({ side: "defender", type: "side/set-nature", value })
            }
            onDefenderLevelChange={fairPigeonPresent
              ? (role, stage) =>
                  updateSideAbilityLevel("defender", role, stage)
              : (stage) =>
                  updatePowerLevel(
                    activeDirection === "forward" ? "defense" : "attack",
                    stage,
                  )}
              />
              <SkillStep
                activeMode={state.mode}
                fourSkillContent={fourEditor}
                onModeChange={setSkillMode}
                singleSkillContent={singleEditor}
              />
              <AdvancedOptions
                bloodlineMagicId={
                  currentDirection.context?.bloodlineMagicId ?? "none"
                }
                bloodlineMagicTriggered={
                  currentDirection.context?.bloodlineMagicTriggered === true
                }
                finalMultiplier={currentDirection.finalDamageMultiplier}
                marks={state.marks}
                negativeStatusEnabled={
                  state.calculationOptions?.includeNegativeStatusSettlement === true
                }
                negativeStatuses={state.negativeStatuses}
                onBloodlineMagicChange={(bloodlineMagicId, triggered) =>
                  updateDirection({
                    ...(!triggered &&
                    currentDirection.selectedDamageSource === "bloodline"
                      ? { selectedDamageSource: "skill" }
                      : {}),
                    context: {
                      bloodlineMagicId,
                      bloodlineMagicTriggered: triggered,
                    },
                  })
                }
                onFinalMultiplierChange={(finalDamageMultiplier) =>
                  updateDirection({ finalDamageMultiplier })
                }
                onMarkChange={(side, polarity, value) =>
                  dispatch({
                    polarity,
                    side,
                    type: "mark/update",
                    value,
                  })
                }
                onNegativeStatusChange={(side, key, value) =>
                  dispatch({
                    key,
                    side,
                    type: "negative-status/update",
                    value,
                  })
                }
                onRainTurnsChange={updateWeatherRainTurns}
                onWeatherChange={updateWeather}
                onReductionChange={(percent) =>
                  dispatch({
                    direction: reductionDirectionKey,
                    type: "direction/set-reduction",
                    value: Math.max(0, 1 - percent / 100),
                  })
                }
                rainTurns={weatherRainTurns}
                weather={
                  currentDirection.context?.weatherThunder === true
                    ? "thunder"
                    : weatherRainTurns > 0
                      ? "rain"
                      : "none"
                }
                reductionPercent={Math.round(
                  (1 - reductionDirection.reduction) * 100,
                )}
                result={resultModel.selectedResult}
              />
            </>
          ) : null}
        </main>

        {configurationReady ? (
          <div className="result-column">
            <ResultRail
              onBloodlineResultFocus={() =>
                updateDirection({ selectedDamageSource: "bloodline" })
              }
              onCurrentHpChange={(currentHp) => updateDirection({ currentHp })}
              onCurrentHpPercentChange={(currentHpPercent) =>
                updateDirection({ context: { currentHpPercent } })
              }
              onDirectionToggle={() =>
                setActiveDirection(toggleDirection)
              }
              result={resultModel}
              showTypeCoverage={typeCoverageEnabled}
            />
          </div>
        ) : null}
      </div>

      </WorkspaceOverlays>
      <FloatingUndoButton count={undoCount} onUndo={undoLastChange} />
    </>
  );
}

export function App({ initialSnapshot = null }) {
  const [snapshot, setSnapshot] = useState(() =>
    initialSnapshot ? withCalculatorExtras(initialSnapshot) : null,
  );
  const [error, setError] = useState("");

  useEffect(() => {
    if (initialSnapshot) return undefined;
    const controller = new AbortController();
    let active = true;

    fetch("/data/runtime.json", { signal: controller.signal })
      .then(async (snapshotResponse) => {
        if (!snapshotResponse.ok) {
          throw new Error(`数据加载失败：${snapshotResponse.status}`);
        }
        const loadedSnapshot = await snapshotResponse.json();
        return withCalculatorExtras(loadedSnapshot);
      })
      .then((loadedSnapshot) => {
        if (active) setSnapshot(loadedSnapshot);
      })
      .catch((loadError) => {
        if (active && loadError.name !== "AbortError") {
          setError(loadError.message);
        }
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [initialSnapshot]);

  if (!snapshot) {
    return (
      <div className="app">
        <AppHeader dataVersion="加载中" />
        <main className="loading-state">
          <p>{error || "正在加载 S3季中数据…"}</p>
        </main>
      </div>
    );
  }

  return (
    <div className="app">
      <CalculatorWorkspace key={snapshot.meta.id} snapshot={snapshot} />
    </div>
  );
}
