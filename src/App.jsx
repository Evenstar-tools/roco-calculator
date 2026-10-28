import { applyS5PreviewStatTurnEnd, updateS5PreviewTurnEndCounter } from "./features/s5-preview/turn-end.js";
import { getS5PreviewTraitInputs } from "./domain/s5-preview-traits.js";
import { canonicalTraitControlKey } from "./domain/trait-runtime.js";
import { applyS5EnergyUse, prepareS5EnergyUse } from "./features/s5-preview/energy-use.js";
import { applyS5DiscountUse, prepareS5DiscountUse } from "./features/s5-preview/cost-discount-use.js";
import { loadServerSnapshot } from "./runtime/load-snapshot.js";
import { previewRoute } from "./runtime/preview-channel.js";
import { useRuntime } from "./runtime/RuntimeContext.jsx";
import { UNVERIFIED_GLOBAL_SNAPSHOT } from "./runtime/unverified-snapshot.js";
import { useLocale } from "./i18n/LocaleContext.jsx";
import { localizeGlobalSpirit } from "./runtime/global-entity-localization.js";
import { useCalculatorLocale } from "./i18n/calculator-text.js";
import { createGlobalSessionStore } from "./runtime/global-session-migration.js";
import { createCalculatorSessionStore } from "./runtime/workspace-store.js";
import { storageError } from "./state/server-storage.js";
import { useFeatureMetrics } from "./analytics/use-feature-metrics.js";
import { calculatorResultKind, useCalculationMetrics, useLineupMetrics } from "./analytics/use-completion-metrics.js";
import { recordRefractionUsage } from "./domain/refraction.js";
import { expireTransientGainSources, recordGainChanges } from "./domain/gain-provenance.js";
import { recordSkillActivation } from "./domain/skill-gain-summary.js";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { AdvancedOptions } from "./components/AdvancedOptions.jsx";
import { AppHeader } from "./components/AppHeader.jsx";
import { EmptyStateGuide } from "./components/EmptyStateGuide.jsx";
import {
  CompactFourSkillEditor,
  CompactSingleSkillEditor,
} from "./components/CompactSkillEditor.jsx";
import { FourSkillEditor } from "./components/FourSkillEditor.jsx";
import { FloatingUndoButton } from "./components/FloatingUndoButton.jsx";
import { NatureStatsStep } from "./components/NatureStatsStep.jsx";
import { MoonMemoryTraitEditor } from "./components/MoonMemoryTraitEditor.jsx";
import { hasNativeMoonMemoryTrait } from "./domain/moon-memory-trait-options.js";
import { QuickNaturePicker } from "./components/QuickNaturePicker.jsx";
import { QuickIvPicker } from "./components/QuickIvPicker.jsx";
import { ResultRail } from "./components/ResultRail.jsx";
import { dynamicInputsForSkill, isDynamicInputVisible, mergeDynamicInputs, SingleSkillEditor, TraitInputs } from "./components/SingleSkillEditor.jsx";
import { TraitHint } from "./components/TraitHint.jsx";
import { S5PreviewTraitSummary } from "./components/S5PreviewTraitSummary.jsx";
import { CompactConditionDialog, CompactConditionTrigger } from "./components/CompactConditions.jsx";
import { getSkillSlotConditions } from "./components/skill-condition-inputs.js";
import { SkillStep } from "./components/SkillStep.jsx";
import { SpiritStep } from "./components/SpiritStep.jsx";
import { PresetBrowseProvider } from "./components/PresetBrowseMode.jsx";
import { WorkspaceOverlays } from "./components/WorkspaceOverlays.jsx";
import { useBalanceComparison } from "./features/balance-comparison/useBalanceComparison.js";
import { SpiritComparisonControls, SpiritPreviousStatsAction, SpiritTrialChanges } from "./features/balance-comparison/SpiritComparisonControls.jsx";
import {
  readNegativeStatusSettlementSetting,
  readThemeSetting,
  writeThemeSetting,
  readViewModeSetting,
  writeViewModeSetting,
} from "./state/display-settings.js";
import {
  clampStage,
  getPanelView,
  getAppliedWeatherLabel,
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
import { getBloodlineMagicOption } from "./domain/bloodline-magic.js";
import { advancePressureValveContext, resolveSkillStatusActivation } from "./domain/skill-status-effects.js";
import { linkedNegativeStatusContext, negativeStatusInputUpdate } from "./domain/negative-status-context.js";
import {
  hasNegativeStatusSkillApplication,
} from "./domain/negative-status-rules.js";
import { applyBattleActivation, canApplyBattleActivation, canToggleNegativeStatusActivation, getSkillActivationContextSignature, matchesSkillActivationContext } from "./state/battle-activation.js";
import {
  getEditableHitCountInput,
  getSkillEffectInputs,
  hasDeclaredHitCount,
} from "./domain/skill-effects.js";
import {
  copyPositiveAbilityStages,
  hasFairPigeonBalance,
} from "./domain/fair-pigeon.js";
import { getNatureMultipliers } from "./domain/natures.js";
import { starfallStacksFromMarkSlot } from "./domain/marks.js";
import { isEnemyStarfallTraitControl, linkStarfallTraitControls, linkEnemyCostTraitControls } from "./domain/trait-runtime.js";
import { carriedSkillTotalCost } from "./domain/skill-result/loadout.js";
import { getSnapshotIndexes } from "./domain/snapshot-indexes.js";
import { calculateAllPanelStats } from "./domain/stat.js";
import { resolveS5PreviewBattleLevel } from "./domain/battle-level.js";
import { getEffectiveTraits } from "./domain/effective-traits.js";
import { getBattleFormChoices } from "./domain/battle-form.js";
import { createSpiritSearchIndex } from "./data/search-index.js";
import { withWebPreview } from "./features/s5-preview/with-web-preview.js";
import { applyS5PreviewDreamTurnEnd, synchronizeS5PreviewSkillUse, synchronizeS5PreviewConfirmationFromUse } from "./features/s5-preview/settlement.js";
import { currentWeather } from "./state/weather.js";
import { useStoredCalculatorData } from "./hooks/useStoredCalculatorData.js";
import { useCalculatorSession } from "./hooks/useCalculatorSession.js";
import { useCalculatorShortcuts } from "./hooks/useCalculatorShortcuts.js";
import { readShortcutSettings, writeShortcutSettings } from "./state/shortcut-settings.js";
import { getFormConfigPreferences } from "./state/form-config-preferences.js";
import { ShortcutDialog } from "./components/ShortcutDialog.jsx";
import {
  POPULAR_CONFIG_COUNT,
  useConfigLibraryFlow,
} from "./hooks/useConfigLibraryFlow.js";
import { useFirstRunGuide } from "./hooks/useFirstRunGuide.js";
import { useShareFlow } from "./hooks/useShareFlow.js";
import { useWorkspaceOverlays } from "./hooks/useWorkspaceOverlays.js";
import {
  applyConfiguration as applySessionConfiguration,
  assertSnapshotReferences,
  abilityLevelMultiplier,
  createProductInitialState,
  getRestorableDefaultSkills,
  restoreDefaultSkills,
  patchFourSkill,
  projectBattleLevelHealth,
  reduceSessionAction,
  rememberSingleSkill as rememberSessionSingleSkill,
  selectFourSkill as selectSessionFourSkill,
  selectSingleSkill as selectSessionSingleSkill,
  selectSpirit,
  switchBattleForm,
  toggleDirection,
  updateGlobalWeather,
  updateMirroredTraitContext,
} from "./state/calculator-session.js";
import { createTeamMemberFromSide } from "./state/team-presets.js";
import { FEATURED_USER_RELEASE } from "./data/user-release-notes.js";
import { captureDamageComparison, damageComparisonSourceKey, importDamageComparisonCandidate } from "./state/damage-comparison.js";
import { DAMAGE_COMPARISON_IMPORT_NOTICE } from "./domain/skill-damage-ranking.js";

const loadSkillQueryPanel = () => import("./features/skill-query/SkillQueryPanel.jsx");
const SkillQueryPanel = lazy(loadSkillQueryPanel);
const TransmissionPanel = lazy(() => import("./features/transmission/TransmissionPanel.jsx"));
const TypeQueryPanel = lazy(() => import("./features/type-query/TypeQueryPanel.jsx"));
const TypeChartPanel = lazy(() => import("./features/type-query/TypeChartPanel.jsx"));
const RankingsPanel = lazy(() => import("./components/RankingsPanel.jsx"));
const DamageComparisonDialog = lazy(() => import("./components/DamageComparisonDialog.jsx"));
const StarfallThresholdDialog = lazy(() => import("./components/StarfallThresholdDialog.jsx"));
const DeerPage = lazy(() => import("./features/deer/DeerPage.jsx"));
const preloadSkillQuery = (serverId) => {
  void loadSkillQueryPanel().catch(() => {});
  void import("./features/skill-query/load-catalog.js").then(({ loadSkillCatalog }) => loadSkillCatalog(serverId)).catch(() => {});
};

function CalculatorWorkspace({ snapshot, initialWorkspace, onOpenDeer, onOpenGlobal, active }) {
  const { serverId, release } = useRuntime();
  const { t, locale } = useLocale();
  const { tc } = useCalculatorLocale();
  const spiritName = spirit => spirit ? (serverId === "global" ? localizeGlobalSpirit(spirit, locale).fullName : spirit.fullName) : "";
  const formPreferences = getFormConfigPreferences(serverId);
  const [shortcutSettings, setShortcutSettings] = useState(() => readShortcutSettings(serverId));
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  useEffect(() => { writeShortcutSettings(shortcutSettings, serverId); }, [shortcutSettings, serverId]);
  const [deerOpen, setDeerOpen] = useState(false);
  const [skillQueryOpen, setSkillQueryOpen] = useState(false);
  const [transmissionOpen, setTransmissionOpen] = useState(false);
  const [typeQueryOpen, setTypeQueryOpen] = useState(false);
  const [queryTypes, setQueryTypes] = useState([]);
  const [rankingKind, setRankingKind] = useState(null);
  const [comparisonSource, setComparisonSource] = useState(null);
  const [starfallSource, setStarfallSource] = useState(null);
  const [comparisonPreferences, setComparisonPreferences] = useState(null);
  const [rankingsVisited, setRankingsVisited] = useState(false);
  const initialState = useMemo(() => {
    if (initialWorkspace?.state) return structuredClone(initialWorkspace.state);
    const next = createProductInitialState(snapshot);
    if (serverId === "global" && !release.capabilities.calculate) {
      // 尚无计算规则的目录保留空配置。
      for (const side of Object.values(next.sides)) {
        side.nature = null;
        side.displayIvs = Object.fromEntries(Object.keys(side.displayIvs).map((stat) => [stat, null]));
      }
    }
    return {
      ...next,
      calculationOptions: {
        ...next.calculationOptions,
        includeNegativeStatusSettlement:
          readNegativeStatusSettlementSetting(undefined, serverId),
      },
    };
  }, [snapshot, initialWorkspace, serverId, release.capabilities.calculate]);
  const [toast, setToast] = useState("");
  const [activeDirection, setActiveDirection] = useState(initialWorkspace?.activeDirection ?? "forward");
  const [conditionTarget, setConditionTarget] = useState(null);
  const [advancedOptionsOpen, setAdvancedOptionsOpen] = useState(initialWorkspace?.advancedOptionsOpen ?? false);
  const [advancedOptionsTopRequest, setAdvancedOptionsTopRequest] = useState(null);
  const nextAdvancedOptionsTopRequestRef = useRef(0);
  const [savedViewMode, setViewMode] = useState(() => initialWorkspace?.viewMode ?? readViewModeSetting(serverId));
  const [previewViewMode, setPreviewViewMode] = useState(null);
  const viewMode = previewViewMode ?? savedViewMode;
  useEffect(() => { writeViewModeSetting(savedViewMode, serverId); }, [savedViewMode, serverId]);
  const storedData = useStoredCalculatorData(snapshot, { onToast: setToast, serverId });
  const sessionStore = useMemo(() => {
    try {
      const createStore = serverId === "global" && snapshot.meta?.id ? createGlobalSessionStore : createCalculatorSessionStore;
      return createStore({ serverId, initialState, validateState: (value) => {
        if (value.schemaVersion !== initialState.schemaVersion ||
            value.versions?.data !== initialState.versions.data || value.versions?.rules !== initialState.versions.rules ||
            !["single", "four"].includes(value.mode) ||
            !value.sides?.attacker || !value.sides?.defender || !value.directions?.forward || !value.directions?.reverse) {
          throw storageError("INCOMPATIBLE_SERVER_VERSION", "工作会话与当前数据版本不兼容；原记录已保留");
        }
        for (const side of Object.values(value.sides)) {
          if (!side.skills || !Array.isArray(side.skills.four) || (typeof side.nature !== "string" && !(serverId === "global" && side.nature === null)) ||
              !side.displayIvs || typeof side.displayIvs !== "object") throw new TypeError("工作会话技能结构无效");
          if (serverId === "cn" && side.spiritId !== null) assertSnapshotReferences({ sides: { side } }, snapshot);
        }
      } });
    } catch (error) {
      return { loadSession: () => { throw error; }, saveSession: () => { throw error; } };
    }
  }, [initialState, snapshot, serverId]);
  useEffect(() => {
    const warn = (event) => { if (active && event.detail?.serverId === serverId) setToast(t("设置未能保存；当前标签的修改仍保留")); };
    window.addEventListener("roco-storage-error", warn);
    return () => window.removeEventListener("roco-storage-error", warn);
  }, [active, serverId, t]);
  const {
    completeSpiritIds,
    favoriteSpiritIds,
    teams: teamActions,
    teamsState,
    toggleSpiritFavorite,
  } = storedData;
  const {
    beginDiscreteAction,
    commitSession,
    dispatch,
    state,
    stateRef,
    undoCount,
    hasRestoredSession,
    undoLastChange,
    redoCount,
    redoLastChange,
  } = useCalculatorSession({
    serverId,
    initialState,
    sessionStore,
    restoreSession: !initialWorkspace?.state,
    onRememberSide: storedData.rememberSide,
    onToast: setToast,
    onCommit: (next, previous, userInitiated) => recordCalculationInput(next, previous, userInitiated),
  });

  useEffect(() => {
    // 存储告警由初始化读取产生，只能在挂载后转成界面提示。
    if (teamsState.warning) setToast(teamsState.warning);
  }, [teamsState.warning]);

  // 启动时恢复持久化的主题选择,与 AppHeader 的初始开关状态保持一致。
  useEffect(() => {
    document.documentElement.dataset.theme = readThemeSetting();
  }, []);

  const spiritIndex = useMemo(
    () => createSpiritSearchIndex(snapshot.spirits),
    [snapshot.spirits],
  );
  const balance = useBalanceComparison({ activeDirection, serverId, completeSpiritIds,
    favoriteSpiritIds, snapshot, spiritIndex, state });
  const viewModel = balance.afterView;
  const { calculation, configurationReady, configurationEditable, currentDirection } = viewModel;
  const placeholder = serverId === "global" && Boolean(snapshot.meta?.placeholderSource);
  const { attacker: attackerView, defender: defenderView } = viewModel.sides;
  const attacker = attackerView.spirit;
  const defender = defenderView.spirit;
  const attackerTraits = !release.capabilities.calculate ? [] : getEffectiveTraits(snapshot, {
    ...state.sides.attacker,
    spirit: attacker,
  });
  const defenderTraits = !release.capabilities.calculate ? [] : getEffectiveTraits(snapshot, {
    ...state.sides.defender,
    spirit: defender,
  });
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
  const resultModel = useMemo(() => ({ ...viewModel.result, levelComparison: balance.levelComparison }),
    [viewModel.result, balance.levelComparison]);
  const recordCalculationInput = useCalculationMetrics({ feature: "calculator", input: state, active,
    resultKind: calculatorResultKind(configurationReady, resultModel?.selectedResult) });
  const recordLineupApply = useLineupMetrics(state, active);
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
  } = viewModel.environment;
  const activeWeatherRainTurns = Math.min(
    8,
    Math.max(
      0,
      Math.floor(Number(currentDirection.context?.weatherRainTurns) || 0),
    ),
  );
  const activeWeather = currentWeather(currentDirection.context);
  const activeReductionPercent = Math.round(
    (1 - reductionDirection.reduction) * 100,
  );
  const activeFinalMultiplier = Number.isFinite(
    Number(currentDirection.finalDamageMultiplier),
  )
    ? Number(currentDirection.finalDamageMultiplier)
    : 1;
  const activeBloodlineMagic = getBloodlineMagicOption(
    currentDirection.context?.bloodlineMagicId,
  );
  const activeAdvancedConditions = [
    getAppliedWeatherLabel(activeWeather, resultModel?.selectedResult),
    activeReductionPercent > 0 ? `减伤 ${activeReductionPercent}%` : null,
    activeFinalMultiplier !== 1
      ? `最终倍率 ×${Number(activeFinalMultiplier.toFixed(4))}`
      : null,
    currentDirection.context?.bloodlineMagicTriggered === true &&
    activeBloodlineMagic.id !== "none" &&
    activeBloodlineMagic.implemented
      ? `血脉 ${activeBloodlineMagic.name}`
      : null,
  ].filter(Boolean);

  function targetStarfallStacksForSide(side, currentState = state) {
    const targetSide = side === "attacker" ? "defender" : "attacker";
    return starfallStacksFromMarkSlot(
      currentState.marks?.[targetSide]?.negative,
    );
  }

  function linkedStarfallTraitContext(side, context) {
    const opponent = side === "attacker" ? "defender" : "attacker";
    let linked = context;
    for (const [owner, role] of [[side, "attacker"], [opponent, "defender"]]) {
      const spirit = owner === "attacker" ? attacker : defender;
      if (!spirit) continue;
      linked = linkStarfallTraitControls(linked, getTraitView(snapshot, spirit, role)?.inputs ?? [], targetStarfallStacksForSide(owner));
      const target = owner === "attacker" ? "defender" : "attacker";
      linked = linkEnemyCostTraitControls(linked, getTraitView(snapshot, spirit, role)?.inputs ?? [], carriedSkillTotalCost(state.sides[target], state.mode, getSnapshotIndexes(snapshot).skills, state.directions[target === "attacker" ? "forward" : "reverse"].overrides));
    }
    return linked;
  }

  function updateTargetStarfallStacks(side, value) {
    const targetSide = side === "attacker" ? "defender" : "attacker";
    dispatch({
      polarity: "negative",
      side: targetSide,
      type: "mark/update",
      value: {
        id: "starfall",
        stacks: Math.min(99, Math.max(0, Math.floor(Number(value) || 0))),
      },
    });
  }

  function enemyStarfallInputId(skill) {
    return getSkillEffectInputs(skill).find(
      (input) => input.contextKey === "enemyStarfallMarks",
    )?.id;
  }

  function isEnemyStarfallInput(skill, key) {
    return key === "enemyStarfallMarks" || key === enemyStarfallInputId(skill);
  }

  function linkedEnemyStarfallContext(skill, context, stacks) {
    const inputId = enemyStarfallInputId(skill);
    return {
      ...(context ?? {}),
      enemyStarfallMarks: stacks,
      ...(inputId ? { [inputId]: stacks } : {}),
    };
  }

  function chargeStacksForSide(side, currentState = state) {
    const positiveMark = currentState.marks?.[side]?.positive;
    return positiveMark?.id === "charge"
      ? Math.min(99, Math.max(0, Math.floor(Number(positiveMark.stacks) || 0)))
      : 0;
  }

  function updateChargeBurstSource(side, active) {
    const currentMark = stateRef.current.marks?.[side]?.positive;
    if (!active && currentMark?.id !== "charge") return;
    dispatch({
      polarity: "positive",
      side,
      type: "mark/update",
      value: active
        ? {
            id: "charge",
            stacks: currentMark?.id === "charge"
              ? Math.max(1, Math.floor(Number(currentMark.stacks) || 0))
              : 1,
          }
        : { id: null, stacks: 0 },
    });
  }

  function chargeBurstSourceInputId(skill) {
    return getSkillEffectInputs(skill).find(
      (input) => input.contextKey === "burstSourceChargeMark",
    )?.id;
  }

  function isChargeBurstSourceInput(skill, key) {
    return key === "burstSourceChargeMark" || key === chargeBurstSourceInputId(skill);
  }

  function linkedChargeBurstSourceContext(skill, context, stacks) {
    const inputId = chargeBurstSourceInputId(skill);
    if (!inputId) return context ?? {};
    const active = stacks > 0;
    return {
      ...(context ?? {}),
      burstSourceChargeMark: active,
      [inputId]: active,
    };
  }

  function linkedSkillContext(side, skill, context) {
    let starfallLinked = skill?.name === "多维击打"
      ? linkedEnemyStarfallContext(
          skill,
          context,
          targetStarfallStacksForSide(side),
        )
      : context ?? {};
    starfallLinked = linkedNegativeStatusContext(state, side, starfallLinked);
    return linkedChargeBurstSourceContext(
      skill,
      starfallLinked,
      chargeStacksForSide(side),
    );
  }

  function updateLinkedNegativeStatus(side, skill, key, value) {
    const action = negativeStatusInputUpdate(stateRef.current, side, skill, key, value);
    if (!action) return false;
    dispatch(action);
    return true;
  }

  function linkedSkillSlotView(side, entry) {
    const view = getSkillSlotView(snapshot, entry);
    if (!view) return view;
    return {
      ...view,
      slotContext: linkedSkillContext(
        side,
        view,
        view.slotContext,
      ),
    };
  }

  const configLibraryFlow = useConfigLibraryFlow({
    initialState,
    onToast: setToast,
    snapshot,
    storedData,
  });
  const firstRunGuide = useFirstRunGuide({
    importFavoriteConfigLibrary: storedData.importFavoriteConfigLibrary,
    loadPopularConfigLibrary: configLibraryFlow.loadPopularConfigLibrary,
    onToast: setToast,
  });
  const shareFlow = useShareFlow({
    initialImportHasPreviousSession: hasRestoredSession,
    serverId,
    active,
    commitSession,
    configurationReady,
    initialState,
    onToast: setToast,
    snapshot,
    state,
    stateRef,
  });
  const overlays = useWorkspaceOverlays({
    configurationReady,
    dispatch,
    negativeStatusEnabled:
      state.calculationOptions?.includeNegativeStatusSettlement === true,
    onCleanupConfirm: () => {
      const next = storedData.clearIncompleteSpiritConfigs();
      return t("已清理未完成配置，保留 {count} 只完整配置", { count: Object.keys(next.configs).length });
    },
    onDirectionToggle: () => setActiveDirection(toggleDirection),
    onToast: setToast,
    resultModel,
    updateDirection,
    viewMode,
  });
  useFeatureMetrics([
    skillQueryOpen && "skills",
    transmissionOpen && "transmission",
    typeQueryOpen && "types",
    rankingKind && (["speed", "durability"].includes(rankingKind) ? rankingKind : "rankings"),
    overlays.team.open && "teams",
    overlays.productAccessProps.open && "desktop",
  ]);
  const {
    compactOptionLabelsEnabled,
    damageComparisonEnabled,
    durabilityOverviewEnabled,
    powerDisplayMode,
    typeCoverageEnabled,
  } = overlays;

  function openAdvancedOptionsAtTop({ closeMobileResult = false } = {}) {
    if (closeMobileResult) {
      overlays.mobileResultProps.actions.onClose({ restoreFocus: false });
    }
    setViewMode("detailed");
    setAdvancedOptionsOpen(true);
    nextAdvancedOptionsTopRequestRef.current += 1;
    setAdvancedOptionsTopRequest(nextAdvancedOptionsTopRequestRef.current);
  }

  function openDamageComparison() {
    if (!damageComparisonEnabled) return;
    overlays.mobileResultProps.actions.onClose({ restoreFocus: false });
    setComparisonSource(captureDamageComparison(stateRef.current, activeDirection, storedData.comparisonPresets));
  }

  function openStarfallThreshold() {
    if (!release.capabilities.calculate || !configurationReady) return;
    overlays.mobileResultProps.actions.onClose({ restoreFocus: false });
    setStarfallSource(captureDamageComparison(stateRef.current, activeDirection));
  }

  // 任一弹层/抽屉打开时引导浮层让位,关闭后恢复。
  const overlayCoveringGuide = Boolean(
    conditionTarget || starfallSource || shortcutsOpen || (damageComparisonEnabled && comparisonSource) || overlays.menu.open ||
      overlays.team.open ||
      overlays.mobileResultProps.open ||
      overlays.cleanupConfigsProps.open ||
      overlays.dataSourceProps.open ||
      overlays.displaySettingsProps.open ||
      overlays.productAccessProps.open ||
      overlays.whatsNewProps.open ||
      configLibraryFlow.overlayProps.mode ||
      shareFlow.overlayProps.open ||
      shareFlow.overlayProps.pendingState,
  );
  const firstRunGuideVisible = firstRunGuide.open && !overlayCoveringGuide;
  useCalculatorShortcuts({
    enabled: active && shortcutSettings.enabled && !overlayCoveringGuide && !firstRunGuideVisible && !skillQueryOpen && !transmissionOpen && !typeQueryOpen && !rankingKind,
    viewMode: savedViewMode,
    onPreview: setPreviewViewMode,
    onModeChange: setViewMode,
    canUndo: undoCount > 0,
    onUndo: undoLastChange,
    canRedo: redoCount > 0,
    onRedo: redoLastChange,
    bindings: shortcutSettings.bindings,
    onSearch: (side) => {
      const input = document.querySelector(`[data-guide-target="${side}"] input`);
      input?.focus(); input?.select();
    },
    onSwap: () => { dispatch({ type: "sides/swap" }); setActiveDirection("forward"); },
    onTeam: () => { overlays.team.setAnalysisEntry(null); overlays.team.setOpen(true); },
    onHelp: () => setShortcutsOpen(true),
    onToggleFormConfig: (side) => {
      const battleSide = side === "attack" ? "attacker" : "defender";
      const family = getBattleFormChoices(snapshot.spirits, stateRef.current.sides[battleSide]);
      const current = formPreferences.readPreferences(side)
        ?? family.some((spirit) => spirit.fullName === "梦想三三");
      const enabled = formPreferences.writePreference(side, !current);
      setToast(t("{side}萌化配置保留已{status}（{scope}）", { side: t(side === "attack" ? "攻击方" : "防御方"), status: t(enabled ? "开启" : "关闭"), scope: t(formPreferences.readMemoryEnabled() ? "跨页面记忆" : "本标签页") }));
    },
  });

  // 完成"选攻击方/选防御方"时引导自动推进;只在选择从无到有时前进,不干扰"上一步"。
  const guideSelectionRef = useRef({
    attacker: Boolean(attacker),
    defender: Boolean(defender),
  });
  const { open: guideOpen, setStep: setGuideStep, step: guideStep } =
    firstRunGuide;
  useEffect(() => {
    const previous = guideSelectionRef.current;
    const current = {
      attacker: Boolean(attacker),
      defender: Boolean(defender),
    };
    guideSelectionRef.current = current;
    if (!guideOpen) return;
    if (guideStep === 0 && current.attacker && !previous.attacker) {
      setGuideStep(1);
    } else if (guideStep === 1 && current.defender && !previous.defender) {
      setGuideStep(2);
    }
  }, [attacker, defender, guideOpen, guideStep, setGuideStep]);

  function updateDirection(value) {
    dispatch({
      direction: activeDirection,
      type: "direction/update",
      value,
    });
  }

  // 四技能模式下点结果行即可切换当前技能;单技能模式行不可点。
  const selectSkillResult = state.mode === "four"
    ? (index) => focusSkillResult(activeAttackSideKey, index)
    : undefined;

  function focusSkillResult(side, index) {
    const direction = side === "attacker" ? "forward" : "reverse";
    setActiveDirection(direction);
    const latest = stateRef.current;
    const current = latest.directions[direction];
    if (current.selectedDamageSource === "skill" && current.selectedSkillIndex === index) return;
    commitSession(reduceSessionAction(latest, { direction, type: "direction/update",
      value: { selectedDamageSource: "skill", selectedSkillIndex: index } }, { serverId }), { recordHistory: false });
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
    recordAppliedGains(latest, { kind: "trait", id: "balance", name: "衡量" });
  }

  function gainSnapshot() {
    const current = stateRef.current;
    return { ...current, directions: Object.fromEntries(["forward", "reverse"].map((key) =>
      [key, { ...current.directions[key], overrides: { ...current.directions[key].overrides } }])) };
  }

  function recordAppliedGains(before, source) {
    const next = recordGainChanges(before, gainSnapshot(), source);
    for (const direction of ["forward", "reverse"]) {
      dispatch({ type: "direction/update", direction,
        value: { overrides: { gainSources: next.directions[direction].overrides.gainSources ?? {} } } });
    }
  }

  function recordAppliedSkill(side, skill, context, operations, count) {
    const next = recordSkillActivation(gainSnapshot(), side, skill, context, operations, count);
    const direction = side === "attacker" ? "forward" : "reverse";
    dispatch({ type: "direction/update", direction,
      value: { overrides: { skillActivations: next.directions[direction].overrides.skillActivations } } });
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

  function updateWeather(weather) {
    commitSession(updateGlobalWeather(stateRef.current, weather));
  }

  function updateTraitContext(direction, key, value) {
    const sourceSide = direction === "forward" ? "attacker" : "defender";
    const traitOwnerSide = key.startsWith("defenderTrait.")
      ? (sourceSide === "attacker" ? "defender" : "attacker") : sourceSide;
    const traitOwner = traitOwnerSide === "attacker" ? attacker : defender;
    const role = key.startsWith("defenderTrait.") ? "defender" : "attacker";
    const control = traitOwner && getTraitView(snapshot, traitOwner, role)?.inputs.find((input) => input.id === key);
    if (control?.action === "s5-stat-turn-end") {
      const applied = applyS5PreviewStatTurnEnd(stateRef.current, { side: traitOwnerSide, snapshot });
      if (applied.applied) commitSession({ state: applied.state, persistence: { rememberSide: traitOwnerSide } });
      return;
    }
    if (control?.action === "s5-dream-turn-end") {
      const applied = applyS5PreviewDreamTurnEnd(stateRef.current, { side: traitOwnerSide, snapshot });
      if (applied.applied) {
        commitSession({ state: applied.state, persistence: { rememberSide: null } });
        setToast(`回合结束：对手寄生 +${applied.added}层（共${applied.total}层）${stateRef.current.calculationOptions?.includeNegativeStatusSettlement ? "" : "；异常结算未开启"}`);
      } else if (applied.reason) setToast(applied.reason);
      return;
    }
    if (control?.contextKey === "enemyTotalSkillCost") {
      const autoControl = getTraitView(snapshot, traitOwner, role).inputs.find((input) => input.contextKey === "enemyTotalSkillCostAuto");
      if (autoControl) commitSession(updateMirroredTraitContext(stateRef.current, { direction, key: autoControl.id, value: false }));
    }
    if (isEnemyStarfallTraitControl(control)) {
      updateTargetStarfallStacks(traitOwnerSide, value);
      return;
    }
    const previousState = stateRef.current;
    const previousValue = previousState.directions[direction].context?.[key];
    const traitUpdate = updateMirroredTraitContext(previousState, { direction, key, value });
    traitUpdate.state = updateS5PreviewTurnEndCounter(previousState, { side: traitOwnerSide, snapshot, control, value }) ?? traitUpdate.state;
    traitUpdate.state = synchronizeS5PreviewSkillUse(traitUpdate.state, {
      side: traitOwnerSide, control, value, snapshot,
    });
    if (resolveS5PreviewBattleLevel(snapshot, previousState, traitOwnerSide) !==
        resolveS5PreviewBattleLevel(snapshot, traitUpdate.state, traitOwnerSide)) {
      const hpDirection = traitOwnerSide === "attacker" ? "reverse" : "forward";
      traitUpdate.state = projectBattleLevelHealth(traitUpdate.state, { snapshot,
        side: traitOwnerSide, hpInputMode: balance.getHpInputMode(hpDirection) });
      const health = traitUpdate.state.directions[hpDirection];
      balance.rememberHpBasis(hpDirection, health.currentHp, health.context?.currentHpPercent,
        traitUpdate.state.sides[traitOwnerSide]);
    }
    commitSession(traitUpdate);
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
    const direction = side === "attacker" ? "reverse" : "forward";
    // The following percent callback commits the official-scale HP atomically.
    if (balance.getHpInputMode(direction) === "percent") return;
    dispatch({
      direction,
      type: "direction/update",
      value: { currentHp },
    });
  }

  function updateSideHealthPercent(side, currentHpPercent) {
    const direction = side === "attacker" ? "reverse" : "forward";
    const source = stateRef.current.sides[side];
    const official = getSpirit(snapshot, source);
    const officialHp = official ? calculateAllPanelStats({ raceStats: official.raceStats,
      displayIvs: source.displayIvs, natureMultipliers: getNatureMultipliers(source.nature),
      level: resolveS5PreviewBattleLevel(snapshot, stateRef.current, side) }).hp : null;
    const hp = balance.getHpInputMode(direction) === "percent" && officialHp !== null
      ? Math.round(officialHp * currentHpPercent / 100) : stateRef.current.directions[direction].currentHp;
    balance.rememberHpBasis(direction, hp, currentHpPercent, source);
    dispatch({
      direction,
      type: "direction/update",
      value: { context: { currentHpPercent },
        ...(balance.getHpInputMode(direction) === "percent" && officialHp !== null
          ? { currentHp: hp } : {}) },
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
    return result.state;
  }

  function openSideAbilityAnalysis(side) {
    const configuration = createTeamMemberFromSide(stateRef.current.sides[side]);
    overlays.team.openAbilityAnalysis({
      configuration,
      side,
      source: "calculator",
    });
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

  function changeForm(side, spiritId) {
    commitSession(switchBattleForm(stateRef.current, { side, snapshot, spiritId }));
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
    const energyUse = prepareS5EnergyUse(latest, { snapshot, side,
      result: calculation?.[side === "attacker" ? "forward" : "reverse"]?.results?.[index] });
    const discountUse = prepareS5DiscountUse(latest, { snapshot, side, skill,
      result: calculation?.[side === "attacker" ? "forward" : "reverse"]?.results?.[index] });
    const trackedUse = Boolean(energyUse || discountUse);
    if (trackedUse) beginDiscreteAction();
    const recordS5SkillUse = () => {
      const next = applyS5DiscountUse(applyS5EnergyUse(stateRef.current, energyUse), discountUse);
      if (next !== stateRef.current) commitSession({ state: next, persistence: { rememberSide: side } });
    };
    if (skill?.s5StatusEffectPending) { setToast(skill.s5StatusEffectPending); return; }
    const context = linkedNegativeStatusContext(latest, side,
      entry && typeof entry === "object" ? entry.context ?? {} : {});
    const activationContextSignature = getSkillActivationContextSignature(skill, context);
    const selfDirection = side === "attacker" ? "forward" : "reverse";
    const oppositeDirection =
      selfDirection === "forward" ? "reverse" : "forward";
    const activeDefenseStatus =
      latest.directions[selfDirection].overrides?.activeDefenseStatus;
    const isSameActiveStatus =
      activeDefenseStatus?.skillId === skill?.id &&
      activeDefenseStatus?.slotIndex === index &&
      matchesSkillActivationContext(skill, activeDefenseStatus?.contextSignature, context);
    if (activeDefenseStatus) {
      const currentOverrides =
        latest.directions[selfDirection].overrides ?? {};
      const expiredOverrides = { ...currentOverrides };
      expireTransientGainSources(expiredOverrides);
      dispatch({
        direction: selfDirection,
        type: "direction/update",
        value: {
          overrides: {
            activeDefenseStatus: null,
            gainSources: expiredOverrides.gainSources ?? {},
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
        if (hasNegativeStatusSkillApplication(skill) || viewModel.skillResultsByDirection[selfDirection]?.[index]?.negativeStatusCanApply) {
          const counts = latest.directions[selfDirection].context?.negativeStatusUseCountsBySlot ?? {};
          dispatch({ direction: selfDirection, type: "direction/update", value: { context: {
            negativeStatusUseCountsBySlot: { ...counts, [index + 1]: 0 },
            negativeStatusRepeatSkillsBySlot: latest.directions[selfDirection].context?.negativeStatusRepeatSkillsBySlot ?? {},
          } } });
        }
        const s5State = synchronizeS5PreviewConfirmationFromUse(stateRef.current, {
          side, snapshot, skillIndex: index, used: false,
        });
        if (s5State !== stateRef.current) commitSession({ state: s5State, persistence: {} });
        setActiveDirection(selfDirection);
        setToast(`${skill.name}的状态已解除`);
        return;
      }
    }
    const spirit = getSpirit(snapshot, latest.sides[side]);
    const effectiveTraits = getEffectiveTraits(snapshot, {
      ...latest.sides[side],
      spirit,
    });
    const effectiveTraitNames = effectiveTraits.map(
      (trait) => trait?.displayName ?? trait?.name,
    );
    const detectedChoiceTrait =
      effectiveTraitNames.find(supportsChoiceTrait) ?? null;
    let negativeStatusUseCount = null;
    const canApplyNegativeStatus =
      latest.calculationOptions?.includeNegativeStatusSettlement === true &&
      ["status", "defense"].includes(skill?.category) &&
      (hasNegativeStatusSkillApplication(skill) || viewModel.skillResultsByDirection[selfDirection]?.[index]?.negativeStatusCanApply);
    if (canApplyNegativeStatus) {
      const currentCounts =
        latest.directions[selfDirection].context
          ?.negativeStatusUseCountsBySlot ?? {};
      const currentCount = Math.min(
        2,
        Math.max(0, Math.floor(Number(currentCounts[index + 1]) || 0)),
      );
      negativeStatusUseCount = canToggleNegativeStatusActivation(skill, context, {
        negativeStatusEnabled: true,
        negativeStatusCanApply: viewModel.skillResultsByDirection[selfDirection]?.[index]?.negativeStatusCanApply,
        postAttackEffects: calculation?.[selfDirection]?.results?.[index]?.postAttackEffects,
      }) && currentCount > 0 ? 0 : 1;
      dispatch({
        direction: selfDirection,
        type: "direction/update",
        value: {
          context: {
            negativeStatusUseCountsBySlot: {
              ...currentCounts,
              [index + 1]: negativeStatusUseCount,
            },
            negativeStatusRepeatSkillsBySlot: latest.directions[selfDirection].context
              ?.negativeStatusRepeatSkillsBySlot ?? {},
          },
        },
      });
      const s5State = synchronizeS5PreviewConfirmationFromUse(stateRef.current, {
        side, snapshot, skillIndex: index, used: negativeStatusUseCount > 0,
      });
      if (s5State !== stateRef.current) commitSession({ state: s5State, persistence: {} });
      if (negativeStatusUseCount === 0) {
        setActiveDirection(selfDirection);
        setToast(`${skill.name}的负面状态已取消`);
        return;
      }
    }
    const negativeStatusNotice = negativeStatusUseCount === 1
      ? `${skill.name}：本回合`
      : null;
    const choiceTrait =
      context.choiceTraitTriggered === true &&
      supportsChoiceTrait(detectedChoiceTrait)
        ? detectedChoiceTrait
        : null;
    latest = projectBattleLevelHealth(latest, { snapshot, side,
      hpInputMode: balance.getHpInputMode(oppositeDirection) });
    const healthDirection =
      side === "attacker" ? latest.directions.reverse : latest.directions.forward;
    const panelStats = calculateAllPanelStats({
      raceStats: spirit.raceStats,
      displayIvs: latest.sides[side].displayIvs,
      natureMultipliers: getNatureMultipliers(latest.sides[side].nature),
      level: resolveS5PreviewBattleLevel(snapshot, latest, side),
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
    const postAttackEffects =
      calculation?.[selfDirection]?.results?.[index]?.postAttackEffects;
    const postAttackStageAdd = Math.max(
      0,
      Math.floor(Number(postAttackEffects?.attackLevelStageAdd) || 0),
    );
    const postAttackNotices = [
      postAttackStageAdd > 0
        ? `贪得无厌：本次共加攻 +${postAttackStageAdd * 10}%`
        : null,
    ].filter(Boolean);
    const rawPostAttackCurrentHp =
      postAttackEffects?.selfCurrentHpAfterSettlement;
    const postAttackCurrentHp = Number(rawPostAttackCurrentHp);
    const hasPostAttackCurrentHp =
      rawPostAttackCurrentHp !== undefined &&
      rawPostAttackCurrentHp !== null &&
      Number.isFinite(postAttackCurrentHp);
    if (!resolution) {
      const hasPostAttackSettlement =
        postAttackStageAdd > 0 || hasPostAttackCurrentHp;
      if (hasPostAttackSettlement) {
        const currentOverrides =
          latest.directions[selfDirection].overrides ?? {};
        if (postAttackStageAdd > 0) {
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
        }
        if (hasPostAttackCurrentHp) {
          dispatch({
            direction: oppositeDirection,
            type: "direction/update",
            value: {
              currentHp: postAttackCurrentHp,
              context: {
                currentHpPercent:
                  postAttackCurrentHp / Math.max(1, panelStats.hp) * 100,
              },
            },
          });
        }
        setActiveDirection(selfDirection);
      }
      if (hasPostAttackSettlement) {
        recordAppliedGains(latest, { kind: "trait", id: postAttackEffects?.source ?? skill.id, name: postAttackEffects?.source ?? skill.name });
        recordAppliedSkill(side, skill, context);
      }
      if (!isChoiceSkill(skill) && !hasPersistentSkillProgression(skill)) {
        if (hasPostAttackSettlement || negativeStatusUseCount !== null || trackedUse) {
          if (trackedUse && !hasPostAttackSettlement) recordAppliedSkill(side, skill, context);
          recordS5SkillUse();
          setActiveDirection(selfDirection);
          setToast(
            [
              hasPostAttackSettlement && postAttackNotices.length === 0
                ? `${skill.name}：吸血后结算自身掉血`
                : null,
              ...postAttackNotices,
              negativeStatusNotice,
              trackedUse ? `${skill.name}已使用${energyUse ? ` · 消耗${energyUse.cost}点能量` : ""}` : null,
            ].filter(Boolean).join("；"),
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
      if (!hasPostAttackSettlement) recordAppliedSkill(side, skill, context);
      recordS5SkillUse();
      setActiveDirection(
        side === "attacker" ? "forward" : "reverse",
      );
      setToast([
        sequence.executions.length > 1
          ? `${detectedChoiceTrait}已应用：本次按两段结算`
          : `${skill.name}已记为使用1次`,
        ...postAttackNotices,
      ].join("；"));
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
      : selfOverrides.fixedPowerAddsBySlot ?? {};
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
      (Number.isFinite(transientPowerPercent) && transientPowerPercent !== 0);

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
          magicalDefenseLevelStageAdd: clampStage(
            Number(selfOverrides.magicalDefenseLevelStageAdd ?? 0) +
              Number(operations.targetMagicalDefenseStageAdd ?? 0),
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
          ...(skill.name === "折射" ? {
            refractionUsage: recordRefractionUsage(selfOverrides, {
              fixedPowerAdd: ownFixedPower,
              hitCountAdd: ownHitCountAdd,
            }, { types: operations.refractionTypes, sproutStacks }),
          } : {}),
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
    recordAppliedGains(latest, { kind: "skill", id: `${side}:${skill.id}`, name: skill.name,
      countDelta: resolution.triggerCount, transient: Number.isFinite(transientPowerPercent) && transientPowerPercent !== 0 });
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
    if (hasPostAttackCurrentHp) {
      dispatch({
        direction: oppositeDirection,
        type: "direction/update",
        value: {
          currentHp: postAttackCurrentHp,
          context: {
            currentHpPercent:
              postAttackCurrentHp / Math.max(1, panelStats.hp) * 100,
          },
        },
      });
    }
    if (operations.targetFreezeStacks > 0) {
      const targetSide = side === "attacker" ? "defender" : "attacker";
      dispatch({ type: "negative-status/update", side: targetSide, key: "freeze",
        value: Number(stateRef.current.negativeStatuses?.[targetSide]?.freeze ?? 0) + operations.targetFreezeStacks });
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
      const requestedStacks = Math.max(
        0,
        Math.floor(Number(markApplication.stacks) || 0),
      );
      const nextStacks = markApplication.mode === "replace"
        ? requestedStacks
        : (currentMark?.id === markApplication.id ? currentMark.stacks : 0) +
          requestedStacks;
      dispatch({
        polarity: markApplication.polarity,
        side: markSide,
        type: "mark/update",
        value: {
          id: markApplication.id,
          stacks: Math.min(99, nextStacks),
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
      // Shared status is a live projection, not a replacement for saved per-skill conditions.
      context: entry && typeof entry === "object" ? entry.context ?? {} : {},
      skill,
      sproutStacks,
      traitName: detectedChoiceTrait,
    });
    updateFourSkillEntry(side, index, { context: operations.pressureValveUseCountAdd
      ? advancePressureValveContext(skill, sequence.nextContext)
      : sequence.nextContext });
    setActiveDirection(selfDirection);
    if (operations.weather) updateWeather(operations.weather);
    recordAppliedSkill(side, skill, context, operations, resolution.triggerCount);
    recordS5SkillUse();
    setToast([
      negativeStatusNotice ?? `${skill.name}的状态已应用`,
      ...postAttackNotices,
    ].join("；"));
  }

  function canActivateSkill(side, index, mode = "four") {
    if (!release.capabilities.calculate) return false;
    const direction = side === "attacker" ? "forward" : "reverse";
    const entry = mode === "single" ? state.sides[side].skills.single : state.sides[side].skills.four[index];
    const skill = getSkill(snapshot, entry);
    if (!skill || skill.s5StatusEffectPending) return false;
    const context = mode === "single" ? state.directions[direction].context : entry?.context;
    return Boolean(prepareS5EnergyUse(state, { snapshot, side, result: calculation?.[direction]?.results?.[index] }) ||
      prepareS5DiscountUse(state, { snapshot, side, skill, result: calculation?.[direction]?.results?.[index] }) ||
      state.directions[direction].overrides?.activeDefenseStatus ||
      Number(state.directions[direction === "forward" ? "reverse" : "forward"].reduction ?? 1) !== 1 ||
      canApplyBattleActivation(skill, linkedNegativeStatusContext(state, side, context), {
        negativeStatusEnabled: state.calculationOptions?.includeNegativeStatusSettlement === true,
        negativeStatusCanApply: viewModel.skillResultsByDirection[direction]?.[index]?.negativeStatusCanApply,
        postAttackEffects: calculation?.[direction]?.results?.[index]?.postAttackEffects,
      }));
  }

  function skillActivationLabel(side, index, mode = "four") {
    const direction = side === "attacker" ? "forward" : "reverse";
    const entry = mode === "single" ? state.sides[side].skills.single : state.sides[side].skills.four[index];
    const skill = getSkill(snapshot, entry);
    if (!["status", "defense"].includes(skill?.category)) {
      const args = { snapshot, side, skill, result: calculation?.[direction]?.results?.[index] };
      return prepareS5EnergyUse(state, args) || prepareS5DiscountUse(state, args) ? "使用技能" : "应用后续变化";
    }
    const context = mode === "single" ? state.directions[direction].context : entry?.context;
    if (canToggleNegativeStatusActivation(skill, linkedNegativeStatusContext(state, side, context), {
      negativeStatusEnabled: state.calculationOptions?.includeNegativeStatusSettlement === true,
      negativeStatusCanApply: viewModel.skillResultsByDirection[direction]?.[index]?.negativeStatusCanApply,
      postAttackEffects: calculation?.[direction]?.results?.[index]?.postAttackEffects,
    })) {
      const key = mode === "single" ? "single" : String(index + 1);
      return Number(state.directions[direction].context?.negativeStatusUseCountsBySlot?.[key]) > 0
        ? "取消使用" : "使用状态";
    }
    return "使用技能";
  }

  function activateSingleSkill() {
    if (selectedSingleSkill?.s5StatusEffectPending) { setToast(selectedSingleSkill.s5StatusEffectPending); return; }
    const actionLabel = skillActivationLabel(activeAttackSideKey, 0, "single");
    const energyUse = prepareS5EnergyUse(stateRef.current, { snapshot, side: activeAttackSideKey,
      result: calculation?.[activeDirection]?.results?.[0] });
    const discountUse = prepareS5DiscountUse(stateRef.current, { snapshot, side: activeAttackSideKey,
      skill: selectedSingleSkill, result: calculation?.[activeDirection]?.results?.[0] });
    const trackedUse = Boolean(energyUse || discountUse);
    if (trackedUse) beginDiscreteAction();
    const applied = applyBattleActivation({ calculation, allowNoEffectUse: trackedUse, side: activeAttackSideKey,
      skillIndex: 0, skillMode: "single", snapshot, state: stateRef.current });
    if (applied.applied || applied.stateChanged) {
      const currentUseCount = applied.state.directions[activeDirection].context?.negativeStatusUseCountsBySlot?.single;
      let nextState = currentUseCount === undefined ? applied.state : synchronizeS5PreviewConfirmationFromUse(applied.state, {
        side: activeAttackSideKey, snapshot, used: Number(currentUseCount) > 0,
      });
      if (applied.skillUsed) nextState = applyS5DiscountUse(applyS5EnergyUse(nextState, energyUse), discountUse);
      commitSession({ state: nextState, persistence: { rememberSide: activeAttackSideKey } });
    }
    setToast(applied.applied
      ? actionLabel === "取消使用" ? `${selectedSingleSkill.name}的使用已取消`
        : `${selectedSingleSkill.name}${actionLabel === "应用后续变化" ? "的后续变化已应用" : "：本回合"}`
      : applied.reason);
  }

  function updateNegativeStatusRepeatNextTurn(checked) {
    const latest = stateRef.current;
    const direction = activeDirection;
    const index = latest.directions[direction].selectedSkillIndex ?? 0;
    const entry = latest.mode === "single" ? latest.sides[activeAttackSideKey].skills.single
      : latest.sides[activeAttackSideKey].skills.four[index];
    const skill = getSkill(snapshot, entry);
    if (!skill) return;
    const key = latest.mode === "single" ? "single" : String(index + 1);
    const repeats = { ...(latest.directions[direction].context?.negativeStatusRepeatSkillsBySlot ?? {}) };
    if (checked) repeats[key] = skill.id;
    else delete repeats[key];
    updateDirection({ context: { negativeStatusRepeatSkillsBySlot: repeats } });
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

  function editableHitCountPatch(
    skill,
    direction,
    effectiveHitCount,
    automaticHitCountAdd,
    { reset = false } = {},
  ) {
    const hitCount = storedHitCount(
      skill,
      direction,
      effectiveHitCount,
      automaticHitCountAdd,
    );
    const input = getEditableHitCountInput(skill);
    if (skill?.name === "传感器") {
      return { hitCount, overrides: { hitCount: reset ? null : hitCount } };
    }
    return input
      ? { context: { [input.id]: hitCount } }
      : { hitCount };
  }

  const moonMemoryEditors = Object.fromEntries(
    [["attacker", attacker], ["defender", defender]].map(([side, spirit]) => [
      side,
      hasNativeMoonMemoryTrait(snapshot, spirit) ? (
        <MoonMemoryTraitEditor
          key={spirit.id}
          onAdd={(traitId) => dispatch({ side, traitId, type: "side/add-acquired-trait" })}
          onRemove={(traitId) => dispatch({ side, traitId, type: "side/remove-acquired-trait" })}
          onValueChange={(traitId, key, value) => {
            const trait = snapshot.traits.find(item => item.id === traitId);
            const control = getS5PreviewTraitInputs(trait)?.find(item => canonicalTraitControlKey(item) === key);
            if (control?.action === "s5-stat-turn-end") {
              const applied = applyS5PreviewStatTurnEnd(stateRef.current, { side, snapshot });
              if (applied.applied) commitSession({ state: applied.state, persistence: { rememberSide: side } });
              return;
            }
            const next = updateS5PreviewTurnEndCounter(stateRef.current, { side, snapshot, control, value, traitId });
            if (next) commitSession({ state: next, persistence: { rememberSide: side } });
            else dispatch({ side, traitId, key, value, type: "side/set-acquired-trait-value" });
          }}
          side={state.sides[side]}
          sideKey={side}
          snapshot={snapshot}
          spirit={spirit}
        />
      ) : null,
    ]),
  );
  const compactTraitEditors = Object.fromEntries(["attacker", "defender"].map((side) => {
    const spirit = side === "attacker" ? attacker : defender;
    const trait = spirit?.previewIdentity ? getTraitView(snapshot, spirit, "attacker") : null;
    const direction = side === "attacker" ? "forward" : "reverse";
    const context = state.directions[direction].context;
    const previewEditor = trait?.previewTraitEntity ? (
      <div className="four-skill-trait-controls s5-preview-trait-editor">
        <TraitHint name={trait.name} description={trait.description} />
        <TraitInputs inputs={trait.inputs} context={context}
          onChange={(key, value) => updateTraitContext(direction, key, value)} />
        <S5PreviewTraitSummary trait={trait} role="attacker" context={context} owner />
      </div>
    ) : null;
    return [side, moonMemoryEditors[side] || previewEditor ? <>{moonMemoryEditors[side]}{previewEditor}</> : null];
  }));
  const singleTraitEditors = viewMode === "compact" ? compactTraitEditors : moonMemoryEditors;
  const singleTraitContent = Object.values(singleTraitEditors).some(Boolean) ? (
    <div className="moon-memory-single">
      {[["attacker", attacker, "攻击方"], ["defender", defender, "防御方"]].map(([side, spirit, label]) => singleTraitEditors[side] ? (
        <div className={`moon-memory-single__side moon-memory-single__side--${side}`} key={side}>
          <small>{t(label)} · {spiritName(spirit)}</small>
          {singleTraitEditors[side]}
        </div>
      ) : null)}
    </div>
  ) : null;
  function updateSingleSkillCondition(key, value) {
    if (updateLinkedNegativeStatus(activeAttackSideKey, selectedSingleSkill, key, value)) return;
    if (
      selectedSingleSkill?.name === "多维击打" &&
      isEnemyStarfallInput(selectedSingleSkill, key)
    ) {
      updateTargetStarfallStacks(activeAttackSideKey, value);
      return;
    }
    if (isChargeBurstSourceInput(selectedSingleSkill, key)) {
      updateChargeBurstSource(activeAttackSideKey, value);
      return;
    }
    updateTraitContext(activeDirection, key, value);
  }

  function updateFourSkillCondition(side, index, key, value) {
    const skill = getSkill(
      snapshot,
      stateRef.current.sides[side].skills.four[index],
    );
    if (updateLinkedNegativeStatus(side, skill, key, value)) return;
    if (skill?.name === "多维击打" && isEnemyStarfallInput(skill, key)) {
      updateTargetStarfallStacks(side, value);
      return;
    }
    if (isChargeBurstSourceInput(skill, key)) {
      updateChargeBurstSource(side, value);
      return;
    }
    updateFourSkillEntry(side, index, {
      context: { [key]: value },
    });
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
      attackerTraits={
        activeDirection === "forward" ? attackerTraits : defenderTraits
      }
      carriedSkills={state.sides[activeAttackSideKey].skills.four
        .map((entry) => getSkill(snapshot, entry))
        .filter(Boolean)}
      defenderHealth={
        activeDirection === "forward" ? defenderHealth : attackerHealth
      }
      defenderTrait={getTraitView(snapshot, activeDefenseSpirit, "defender")}
      hitCount={resultModel.selectedResult?.hitCount ?? currentDirection.hitCount}
      onHitCountChange={(hitCount, options) =>
        updateRememberedSingleDirection(
          editableHitCountPatch(
            selectedSingleSkill,
            currentDirection,
            hitCount,
            resultModel.selectedResult?.automaticHitCountAdd,
            options,
          ),
        )
      }
      onAttackerHealthChange={(currentHp) =>
        updateSideHealth(
          activeDirection === "forward" ? "attacker" : "defender",
          currentHp,
        )
      }
      onAttackerHealthInputModeChange={(mode) => balance.setHpInputMode(activeDirection === "forward" ? "reverse" : "forward", mode)}
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
      onDefenderHealthInputModeChange={(mode) => balance.setHpInputMode(activeDirection, mode)}
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
      canActivateSkill={canActivateSkill(activeAttackSideKey, 0, "single")}
      skillActivationLabel={skillActivationLabel(activeAttackSideKey, 0, "single")}
      onSkillActivate={activateSingleSkill}
      onTraitContextChange={updateSingleSkillCondition}
      result={resultModel.selectedResult}
      selectedSkill={selectedSingleSkill}
      skills={activeAttackSkills}
      negativeStatusEnabled={
        state.calculationOptions?.includeNegativeStatusSettlement === true
      }
      powerDisplayMode={powerDisplayMode}
      powerOverride={currentDirection.overrides.powerOverride ?? null}
      traitContext={linkedSkillContext(
        activeAttackSideKey,
        selectedSingleSkill,
        linkedStarfallTraitContext(activeAttackSideKey, currentDirection.context),
      )}
    />
  ) : null;

  const attackerTraitDamage = calculation.forward.traitResult
    ? {
        basePower: calculation.forward.traitResult.skillPower,
        hitCount: state.directions.forward.traitDamageHitCount ?? 1,
        name: calculation.forward.traitResult.skillName,
        result: viewModel.traitResultsByDirection.forward,
        typeLabel: calculation.forward.traitResult.typeLabel,
      }
    : null;
  const defenderTraitDamage = calculation.reverse.traitResult
    ? {
        basePower: calculation.reverse.traitResult.skillPower,
        hitCount: state.directions.reverse.traitDamageHitCount ?? 1,
        name: calculation.reverse.traitResult.skillName,
        result: viewModel.traitResultsByDirection.reverse,
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

  const defaultSkillActions = Object.fromEntries(["attacker", "defender"].map((side) => [side,
    getRestorableDefaultSkills(state, { side, snapshot }) ? (
      <button type="button" className="skill-follow-up skill-default-restore"
        aria-label={t("{side}载入默认配招", { side: t(side === "attacker" ? "攻击方" : "防御方") })}
        onClick={() => commitSession(restoreDefaultSkills(stateRef.current, { side, snapshot }))}>
        {t("载入默认配招")}
      </button>
    ) : null,
  ]));

  const fourEditor = configurationReady ? (
    <FourSkillEditor
      headerActions={defaultSkillActions}
      traitEditors={state.mode === "four" ? moonMemoryEditors : {}}
      activeDamageSource={activeDamageSource}
      activeSide={activeAttackSideKey}
      activeSkillIndex={currentDirection.selectedSkillIndex}
      attackerHealth={attackerHealth}
      attackerHitCount={state.directions.forward.hitCount}
      attackerLifestealPercent={
        state.directions.forward.overrides?.lifestealPercent ?? 0
      }
      attackerName={spiritName(attacker)}
      attackerResults={viewModel.skillResultsByDirection.forward}
      attackerSkillChoices={attackerSkillChoices}
      attackerSkills={state.sides.attacker.skills.four.map((entry) =>
        linkedSkillSlotView("attacker", entry),
      )}
      attackerSproutStacks={
        state.marks?.attacker?.positive?.id === "sprout"
          ? state.marks.attacker.positive.stacks
          : 0
      }
      attackerTrait={getTraitView(snapshot, attacker, "attacker")}
      attackerTraits={attackerTraits}
      attackerTraitContext={linkedStarfallTraitContext("attacker", state.directions.forward.context)}
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
      defenderName={spiritName(defender)}
      defenderResults={viewModel.skillResultsByDirection.reverse}
      defenderSkillChoices={defenderSkillChoices}
      defenderSkills={state.sides.defender.skills.four.map((entry) =>
        linkedSkillSlotView("defender", entry),
      )}
      defenderSproutStacks={
        state.marks?.defender?.positive?.id === "sprout"
          ? state.marks.defender.positive.stacks
          : 0
      }
      defenderTrait={getTraitView(snapshot, defender, "attacker")}
      defenderTraits={defenderTraits}
      defenderTraitContext={linkedStarfallTraitContext("defender", state.directions.reverse.context)}
      defenderTraitDamage={defenderTraitDamage}
      defenderDefenseTrait={
        hasFairPigeonBalance(attacker)
          ? null
          : getTraitView(snapshot, attacker, "defender")
      }
      onHealthChange={updateSideHealth}
      onHealthPercentChange={updateSideHealthPercent}
      onHealthInputModeChange={(side, mode) => balance.setHpInputMode(side === "attacker" ? "reverse" : "forward", mode)}
      onTraitContextChange={(side, key, value) => {
        const direction = side === "attacker" ? "forward" : "reverse";
        updateTraitContext(direction, key, value);
      }}
      onSkillContextChange={updateFourSkillCondition}
      onSkillActivate={activateFourSkill}
      canSkillActivate={canActivateSkill}
      skillActivationLabel={skillActivationLabel}
      onSkillFocus={focusSkillResult}
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
        updateFourSkillEntry(
          side,
          index,
          editableHitCountPatch(
            getSkill(snapshot, entry),
            direction,
            hitCount,
            automaticHitCountAdd,
          ),
        );
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

  function compactConditionModel({ key, side, title, triggerLabel, inputs, context = {}, onChange, kind, index }) {
    const selfHealth = side === "attacker" ? attackerHealth : defenderHealth;
    const targetSide = side === "attacker" ? "defender" : "attacker";
    const targetHealth = side === "attacker" ? defenderHealth : attackerHealth;
    const healthFields = [];
    const resolvedContext = { ...context };
    for (const [contextKey, owner, label, health] of [
      ["attackerHpPercent", side, "自身生命", selfHealth],
      ["defenderHpPercent", targetSide, "对方生命", targetHealth],
    ]) {
      if (health && inputs.some((input) => (input.contextKey ?? input.key) === contextKey)) {
        healthFields.push({ key: contextKey, label, health,
          onChange: (value) => updateSideHealth(owner, value),
          onPercentChange: (value) => updateSideHealthPercent(owner, value) });
      }
    }
    const controls = inputs.filter((input) => isDynamicInputVisible(input, context) && !healthFields.some((field) => field.key === (input.contextKey ?? input.key)));
    if (!controls.length && !healthFields.length) return null;
    return { key, side, title, triggerLabel, inputs: controls, context: resolvedContext, onChange, healthFields, kind, index };
  }

  const compactSkillConditions = { attacker: [], defender: [] };
  const compactTraitConditions = {};
  let compactSingleConditions = null;
  if (configurationReady && !placeholder) {
    for (const side of ["attacker", "defender"]) {
      const spirit = side === "attacker" ? attacker : defender;
      const opponent = side === "attacker" ? defender : attacker;
      const direction = side === "attacker" ? "forward" : "reverse";
      const oppositeDirection = side === "attacker" ? "reverse" : "forward";
      const label = t(side === "attacker" ? "攻击方" : "防御方");
      const trait = getTraitView(snapshot, spirit, "attacker");
      const ownDefenseTrait = getTraitView(snapshot, spirit, "defender");
      const traitInputs = mergeDynamicInputs(trait?.inputs ?? [], ownDefenseTrait?.inputs ?? [])
        .filter((input) => state.mode === "single" || input.scope !== "slot");
      compactTraitConditions[side] = compactConditionModel({
        key: `trait:${state.mode}:${side}:${spirit.id}:${opponent.id}`,
        side, kind: "trait", title: `${label} · ${spirit.traitName ?? trait?.name ?? "特性"}条件`, triggerLabel: `${label}特性条件`,
        inputs: traitInputs,
        context: { ...linkedStarfallTraitContext(side, state.directions[oppositeDirection].context), ...linkedStarfallTraitContext(side, state.directions[direction].context) },
        onChange: (key, value) => updateTraitContext(key.startsWith("defenderTrait.") ? oppositeDirection : direction, key, value),
      });
      if (state.mode !== "four") continue;
      const selectedSkills = state.sides[side].skills.four.map((entry) => linkedSkillSlotView(side, entry));
      compactSkillConditions[side] = selectedSkills.map((selected, index) => {
        if (!selected) return null;
        const result = viewModel.skillResultsByDirection[direction]?.[index];
        const { dynamicInputs } = getSkillSlotConditions({ selected, result, selectedSkills, index, trait,
          defenseTrait: hasFairPigeonBalance(opponent) ? null : getTraitView(snapshot, opponent, "defender"),
          traits: side === "attacker" ? attackerTraits : defenderTraits,
          negativeStatusEnabled: state.calculationOptions?.includeNegativeStatusSettlement === true });
        const context = { ...selected.slotContext };
        for (const input of dynamicInputs) {
          if ((input.contextKey ?? input.key) === "actualSkillCost" && result?.effectiveCostInput != null) context[input.id ?? input.key] = result.effectiveCostInput;
        }
        return compactConditionModel({ key: `four:${side}:${index}:${spirit.id}:${opponent.id}:${selected.id}`,
          side, kind: "skill", index, title: `${label} · ${selected.name}条件`, triggerLabel: `${label}技能${index + 1}条件`,
          inputs: dynamicInputs, context, onChange: (key, value) => updateFourSkillCondition(side, index, key, value) });
      });
    }
    if (state.mode === "single" && selectedSingleSkill) {
      const label = t(activeAttackSideKey === "attacker" ? "攻击方" : "防御方");
      const inputs = mergeDynamicInputs(dynamicInputsForSkill(selectedSingleSkill, {
        includeNegativeStatusEffects: state.calculationOptions?.includeNegativeStatusSettlement === true,
      }), resultModel.selectedResult?.inputs ?? []);
      compactSingleConditions = compactConditionModel({
        key: `single:${activeAttackSideKey}:${activeAttackSpirit.id}:${activeDefenseSpirit.id}:${selectedSingleSkill.id}`,
        side: activeAttackSideKey, kind: "skill", title: `${label} · ${selectedSingleSkill.name}条件`, triggerLabel: `${label}当前技能条件`, inputs,
        context: linkedSkillContext(activeAttackSideKey, selectedSingleSkill, linkedStarfallTraitContext(activeAttackSideKey, currentDirection.context)),
        onChange: updateSingleSkillCondition,
      });
    }
  }
  const openedCondition = viewMode === "compact" && active
    ? [...Object.values(compactTraitConditions), ...compactSkillConditions.attacker, ...compactSkillConditions.defender, compactSingleConditions]
      .find((model) => model && model.key === conditionTarget?.key) ?? null
    : null;
  const conditionTargetValid = Boolean(openedCondition);
  useEffect(() => {
    // A changed entity/mode must discard only the temporary panel, never its configuration.
    if (conditionTarget && !conditionTargetValid) setConditionTarget(null);
  }, [conditionTarget, conditionTargetValid]);
  function openCompactConditions(model, anchor) {
    if (model.kind === "skill" && state.mode === "four") focusSkillResult(model.side, model.index);
    setConditionTarget({ key: model.key, anchor });
  }
  const compactConditionControls = viewMode === "compact" ? Object.fromEntries(["attacker", "defender"].map((side) => [side,
    <CompactConditionTrigger key={side} model={compactTraitConditions[side]} onOpen={openCompactConditions} expanded={openedCondition?.key === compactTraitConditions[side]?.key} />,
  ])) : {};

  const compactSingleEditor = configurationEditable ? (
    <CompactSingleSkillEditor
      conditionModel={compactSingleConditions}
      onOpenConditions={openCompactConditions}
      openConditionKey={openedCondition?.key}
      placeholder={placeholder}
      attackName={spiritName(activeAttackSpirit)}
      defenseName={spiritName(activeDefenseSpirit)}
      onSkillSelect={selectSingleSkill}
      canActivateSkill={canActivateSkill(activeAttackSideKey, 0, "single")}
      skillActivationLabel={skillActivationLabel(activeAttackSideKey, 0, "single")}
      onSkillActivate={activateSingleSkill}
      result={resultModel?.selectedResult}
      selectedSkill={selectedSingleSkill}
      skills={activeAttackSkills}
    />
  ) : null;

  const compactFourEditor = configurationEditable ? (
    <CompactFourSkillEditor
      headerActions={defaultSkillActions}
      conditionModels={compactSkillConditions}
      onOpenConditions={openCompactConditions}
      openConditionKey={openedCondition?.key}
      placeholder={placeholder}
      traitEditors={state.mode === "four" ? compactTraitEditors : {}}
      activeDamageSource={activeDamageSource}
      activeSide={activeAttackSideKey}
      activeSkillIndex={currentDirection.selectedSkillIndex}
      attackerName={spiritName(attacker)}
      attackerResults={viewModel.skillResultsByDirection.forward}
      attackerSkillChoices={attackerSkillChoices}
      attackerSkills={state.sides.attacker.skills.four.map((entry) =>
        linkedSkillSlotView("attacker", entry),
      )}
      attackerSproutStacks={
        state.marks?.attacker?.positive?.id === "sprout"
          ? state.marks.attacker.positive.stacks
          : 0
      }
      attackerTraitDamage={attackerTraitDamage}
      defenderName={spiritName(defender)}
      defenderResults={viewModel.skillResultsByDirection.reverse}
      defenderSkillChoices={defenderSkillChoices}
      defenderSkills={state.sides.defender.skills.four.map((entry) =>
        linkedSkillSlotView("defender", entry),
      )}
      defenderSproutStacks={
        state.marks?.defender?.positive?.id === "sprout"
          ? state.marks.defender.positive.stacks
          : 0
      }
      defenderTraitDamage={defenderTraitDamage}
      onSkillFocus={focusSkillResult}
      onSkillActivate={activateFourSkill}
      canSkillActivate={canActivateSkill}
      skillActivationLabel={skillActivationLabel}
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
        onClose: () => overlays.menu.setOpen(false),
        onOpenGlobal,
        onConfigLibraryExport: configLibraryFlow.openConfigLibraryExport,
        onConfigLibraryImport: configLibraryFlow.openConfigLibraryImport,
        onPopularConfigLibrary: configLibraryFlow.openPopularConfigLibrary,
        onFirstRunGuide: () => {
          firstRunGuide.restart();
          setViewMode("compact");
        },
        onClearCurrent: () => {
          balance.reset();
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
        onCleanupConfigs: () => overlays.setCleanupConfigsOpen(true),
        onShare: shareFlow.openShareConfiguration,
        onShowDisplaySettings: () => overlays.setDisplaySettingsOpen(true),
        onShowShortcuts: () => setShortcutsOpen(true),
        onShowWhatsNew: () => overlays.setWhatsNewOpen(true),
        onShowProductAccess: () => overlays.setProductAccessOpen(true),
        onShowDataSource: () => overlays.setDataSourceOpen(true),
        onShowSkillQuery: () => setSkillQueryOpen(true),
        onShowTypeQuery: () => setTypeQueryOpen(true),
        onShowTransmission: () => setTransmissionOpen(true),
        onShowRanking: (kind) => { setRankingsVisited(true); setRankingKind(kind); },
      },
      buttonRef: overlays.menu.buttonRef,
      open: overlays.menu.open,
      ref: overlays.menu.ref,
    },
    cleanupConfigs: overlays.cleanupConfigsProps,
    firstRunGuide: {
      error: firstRunGuide.error,
      importCount: POPULAR_CONFIG_COUNT,
      importing: firstRunGuide.importing,
      layoutKey: `${configurationEditable}:${viewMode}:${state.mode}`,
      onBack: () => firstRunGuide.setStep((current) => Math.max(0, current - 1)),
      onImport: firstRunGuide.importPopularConfig,
      onNext: () => firstRunGuide.setStep((current) => Math.min(5, current + 1)),
      onOpenDetailed: () => setViewMode("detailed"),
      onSkip: firstRunGuide.finish,
      open: firstRunGuideVisible,
      ready: [
        Boolean(attacker),
        Boolean(defender),
        configurationEditable,
        configurationEditable,
        true,
        true,
      ][firstRunGuide.step],
      step: firstRunGuide.step,
    },
    configLibrary: configLibraryFlow.overlayProps,
    dataSource: {
      ...overlays.dataSourceProps,
      dataVersion: serverId === "global" ? "S3 · 2026-08-13" : `S4「季中」 · ${snapshot.meta.bwikiRevision ?? snapshot.meta.snapshotVersion}`,
    },
    productAccess: overlays.productAccessProps,
    displaySettings: overlays.displaySettingsProps,
    mobileResult: {
      ...overlays.mobileResultProps,
      hasCustomRaceStats: balance.hasCustom,
      activeAdvancedConditions,
      actions: {
        ...overlays.mobileResultProps.actions,
        onAdvancedOptionsOpen: () =>
          openAdvancedOptionsAtTop({ closeMobileResult: true }),
        onSkillResultSelect: selectSkillResult,
        onHpInputModeChange: (mode) => balance.setHpInputMode(activeDirection, mode),
        onCurrentHpChange: (value) => updateSideHealth(viewModel.active.defenseSideKey, value),
        onCurrentHpPercentChange: (value) => updateSideHealthPercent(viewModel.active.defenseSideKey, value),
        onNegativeStatusRepeatChange: updateNegativeStatusRepeatNextTurn,
        onOpenComparison: damageComparisonEnabled ? openDamageComparison : undefined,
        onOpenStarfall: release.capabilities.calculate ? openStarfallThreshold : undefined,
      },
    },
    share: shareFlow.overlayProps,
    whatsNew: {
      ...overlays.whatsNewProps,
      onOpenHistory: () => {
        overlays.whatsNewProps.onClose();
        overlays.setDataSourceOpen("release");
      },
      onOpenFeature: (id) => {
        if (id === "theme") {
          document.documentElement.dataset.theme = writeThemeSetting(undefined, document.documentElement.dataset.theme === "dark" ? "light" : "dark");
          return;
        }
        overlays.whatsNewProps.onClose();
        if (id === "skills") setSkillQueryOpen(true);
        else if (id === "types") setTypeQueryOpen(true);
        else if (id === "transmission") setTransmissionOpen(true);
        else if (id === "deer") {
          if (!release.capabilities.calculate) { setDeerOpen(true); return; }
          if (!onOpenDeer) { window.location.href = previewRoute("/dianlu/"); return; }
          let next = stateRef.current;
          for (const [side, name] of [["attacker", "波普鹿"], ["defender", "银月狼王"]]) {
            const current = snapshot.spirits.find((spirit) => spirit.id === next.sides[side].spiritId);
            if (current && (side === "defender" || current.fullName === name)) continue;
            const spirit = snapshot.spirits.find((entry) => entry.fullName === name);
            if (!spirit) { next = null; break; }
            next = selectSpirit(next, { initialState, snapshot, side, spiritId: spirit.id }).state;
          }
          onOpenDeer({ state: next, viewMode, activeDirection, advancedOptionsOpen });
        }
        else if (id === "speed" || id === "durability") { setRankingsVisited(true); setRankingKind(id); }
        else if (id === "ability") {
          if (stateRef.current.sides.attacker.spiritId) openSideAbilityAnalysis("attacker");
          else { overlays.team.setAnalysisEntry(null); overlays.team.setOpen(true); }
        }
      },
      onOpenTeam: () => {
        overlays.whatsNewProps.onClose();
        overlays.team.setAnalysisEntry(null);
        overlays.team.setOpen(true);
      },
      release: FEATURED_USER_RELEASE,
    },
    team: {
      drawerProps: {
        shortcutSettings,
        analysisEntry: overlays.team.analysisEntry,
        getSpiritConfiguration: storedData.getSpiritConfiguration,
        onActiveTeamChange: teamActions.setActive,
        onApply: (side, member) => {
          if (!snapshot.spirits.some((spirit) => spirit.id === member?.spiritId)) return;
          const committed = applySpiritConfiguration(side, member, {
            remember: false,
            source: "team",
          });
          if (committed.sides[side]?.spiritId === member.spiritId) recordLineupApply(side, committed);
          overlays.team.close();
          const spirit = snapshot.spirits.find(
            (candidate) => candidate.id === member.spiritId,
          );
          setToast(
            t("已载入{side} {name}", { side: t(side === "attacker" ? "攻击方" : "防御方"), name: spiritName(spirit) || t("队伍成员") }),
          );
        },
        onAnalysisEntryClear: () => overlays.team.setAnalysisEntry(null),
        onApplyAnalysisSide: (side, member) => {
          applySpiritConfiguration(side, member, {
            remember: false,
            source: "ability-analysis",
          });
          const spirit = snapshot.spirits.find(
            (candidate) => candidate.id === member.spiritId,
          );
          setToast(
            t("能力方案已应用到{side} {name}", { side: t(side === "attacker" ? "攻击方" : "防御方"), name: spiritName(spirit) || t("当前精灵") }),
          );
        },
        onCaptureSide: (side, teamId, index) =>
          teamActions.captureSide(side, teamId, index, state.sides[side]),
        onClose: overlays.team.close,
        onCreateTeam: teamActions.create,
        onImportTeam: teamActions.importTeam,
        onUpdateLineup: teamActions.updateLineup,
        onDeleteTeam: teamActions.remove,
        onDuplicateTeam: teamActions.duplicate,
        onMemberChange: teamActions.updateMember,
        onMemberMove: teamActions.moveMember,
        onRenameTeam: teamActions.rename,
        returnFocusRef: overlays.team.buttonRef,
        snapshot,
        spiritChoices: selectableSpirits,
        teamsState,
      },
      open: overlays.team.open,
    },
    toast: { message: toast, onExpire: () => setToast("") },
  };

  if (!active) return null;
  if (deerOpen) return <Suspense fallback={<p role="status">{t("正在打开电鹿工具…")}</p>}>
    <DeerPage onReturn={(event) => { event?.preventDefault(); setDeerOpen(false); }} />
  </Suspense>;

  return (
    <>
      <AppHeader
        menuButtonRef={overlays.menu.buttonRef}
        menuOpen={overlays.menu.open}
        onMenuOpen={() => overlays.menu.setOpen((open) => !open)}
        toolbox={{
          onOpen: () => { overlays.menu.setOpen(false); if (release.capabilities.search) preloadSkillQuery(serverId); },
          activeTool: typeQueryOpen === "chart" ? "typeChart" : typeQueryOpen ? "types" : skillQueryOpen ? "skills" : transmissionOpen ? "transmission" : rankingKind,
          actions: {
            types: () => setTypeQueryOpen(true),
            typeChart: serverId === "global" ? () => setTypeQueryOpen("chart") : undefined,
            skills: () => setSkillQueryOpen(true),
            transmission: () => setTransmissionOpen(true),
            speed: () => { setRankingsVisited(true); setRankingKind("speed"); },
            durability: () => { setRankingsVisited(true); setRankingKind("durability"); },
            deer: () => {
              if (!release.capabilities.calculate) { setDeerOpen(true); return; }
              if (!onOpenDeer) { window.location.href = previewRoute("/dianlu/"); return; }
              let next = stateRef.current;
              for (const [side, name] of [["attacker", "波普鹿"], ["defender", "银月狼王"]]) {
                const current = snapshot.spirits.find((spirit) => spirit.id === next.sides[side].spiritId);
                if (current && (side === "defender" || current.fullName === name)) continue;
                const spirit = snapshot.spirits.find((entry) => entry.fullName === name);
                if (!spirit) { next = null; break; }
                next = selectSpirit(next, { initialState, snapshot, side, spiritId: spirit.id }).state;
              }
              onOpenDeer({ state: next, viewMode, activeDirection, advancedOptionsOpen });
            },
          },
        }}
        onTeamsOpen={() => {
          overlays.menu.setOpen(false);
          overlays.team.setAnalysisEntry(null);
          overlays.team.setOpen(true);
        }}
        onThemeChange={(theme) => {
          document.documentElement.dataset.theme = writeThemeSetting(
            undefined,
            theme,
          );
        }}
        teamsButtonRef={overlays.team.buttonRef}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
      />
      <WorkspaceOverlays {...overlayProps}>
      {shortcutsOpen && <ShortcutDialog settings={shortcutSettings} onChange={setShortcutSettings} onClose={() => setShortcutsOpen(false)} />}
      <div className={`calculator-layout calculator-layout--${viewMode}`}>
        <main className="calculator-main">
          <SpiritStep
            comparisonActions={release.capabilities.calculate ? Object.fromEntries(["attacker", "defender"].map(side => {
              const spirit = getSpirit(snapshot, state.sides[side]);
              return [side, record => spirit && record ? <SpiritPreviousStatsAction balance={balance} spirit={spirit} side={side} record={record} /> : null];
            })) : undefined}
            comparisonControls={release.capabilities.calculate ? Object.fromEntries(["attacker", "defender"].map((side) => {
              const spirit = getSpirit(snapshot, state.sides[side]);
              return [side, spirit ? <SpiritComparisonControls balance={balance} spirit={spirit} side={side} /> : null];
            })) : undefined}
            comparisonSummaries={release.capabilities.calculate ? Object.fromEntries(["attacker", "defender"].map((side) => {
              const spirit = getSpirit(snapshot, state.sides[side]);
              return [side, spirit ? <SpiritTrialChanges balance={balance} spirit={spirit} side={side} /> : null];
            })) : undefined}
            comparisonActive={Object.fromEntries(["attacker", "defender"].map((side) => {
              const spirit = getSpirit(snapshot, state.sides[side]);
              const draft = balance.customStats[side]?.[spirit?.id] ?? {};
              return [side, balance.customEnabled[side]?.[spirit?.id] === true && Object.entries(draft).some(([key, value]) => key !== "total" && value !== spirit.raceStats?.[key])];
            }))}
            conditionControls={compactConditionControls}
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
            onAttackerFavoriteToggle={() => toggleSpiritFavorite(attacker, state.sides.attacker)}
            onAttackerSelect={(value) => changeSpirit("attacker", value)}
            formSides={state.sides}
            onFormSelect={release.capabilities.calculate ? changeForm : undefined}
            onOpenDeer={onOpenDeer ? () => onOpenDeer({ state: stateRef.current, viewMode, activeDirection, advancedOptionsOpen }) : undefined}
            onDefenderFavoriteToggle={() => toggleSpiritFavorite(defender, state.sides.defender)}
            onDefenderSelect={(value) => changeSpirit("defender", value)}
            onSwap={() => {
              balance.swap();
              dispatch({ type: "sides/swap" });
              setActiveDirection("forward");
            }}
            spirits={selectableSpirits}
          />

          {!configurationReady && !placeholder && !firstRunGuideVisible
            ? <EmptyStateGuide title={!release.capabilities.calculate ? t("选择精灵，开始配置") : undefined}
              message={!release.capabilities.calculate ? t("配置、保存并分享你的队伍。") : tc(viewModel.configurationIssue)} />
            : null}
          {configurationEditable && (viewMode === "compact" || placeholder) ? (
            <section
              aria-label={t("即时配置")}
              className="compact-workspace calculator-step"
            >
              <div
                className="compact-adjustment-grid"
                data-guide-target="quick-settings"
              >
                {["attacker", "defender"].map((side) => {
                  const label = t(side === "attacker" ? "攻击方" : "防御方");
                  return (
                    <div className="compact-adjustment-side" key={side}>
                      <QuickNaturePicker
                        placeholder={placeholder}
                        displayIvs={state.sides[side].displayIvs}
                        label={label}
                        onChange={(value) =>
                          dispatch({
                            side,
                            type: "side/set-nature",
                            value,
                          })
                        }
                        showOptionLabels={compactOptionLabelsEnabled}
                        side={side}
                        value={state.sides[side].nature}
                      />
                      <QuickIvPicker
                        placeholder={placeholder}
                        label={label}
                        onChange={(stat, value) =>
                          dispatch({
                            side,
                            stat,
                            type: "side/set-iv",
                            value,
                          })
                        }
                        showOptionLabels={compactOptionLabelsEnabled}
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
                showOptionLabels={placeholder || compactOptionLabelsEnabled}
                singleSkillContent={compactSingleEditor}
                singleTraitContent={singleTraitContent}
              />
            </section>
          ) : null}
          {configurationReady && viewMode === "detailed" ? (
            <>
              <NatureStatsStep
            attacker={{
              id: attacker.id,
              fullName: spiritName(attacker),
              levels: fairPigeonPresent
                ? [
                    {
                      label: "攻击能力等级",
                      bonusStage: attackerView.abilityStageBonuses?.attack ?? 0,
                      bonusStages: attackerView.abilityStageBonuses?.attackByCategory,
                      multiplier: stageMultiplier(
                        state.directions.forward.overrides.attackLevelStage ?? 0,
                      ),
                      role: "attack",
                      stage:
                        state.directions.forward.overrides.attackLevelStage ?? 0,
                    },
                    {
                      label: "防御能力等级",
                      bonusStage: attackerView.abilityStageBonuses?.defense ?? 0,
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
                      bonusStage: attackerView.abilityStageBonuses?.attack ?? 0,
                      bonusStages: attackerView.abilityStageBonuses?.attackByCategory,
                      multiplier: stageMultiplier(attackLevelStage),
                      role: "attack",
                      stage: attackLevelStage,
                    }
                  : {
                      label: "防御能力等级",
                      bonusStage: attackerView.abilityStageBonuses?.defense ?? 0,
                      multiplier: stageMultiplier(defenseLevelStage),
                      role: "defense",
                      stage: defenseLevelStage,
                    },
              nature: state.sides.attacker.nature,
              stats: getPanelView(attacker, { ...state.sides.attacker, combatLevel: viewModel.sides.attacker.combatLevel }, {
                attack:
                  state.directions.forward.overrides.attackLevelStage ?? 0,
                defense:
                  state.directions.reverse.overrides.defenseLevelStage ?? 0,
                speedFlat:
                  state.directions.forward.overrides.attackerSpeedFlat ?? 0,
                finalStats: viewModel.sides.attacker.finalPanelStats,
              }),
            }}
            onAttackerAnalyze={() => openSideAbilityAnalysis("attacker")}
            defender={{
              id: defender.id,
              fullName: spiritName(defender),
              levels: fairPigeonPresent
                ? [
                    {
                      label: "攻击能力等级",
                      bonusStage: defenderView.abilityStageBonuses?.attack ?? 0,
                      bonusStages: defenderView.abilityStageBonuses?.attackByCategory,
                      multiplier: stageMultiplier(
                        state.directions.reverse.overrides.attackLevelStage ?? 0,
                      ),
                      role: "attack",
                      stage:
                        state.directions.reverse.overrides.attackLevelStage ?? 0,
                    },
                    {
                      label: "防御能力等级",
                      bonusStage: defenderView.abilityStageBonuses?.defense ?? 0,
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
                      bonusStage: defenderView.abilityStageBonuses?.defense ?? 0,
                      multiplier: stageMultiplier(defenseLevelStage),
                      role: "defense",
                      stage: defenseLevelStage,
                    }
                  : {
                      label: "攻击能力等级",
                      bonusStage: defenderView.abilityStageBonuses?.attack ?? 0,
                      bonusStages: defenderView.abilityStageBonuses?.attackByCategory,
                      multiplier: stageMultiplier(attackLevelStage),
                      role: "attack",
                      stage: attackLevelStage,
                    },
              nature: state.sides.defender.nature,
              stats: getPanelView(defender, { ...state.sides.defender, combatLevel: viewModel.sides.defender.combatLevel }, {
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
            onDefenderAnalyze={() => openSideAbilityAnalysis("defender")}
            showDurabilityOverview={durabilityOverviewEnabled}
              />
              <SkillStep
                activeMode={state.mode}
                fourSkillContent={fourEditor}
                onModeChange={setSkillMode}
                onPowerDisplayModeChange={overlays.displaySettingsProps.onPowerDisplayModeChange}
                powerDisplayMode={powerDisplayMode}
                singleSkillContent={singleEditor}
                singleTraitContent={singleTraitContent}
              />
              <AdvancedOptions
                locateAdvancedTopRequest={advancedOptionsTopRequest}
                bloodlineMagicId={
                  currentDirection.context?.bloodlineMagicId ?? "none"
                }
                bloodlineMagicTriggered={
                  currentDirection.context?.bloodlineMagicTriggered === true
                }
                finalMultiplier={currentDirection.finalDamageMultiplier}
                marks={state.marks}
                onOpenStarfall={release.capabilities.calculate ? openStarfallThreshold : undefined}
                starfallTargetSide={activeDirection === "forward" ? "defender" : "attacker"}
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
                onAdvancedTopLocated={(request) =>
                  setAdvancedOptionsTopRequest((pendingRequest) =>
                    pendingRequest === request ? null : pendingRequest
                  )
                }
                onOpenChange={setAdvancedOptionsOpen}
                onWeatherChange={updateWeather}
                onReductionChange={(percent) =>
                  dispatch({
                    direction: reductionDirectionKey,
                    type: "direction/set-reduction",
                    value: Math.max(0, 1 - percent / 100),
                  })
                }
                rainTurns={activeWeatherRainTurns}
                weather={activeWeather}
                reductionPercent={activeReductionPercent}
                result={resultModel.selectedResult}
                open={advancedOptionsOpen}
              />
            </>
          ) : null}
        </main>

        {configurationReady ? (
          <div className="result-column">
            <ResultRail
              hasCustomRaceStats={balance.hasCustom}
              onOpenComparison={damageComparisonEnabled ? openDamageComparison : undefined}
              onOpenStarfall={release.capabilities.calculate ? openStarfallThreshold : undefined}
              activeAdvancedConditions={activeAdvancedConditions}
              onBloodlineResultFocus={() =>
                updateDirection({ selectedDamageSource: "bloodline" })
              }
              onAdvancedOptionsOpen={openAdvancedOptionsAtTop}
              onCurrentHpChange={(currentHp) => updateSideHealth(viewModel.active.defenseSideKey, currentHp)}
              onHpInputModeChange={(mode) => balance.setHpInputMode(activeDirection, mode)}
              onCurrentHpPercentChange={(currentHpPercent) =>
                updateSideHealthPercent(viewModel.active.defenseSideKey, currentHpPercent)
              }
              onDirectionToggle={() =>
                setActiveDirection(toggleDirection)
              }
              onSkillResultSelect={selectSkillResult}
              onNegativeStatusRepeatChange={updateNegativeStatusRepeatNextTurn}
              result={resultModel}
              showTypeCoverage={typeCoverageEnabled}
            />
          </div>
        ) : null}
      </div>

      </WorkspaceOverlays>
      {starfallSource ? <Suspense fallback={<div role="status">{t("正在打开星陨斩杀线…")}</div>}><StarfallThresholdDialog
        key={JSON.stringify(starfallSource)} snapshot={snapshot} source={starfallSource} onClose={() => setStarfallSource(null)}
        onApply={(next, { keepOpen = false, notice = "" } = {}) => {
          if (JSON.stringify(stateRef.current) !== JSON.stringify(starfallSource.state)) {
            setToast(t("主配置已变化，请重新打开星陨斩杀线"));
            return;
          }
          commitSession({ state: next, persistence: { rememberSide: null } });
          setActiveDirection(starfallSource.direction);
          setStarfallSource(keepOpen ? { ...starfallSource, state: next } : null);
          if (notice) setToast(notice);
        }}
      /></Suspense> : null}
      {damageComparisonEnabled && comparisonSource ? <Suspense fallback={<div role="status">{t("正在打开承伤对比…")}</div>}><DamageComparisonDialog
        key={damageComparisonSourceKey(comparisonSource)} preferences={comparisonPreferences} onPreferencesChange={setComparisonPreferences}
        snapshot={snapshot} source={comparisonSource} onClose={() => setComparisonSource(null)}
        onImport={(spirit, templateId, selectedSkillIndex, inheritTargetStatuses) => {
          if (JSON.stringify(stateRef.current) !== JSON.stringify(comparisonSource.state)) {
            setToast(t("主配置已变化，请重新打开承伤对比"));
            return;
          }
          dispatch({ type: "state/replace", value: importDamageComparisonCandidate({ snapshot, ...comparisonSource, spirit, templateId, selectedSkillIndex, inheritTargetStatuses }) });
          setActiveDirection(comparisonSource.direction);
          setComparisonSource(null);
          setToast(DAMAGE_COMPARISON_IMPORT_NOTICE);
        }}
      /></Suspense> : null}
      {rankingsVisited ? <Suspense fallback={<div role="status">{t("正在打开排行榜…")}</div>}><RankingsPanel kind={rankingKind} snapshot={snapshot} onClose={() => setRankingKind(null)} /></Suspense> : null}
      {transmissionOpen && <Suspense fallback={<div role="status">{t("正在打开传动计算器…")}</div>}><TransmissionPanel snapshot={snapshot} sides={state.sides} getSpiritConfiguration={storedData.getSpiritConfiguration} onClose={() => setTransmissionOpen(false)} /></Suspense>}
      {typeQueryOpen && <Suspense fallback={<div role="status">{t(typeQueryOpen === "chart" ? "正在打开克制图…" : "正在打开属性查询…")}</div>}>
        {typeQueryOpen === "chart" ? <TypeChartPanel typeChart={snapshot.typeChart} onClose={() => setTypeQueryOpen(false)} />
          : <TypeQueryPanel typeChart={snapshot.typeChart} spirits={snapshot.spirits} spiritFilterRevision={snapshot.meta?.revisions?.spiritFilter} selectedTypes={queryTypes} onTypesChange={setQueryTypes} onClose={() => setTypeQueryOpen(false)} />}
      </Suspense>}
      {openedCondition && <CompactConditionDialog model={openedCondition} anchor={conditionTarget.anchor} onClose={() => setConditionTarget(null)} />}
      {skillQueryOpen && <Suspense fallback={<div role="status">{t("正在打开技能查询…")}</div>}><SkillQueryPanel snapshot={snapshot} skills={snapshot.skills} spirits={snapshot.spirits} onClose={() => setSkillQueryOpen(false)} /></Suspense>}
      <FloatingUndoButton count={undoCount} onUndo={undoLastChange} />
    </>
  );
}

export function App({ initialSnapshot = null, initialWorkspace = null, onOpenDeer, onOpenGlobal, active = true }) {
  const { serverId } = useRuntime();
  const { t } = useLocale();
  const [snapshot, setSnapshot] = useState(() =>
    initialSnapshot
      ? serverId === "global"
        ? initialSnapshot.meta?.serverId === "global" ? initialSnapshot : UNVERIFIED_GLOBAL_SNAPSHOT
        : withWebPreview(initialSnapshot)
      : null,
  );
  const [error, setError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    if (initialSnapshot) return undefined;
    const controller = new AbortController();
    let active = true;

    const loading = loadServerSnapshot(serverId, { signal: controller.signal })
      .then((loaded) => serverId === "cn" ? withWebPreview(loaded) : loaded);
    loading
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
  }, [initialSnapshot, serverId, loadAttempt]);

  if (!snapshot) {
    return (
      <div className="app">
        <AppHeader viewMode={initialWorkspace?.viewMode ?? readViewModeSetting(serverId)} />
        <main className="loading-state">
          <p>{t(error ? "资料加载失败，请重试。" : serverId === "global" ? "正在加载精灵资料…" : "正在加载 S4「季中」数据…")}</p>
          {error ? <button type="button" onClick={() => { setError(""); setLoadAttempt(value => value + 1); }}>{t("重试")}</button> : null}
        </main>
      </div>
    );
  }

  return (
    <div className="app">
      <PresetBrowseProvider serverId={serverId}><CalculatorWorkspace key={`${serverId}:${snapshot.meta.id}`} snapshot={snapshot} initialWorkspace={initialWorkspace} onOpenDeer={onOpenDeer} onOpenGlobal={onOpenGlobal} active={active} /></PresetBrowseProvider>
    </div>
  );
}
