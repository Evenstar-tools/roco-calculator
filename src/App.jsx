import { X } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { AdvancedOptions } from "./components/AdvancedOptions.jsx";
import { AppHeader } from "./components/AppHeader.jsx";
import {
  CompactFourSkillEditor,
  CompactSingleSkillEditor,
} from "./components/CompactSkillEditor.jsx";
import { FourSkillEditor } from "./components/FourSkillEditor.jsx";
import { NatureStatsStep } from "./components/NatureStatsStep.jsx";
import { QuickNaturePicker } from "./components/QuickNaturePicker.jsx";
import { QuickIvPicker } from "./components/QuickIvPicker.jsx";
import { ResultRail } from "./components/ResultRail.jsx";
import { SingleSkillEditor } from "./components/SingleSkillEditor.jsx";
import { SkillStep } from "./components/SkillStep.jsx";
import { SpiritStep } from "./components/SpiritStep.jsx";
import { TeamDrawer } from "./components/TeamDrawer.jsx";
import { calculateMatchup } from "./domain/calculate.js";
import {
  getDefaultHitCount,
  getSkillEffectInputs,
} from "./domain/skill-effects.js";
import { resolveSkillStatusActivation } from "./domain/skill-status-effects.js";
import {
  getNatureMultipliers,
  normalizeNatureId,
} from "./domain/natures.js";
import {
  getInheritedDamageTraits,
  getTraitEffectInputs,
} from "./domain/trait-effects.js";
import {
  chooseDefaultSkillIds,
  getSkillChoices,
} from "./domain/skill-loadout.js";
import { calculateAllPanelStats } from "./domain/stat.js";
import { createSpiritSearchIndex } from "./data/search-index.js";
import { withCalculatorExtras } from "./data/snapshot-extras.js";
import { createInitialState } from "./state/defaults.js";
import { favoritesRepository } from "./state/favorites.js";
import { calculatorReducer } from "./state/reducer.js";
import { decodeShareState, encodeShareState } from "./state/share.js";
import {
  isCompleteSpiritConfig,
  spiritConfigsRepository,
} from "./state/spirit-configs.js";
import {
  createTeamMemberFromSide,
  teamPresetsRepository,
} from "./state/team-presets.js";

const STAT_VIEW = [
  { key: "physicalAttack", label: "物攻" },
  { key: "magicalAttack", label: "魔攻" },
  { key: "speed", label: "速度" },
  { key: "hp", label: "HP" },
  { key: "physicalDefense", label: "物防" },
  { key: "magicalDefense", label: "魔防" },
];

const REMEMBERED_SIDE_ACTIONS = new Set([
  "side/apply-preset",
  "side/set-four-skill",
  "side/set-iv",
  "side/set-nature",
  "side/set-single-skill",
]);

function clampStage(value) {
  return Math.min(50, Math.max(-50, Math.floor(Number(value) || 0)));
}

function stageMultiplier(stage) {
  const normalizedStage = clampStage(stage);
  return normalizedStage >= 0
    ? 1 + normalizedStage * 0.1
    : 1 / (1 + Math.abs(normalizedStage) * 0.1);
}

function abilityLevelMultiplier(attackStage, defenseStage) {
  const attackPercent = clampStage(attackStage) * 10;
  const defensePercent = clampStage(defenseStage) * 10;
  return (
    (1 +
      Math.max(attackPercent, 0) / 100 +
      Math.max(-defensePercent, 0) / 100) /
    (1 +
      Math.max(-attackPercent, 0) / 100 +
      Math.max(defensePercent, 0) / 100)
  );
}

function sameVersions(left, right) {
  return left.data === right.data && left.rules === right.rules;
}

function shareHashFromInput(value) {
  const text = String(value ?? "").trim();
  if (text.startsWith("#v1.")) return text;
  try {
    const hash = new URL(text, globalThis.location?.href).hash;
    if (hash.startsWith("#v1.")) return hash;
  } catch {
    // 统一在下面给出用户可理解的错误。
  }
  throw new TypeError("分享链接格式无效");
}

function migrateSharedState(sharedState, versions) {
  return {
    ...sharedState,
    versions,
    sides: Object.fromEntries(
      Object.entries(sharedState.sides).map(([side, value]) => [
        side,
        {
          ...value,
          nature: normalizeNatureId(value.nature),
        },
      ]),
    ),
  };
}

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
function trapFocus(event, container) {
  if (event.key !== "Tab" || !container) return;
  const focusable = [...container.querySelectorAll(FOCUSABLE_SELECTOR)];
  if (focusable.length === 0) return;
  const first = focusable[0];
  const last = focusable.at(-1);
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function getSkill(snapshot, entry) {
  const id = typeof entry === "string" ? entry : entry?.skillId ?? entry?.id;
  return snapshot.skills.find((skill) => skill.id === id) ?? null;
}

function getSkillSlotView(snapshot, entry) {
  const skill = getSkill(snapshot, entry);
  if (!skill) return null;
  if (!entry || typeof entry !== "object") return skill;
  return {
    ...skill,
    slotContext: entry.context ?? {},
    slotHitCount: entry.hitCount,
    slotPowerOverride:
      entry.overrides?.basePower ?? entry.basePowerOverride,
  };
}

function assertSnapshotReferences(sharedState, snapshot) {
  const spiritIds = new Set(snapshot.spirits.map((spirit) => spirit.id));
  const skillIds = new Set(snapshot.skills.map((skill) => skill.id));

  for (const side of Object.values(sharedState.sides)) {
    if (!side.spiritId || !spiritIds.has(side.spiritId)) {
      throw new TypeError("分享配置包含当前数据中不存在的精灵");
    }

    const skillInputs = [side.skills.single, ...side.skills.four];
    for (const input of skillInputs) {
      const skillId =
        typeof input === "string" ? input : input?.skillId ?? input?.id;
      if (skillId && !skillIds.has(skillId)) {
        throw new TypeError("分享配置包含当前数据中不存在的技能");
      }
    }
  }
}

function createProductInitialState(snapshot) {
  const state = createInitialState(snapshot);
  const emptySkills = {
    single: null,
    four: [null, null, null, null],
  };

  return {
    ...state,
    mode: "four",
    sides: {
      attacker: {
        ...state.sides.attacker,
        spiritId: null,
        nature: "neutral",
        displayIvs: {
          hp: 0,
          speed: 60,
          physicalAttack: 60,
          magicalAttack: 60,
          physicalDefense: 0,
          magicalDefense: 0,
        },
        skills: { ...emptySkills, four: [...emptySkills.four] },
      },
      defender: {
        ...state.sides.defender,
        spiritId: null,
        nature: "neutral",
        displayIvs: {
          hp: 60,
          speed: 0,
          physicalAttack: 0,
          magicalAttack: 0,
          physicalDefense: 0,
          magicalDefense: 0,
        },
        skills: { ...emptySkills, four: [...emptySkills.four] },
      },
    },
    directions: {
      forward: {
        ...state.directions.forward,
        context: {},
      },
      reverse: {
        ...state.directions.reverse,
        context: {},
      },
    },
  };
}

function cloneDirection(direction) {
  return {
    ...direction,
    context: { ...(direction.context ?? {}) },
    overrides: { ...(direction.overrides ?? {}) },
  };
}

function createDefaultSpiritSide(initialSide, snapshot, spiritId) {
  const four = chooseDefaultSkillIds(snapshot, spiritId);
  return {
    ...initialSide,
    displayIvs: { ...initialSide.displayIvs },
    skills: {
      four,
      single: four.find(Boolean) ?? null,
    },
    spiritId,
  };
}

function singleSkillMemory(entry) {
  if (!entry || typeof entry !== "object") return null;
  return {
    context: { ...(entry.context ?? {}) },
    hitCount: Number.isFinite(Number(entry.hitCount))
      ? Number(entry.hitCount)
      : 1,
    overrides: { ...(entry.overrides ?? {}) },
  };
}

function buildCombatState(state) {
  return {
    ...state,
    sides: Object.fromEntries(
      Object.entries(state.sides).map(([side, value]) => [
        side,
        {
          ...value,
          natureMultipliers: getNatureMultipliers(value.nature),
        },
      ]),
    ),
  };
}

function getSpirit(snapshot, side) {
  return snapshot.spirits.find((spirit) => spirit.id === side.spiritId);
}

function getPanelView(spirit, side, stages = {}) {
  const panel = calculateAllPanelStats({
    raceStats: spirit.raceStats,
    displayIvs: side.displayIvs,
    natureMultipliers: getNatureMultipliers(side.nature),
  });
  const attackMultiplier = stageMultiplier(stages.attack ?? 0);
  const defenseMultiplier = stageMultiplier(stages.defense ?? 0);
  return STAT_VIEW.map(({ key, label }) => {
    const multiplier =
      key === "physicalAttack" || key === "magicalAttack"
        ? attackMultiplier
        : key === "physicalDefense" || key === "magicalDefense"
          ? defenseMultiplier
          : 1;
    return {
      displayIv: side.displayIvs[key],
      key,
      label,
      panel: Math.round(panel[key] * multiplier),
      race: spirit.raceStats[key],
    };
  });
}

function getTraitView(snapshot, spirit, role = "attacker") {
  const primaryTrait =
    snapshot.traits?.find((candidate) => spirit.traitIds?.includes(candidate.id)) ??
    null;
  const fallbackTrait = primaryTrait ?? {
    description: spirit.traitDescription,
    name: spirit.traitName,
  };
  const candidates = [
    fallbackTrait,
    ...getInheritedDamageTraits(spirit),
  ].filter((candidate) => candidate?.name);
  const traitEntity =
    candidates.find(
      (candidate) => getTraitEffectInputs(candidate, role).length > 0,
    ) ?? candidates[0];
  if (!traitEntity) return null;
  const inputs = getTraitEffectInputs(traitEntity, role);
  const condition = inputs.find((input) => input.type === "boolean");
  return {
    conditionKey: condition?.key ?? null,
    conditionLabel: condition?.label ?? null,
    description:
      traitEntity.description ?? "按当前战斗条件自动判定。",
    inputs,
    name: traitEntity.displayName ?? traitEntity.name,
  };
}

function asResultRailModel({
  calculation,
  direction,
  snapshot,
  state,
}) {
  const isForward = direction === "forward";
  const attackSide = isForward ? state.sides.attacker : state.sides.defender;
  const defenseSide = isForward ? state.sides.defender : state.sides.attacker;
  const attacker = getSpirit(snapshot, attackSide);
  const defender = getSpirit(snapshot, defenseSide);
  const directionResult = calculation[direction];
  const selected = directionResult.selectedResult;
  const defenderPanels = calculateAllPanelStats({
    raceStats: defender.raceStats,
    displayIvs: defenseSide.displayIvs,
    natureMultipliers: getNatureMultipliers(defenseSide.nature),
  });
  const defenderHp = Math.min(
    defenderPanels.hp,
    Math.max(
      0,
      state.directions[direction].currentHp ?? defenderPanels.hp,
    ),
  );
  const rows = [...directionResult.results];
  while (rows.length < 4) rows.push(null);

  return {
    attackerName: attacker.fullName,
    defenderHp,
    defenderHpPercent:
      state.directions[direction].context?.currentHpPercent ??
      Number(((defenderHp / defenderPanels.hp) * 100).toFixed(1)),
    defenderMaxHp: defenderPanels.hp,
    defenderName: defender.fullName,
    mode: state.mode,
    selectedResult: selected,
    selectedSkillName: selected.skillName ?? "未选择技能",
    skillResults: rows.map((result, index) => ({
      damage: result?.totalDamage ?? null,
      hpPercent: result?.hpPercent ?? null,
      id: result?.skillId ?? `empty-${index}`,
      name: result?.skillName ?? `技能${index + 1}`,
      selected:
        index ===
        (state.mode === "four"
          ? state.directions[direction].selectedSkillIndex
          : 0),
    })),
  };
}

function unresolvedCalculation(error) {
  const result = {
    formulaSteps: [],
    hpPercent: null,
    lethal: false,
    reason: error instanceof Error ? error.message : "计算条件无效",
    skillId: null,
    skillName: null,
    status: "unsupported",
    totalDamage: null,
  };
  return {
    forward: { results: [result], selectedResult: result },
    reverse: { results: [result], selectedResult: result },
  };
}

function attachLocalAssets(snapshot, manifest) {
  const enrichedSnapshot = withCalculatorExtras(snapshot);
  const localById = new Map(
    (manifest?.assets ?? []).map((asset) => [asset.id, asset.localFile]),
  );
  if (localById.size === 0) return enrichedSnapshot;
  return {
    ...enrichedSnapshot,
    spirits: enrichedSnapshot.spirits.map((spirit) => ({
      ...spirit,
      asset: {
        ...spirit.asset,
        localUrl: localById.get(spirit.id) ?? spirit.asset?.localUrl,
      },
    })),
  };
}

function CalculatorWorkspace({ snapshot }) {
  const initialState = useMemo(() => createProductInitialState(snapshot), [snapshot]);
  const [state, setState] = useState(initialState);
  const stateRef = useRef(initialState);
  const [activeDirection, setActiveDirection] = useState("forward");
  const [importDraft, setImportDraft] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileResultOpen, setMobileResultOpen] = useState(false);
  const [pendingSharedState, setPendingSharedState] = useState(null);
  const [shareLink, setShareLink] = useState("");
  const [teamOpen, setTeamOpen] = useState(false);
  const [viewMode, setViewMode] = useState("compact");
  const drawerCloseRef = useRef(null);
  const importDialogRef = useRef(null);
  const menuButtonRef = useRef(null);
  const menuRef = useRef(null);
  const mobileResultTriggerRef = useRef(null);
  const resultDrawerRef = useRef(null);
  const shareDialogRef = useRef(null);
  const teamsButtonRef = useRef(null);
  const versionDialogRef = useRef(null);
  const favoriteStore = useMemo(() => {
    try {
      return favoritesRepository();
    } catch {
      return null;
    }
  }, []);
  const [favoriteSpiritIds, setFavoriteSpiritIds] = useState(
    () =>
      new Set(
        (favoriteStore?.list() ?? [])
          .filter((favorite) => favorite.kind === "spirit")
          .map((favorite) => favorite.spiritId),
      ),
  );
  const spiritConfigStore = useMemo(() => {
    try {
      return spiritConfigsRepository();
    } catch {
      return null;
    }
  }, []);
  const [spiritConfigsState, setSpiritConfigsState] = useState(() =>
    spiritConfigStore?.load(snapshot) ?? {
      configs: {},
      schemaVersion: 1,
    },
  );
  const spiritConfigsRef = useRef(spiritConfigsState);
  const teamStore = useMemo(() => {
    try {
      return teamPresetsRepository();
    } catch {
      return null;
    }
  }, []);
  const [teamsState, setTeamsState] = useState(() =>
    teamStore?.load(snapshot) ?? {
      activeTeamId: null,
      schemaVersion: 1,
      teams: [],
      warning: "当前环境无法保存队伍",
    },
  );
  const [toast, setToast] = useState(teamsState.warning ?? "");
  const [installPromptEvent, setInstallPromptEvent] = useState(null);
  const [isStandaloneWebApp, setIsStandaloneWebApp] = useState(() => {
    if (typeof window === "undefined") return false;
    return (
      window.matchMedia?.("(display-mode: standalone)")?.matches ||
      window.navigator?.standalone === true
    );
  });

  function commitState(nextState, rememberSide = null) {
    stateRef.current = nextState;
    setState(nextState);
    const configuredSide = rememberSide
      ? nextState.sides[rememberSide]
      : null;
    if (!spiritConfigStore || !configuredSide?.spiritId) return;
    try {
      const nextConfigs = spiritConfigStore.save(
        spiritConfigsRef.current,
        configuredSide,
      );
      spiritConfigsRef.current = nextConfigs;
      setSpiritConfigsState(nextConfigs);
    } catch {
      setToast("配置保存失败");
    }
  }

  function dispatch(action) {
    const nextState = calculatorReducer(stateRef.current, action);
    const rememberSide =
      action.remember !== false &&
      action.side &&
      REMEMBERED_SIDE_ACTIONS.has(action.type)
        ? action.side
        : null;
    commitState(nextState, rememberSide);
    return nextState;
  }

  async function loadSharedState(value) {
    const hash = shareHashFromInput(value);
    const sharedState = await decodeShareState(hash);
    assertSnapshotReferences(sharedState, snapshot);
    if (!sameVersions(sharedState.versions, initialState.versions)) {
      setPendingSharedState(sharedState);
      return;
    }
    dispatch({ type: "state/replace", value: sharedState });
    setToast("分享配置已载入");
  }

  useEffect(() => {
    if (!globalThis.location?.hash?.startsWith("#v1.")) return undefined;
    let active = true;
    decodeShareState(globalThis.location.hash)
      .then((sharedState) => {
        if (!active) return;
        assertSnapshotReferences(sharedState, snapshot);
        if (!sameVersions(sharedState.versions, initialState.versions)) {
          setPendingSharedState(sharedState);
        } else {
          dispatch({ type: "state/replace", value: sharedState });
        }
      })
      .catch((error) => {
        if (active) setToast(error.message);
      });
    return () => {
      active = false;
    };
  }, [initialState]);

  useEffect(() => {
    if (!mobileResultOpen) return undefined;
    drawerCloseRef.current?.focus();
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        setMobileResultOpen(false);
        return;
      }
      trapFocus(event, resultDrawerRef.current);
    };
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      mobileResultTriggerRef.current?.focus();
    };
  }, [mobileResultOpen]);

  useEffect(() => {
    if (!importOpen && !pendingSharedState && !shareLink) return undefined;
    const trigger = document.activeElement;
    const dialog = importOpen
      ? importDialogRef.current
      : shareLink
        ? shareDialogRef.current
        : versionDialogRef.current;
    dialog?.querySelector(FOCUSABLE_SELECTOR)?.focus();
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        setImportOpen(false);
        setPendingSharedState(null);
        setShareLink("");
        return;
      }
      trapFocus(event, dialog);
    };
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      if (trigger instanceof HTMLElement && trigger.isConnected) {
        trigger.focus();
      } else {
        document
          .querySelector('[aria-label="打开菜单"]')
          ?.focus();
      }
    };
  }, [importOpen, pendingSharedState, shareLink]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    menuRef.current?.querySelector("button")?.focus();

    const onKeyDown = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setMenuOpen(false);
      menuButtonRef.current?.focus();
    };
    const onMouseDown = (event) => {
      if (
        menuRef.current?.contains(event.target) ||
        menuButtonRef.current?.contains(event.target)
      ) {
        return;
      }
      setMenuOpen(false);
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onMouseDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onMouseDown);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(""), 2200);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    function onBeforeInstallPrompt(event) {
      event.preventDefault();
      setInstallPromptEvent(event);
    }

    function onAppInstalled() {
      setInstallPromptEvent(null);
      setIsStandaloneWebApp(true);
      setToast("已安装为 WebApp");
    }

    const displayMode = window.matchMedia?.("(display-mode: standalone)");
    const onDisplayModeChange = (event) => {
      setIsStandaloneWebApp(event.matches || window.navigator?.standalone === true);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);
    displayMode?.addEventListener?.("change", onDisplayModeChange);
    displayMode?.addListener?.(onDisplayModeChange);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
      displayMode?.removeEventListener?.("change", onDisplayModeChange);
      displayMode?.removeListener?.(onDisplayModeChange);
    };
  }, []);

  const spiritIndex = useMemo(
    () => createSpiritSearchIndex(snapshot.spirits),
    [snapshot.spirits],
  );
  const spirits = spiritIndex.values();
  const completeSpiritIds = useMemo(
    () =>
      new Set(
        Object.values(spiritConfigsState.configs)
          .filter(isCompleteSpiritConfig)
          .map((config) => config.spiritId),
      ),
    [spiritConfigsState],
  );
  const selectableSpirits = useMemo(
    () =>
      spiritIndex.values().map((spirit) => ({
        ...spirit,
        favoriteState: favoriteSpiritIds.has(spirit.id)
          ? "manual"
          : completeSpiritIds.has(spirit.id)
            ? "complete"
            : null,
      })),
    [completeSpiritIds, favoriteSpiritIds, spiritIndex],
  );
  const attacker = spirits.find(
    (spirit) => spirit.id === state.sides.attacker.spiritId,
  );
  const defender = spirits.find(
    (spirit) => spirit.id === state.sides.defender.spiritId,
  );
  const configurationReady = Boolean(attacker && defender);
  const attackerPanelStats = configurationReady
    ? calculateAllPanelStats({
        raceStats: attacker.raceStats,
        displayIvs: state.sides.attacker.displayIvs,
        natureMultipliers: getNatureMultipliers(state.sides.attacker.nature),
      })
    : null;
  const defenderPanelStats = configurationReady
    ? calculateAllPanelStats({
        raceStats: defender.raceStats,
        displayIvs: state.sides.defender.displayIvs,
        natureMultipliers: getNatureMultipliers(state.sides.defender.nature),
      })
    : null;
  const attackerHealth = configurationReady
    ? {
        currentHp:
          state.directions.reverse.currentHp ?? attackerPanelStats.hp,
        maxHp: attackerPanelStats.hp,
        percent:
          state.directions.reverse.context?.currentHpPercent ??
          Number(
            (
              ((state.directions.reverse.currentHp ??
                attackerPanelStats.hp) /
                attackerPanelStats.hp) *
              100
            ).toFixed(1),
          ),
      }
    : null;
  const defenderHealth = configurationReady
    ? {
        currentHp:
          state.directions.forward.currentHp ?? defenderPanelStats.hp,
        maxHp: defenderPanelStats.hp,
        percent:
          state.directions.forward.context?.currentHpPercent ??
          Number(
            (
              ((state.directions.forward.currentHp ??
                defenderPanelStats.hp) /
                defenderPanelStats.hp) *
              100
            ).toFixed(1),
          ),
      }
    : null;
  const activeAttackSideKey =
    activeDirection === "forward" ? "attacker" : "defender";
  const activeDefenseSideKey =
    activeDirection === "forward" ? "defender" : "attacker";
  const activeAttackSide = state.sides[activeAttackSideKey];
  const activeAttackSpirit =
    activeAttackSideKey === "attacker" ? attacker : defender;
  const activeDefenseSpirit =
    activeDefenseSideKey === "defender" ? defender : attacker;
  const attackerSkillChoices = useMemo(
    () =>
      state.sides.attacker.spiritId
        ? getSkillChoices(snapshot, state.sides.attacker.spiritId)
        : [],
    [snapshot, state.sides.attacker.spiritId],
  );
  const defenderSkillChoices = useMemo(
    () =>
      state.sides.defender.spiritId
        ? getSkillChoices(snapshot, state.sides.defender.spiritId)
        : [],
    [snapshot, state.sides.defender.spiritId],
  );
  const activeAttackSkills =
    activeAttackSideKey === "attacker"
      ? attackerSkillChoices
      : defenderSkillChoices;
  const selectedSingleSkill =
    getSkill(snapshot, activeAttackSide.skills.single) ??
    activeAttackSkills[0] ??
    snapshot.skills[0];
  const calculation = useMemo(() => {
    if (!configurationReady) {
      return unresolvedCalculation(new Error("请选择双方精灵"));
    }
    try {
      return calculateMatchup(snapshot, buildCombatState(state));
    } catch (error) {
      return unresolvedCalculation(error);
    }
  }, [configurationReady, snapshot, state]);
  const resultModel = configurationReady
    ? asResultRailModel({
        calculation,
        direction: activeDirection,
        snapshot,
        state,
      })
    : null;
  const currentDirection = state.directions[activeDirection];
  const weatherRainTurns = Math.min(
    8,
    Math.max(
      0,
      Math.floor(
        Number(
          state.directions.forward.context?.weatherRainTurns ??
            state.directions.reverse.context?.weatherRainTurns ??
            0,
        ) || 0,
      ),
    ),
  );
  const attackLevelStage =
    currentDirection.overrides.attackLevelStage ?? 0;
  const defenseLevelStage =
    currentDirection.overrides.defenseLevelStage ?? 0;

  async function share() {
    if (!configurationReady) {
      setToast("请先选择双方精灵");
      return;
    }
    try {
      const hash = await encodeShareState(state);
      globalThis.history?.replaceState?.(null, "", hash);
      const nextShareLink = globalThis.location.href;
      if (globalThis.navigator?.clipboard?.writeText) {
        try {
          await globalThis.navigator.clipboard.writeText(nextShareLink);
          setToast("分享链接已复制");
          return;
        } catch {
          setShareLink(nextShareLink);
          setToast("复制受限，请手动复制");
          return;
        }
      }
      setShareLink(nextShareLink);
      setToast("复制受限，请手动复制");
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

  function updateWeatherRainTurns(value) {
    const weatherRainTurns = Math.min(
      8,
      Math.max(0, Math.floor(Number(value) || 0)),
    );
    for (const direction of ["forward", "reverse"]) {
      dispatch({
        direction,
        type: "direction/update",
        value: { context: { weatherRainTurns } },
      });
    }
  }

  function updateTraitContext(direction, key, value) {
    dispatch({
      direction,
      type: "direction/update",
      value: { context: { [key]: value } },
    });

    const mirroredKey = key.startsWith("attackerTrait")
      ? key.replace("attackerTrait", "defenderTrait")
      : key.startsWith("defenderTrait")
        ? key.replace("defenderTrait", "attackerTrait")
        : null;
    if (!mirroredKey) return;

    dispatch({
      direction: direction === "forward" ? "reverse" : "forward",
      type: "direction/update",
      value: { context: { [mirroredKey]: value } },
    });
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

  async function installWebApp() {
    if (isStandaloneWebApp) {
      setToast("已在 WebApp 模式运行");
      return;
    }

    if (!installPromptEvent) {
      setToast("iPhone：分享按钮 → 添加到主屏幕");
      return;
    }

    const promptEvent = installPromptEvent;
    setInstallPromptEvent(null);
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    setToast(choice?.outcome === "accepted" ? "已添加到桌面" : "已取消安装");
  }

  function applySpiritConfiguration(side, configuration, remember = false) {
    const directions = {
      forward: cloneDirection(initialState.directions.forward),
      reverse: cloneDirection(initialState.directions.reverse),
    };
    let nextState = {
      ...stateRef.current,
      directions,
    };
    nextState = calculatorReducer(nextState, {
      side,
      type: "side/apply-preset",
      value: configuration,
    });
    for (const [configuredSide, direction] of [
      ["attacker", "forward"],
      ["defender", "reverse"],
    ]) {
      const rememberedSingle = singleSkillMemory(
        nextState.sides[configuredSide].skills.single,
      );
      if (rememberedSingle) {
        nextState = calculatorReducer(nextState, {
          direction,
          type: "direction/update",
          value: rememberedSingle,
        });
      }
    }
    commitState(nextState, remember ? side : null);
    setActiveDirection("forward");
  }

  function changeSpirit(side, spiritId) {
    const remembered = spiritConfigsRef.current.configs[spiritId];
    const configuration =
      remembered ?? {
        ...createDefaultSpiritSide(initialState.sides[side], snapshot, spiritId),
        natureId: initialState.sides[side].nature,
      };
    applySpiritConfiguration(side, configuration);
  }

  function toggleSpiritFavorite(spirit) {
    if (!favoriteStore) {
      setToast("当前环境无法保存收藏");
      return;
    }
    const next = new Set(favoriteSpiritIds);
    if (next.has(spirit.id)) {
      next.delete(spirit.id);
      favoriteStore.remove(`spirit:${spirit.id}`);
      setToast(`已取消收藏 ${spirit.fullName}`);
    } else {
      next.add(spirit.id);
      favoriteStore.save({
        fullName: spirit.fullName,
        id: `spirit:${spirit.id}`,
        kind: "spirit",
        spiritId: spirit.id,
      });
      setToast(`已收藏 ${spirit.fullName}`);
    }
    setFavoriteSpiritIds(next);
  }

  function updateFourSkillEntry(side, index, patch) {
    const current = stateRef.current.sides[side].skills.four[index];
    const skillId =
      typeof current === "string" ? current : current?.skillId ?? current?.id;
    const details =
      current && typeof current === "object" ? current : { skillId };
    dispatch({
      index,
      side,
      type: "side/set-four-skill",
      value: {
        ...details,
        ...patch,
        skillId,
        context: {
          ...(details.context ?? {}),
          ...(patch.context ?? {}),
        },
        overrides: {
          ...(details.overrides ?? {}),
          ...(patch.overrides ?? {}),
        },
      },
    });
  }

  function setSkillMode(value) {
    dispatch({ type: "mode/set", value });
  }

  function rememberSingleSkill(skillId) {
    const latestDirection = stateRef.current.directions[activeDirection];
    const currentEntry =
      stateRef.current.sides[activeAttackSideKey].skills.single;
    const currentSkillId =
      typeof currentEntry === "string"
        ? currentEntry
        : currentEntry?.skillId ?? currentEntry?.id;
    const overrides = latestDirection.overrides ?? {};
    dispatch({
      side: activeAttackSideKey,
      type: "side/set-single-skill",
      value: {
        context: { ...(latestDirection.context ?? {}) },
        hitCount: latestDirection.hitCount,
        overrides: {
          basePower: overrides.basePower ?? null,
          displayedPower: overrides.displayedPower ?? null,
          powerMode: overrides.powerMode ?? "base",
        },
        skillId: skillId ?? currentSkillId ?? null,
      },
    });
  }

  function activateFourSkill(side, index) {
    const latest = stateRef.current;
    const entry = latest.sides[side].skills.four[index];
    const skill = getSkill(snapshot, entry);
    const context =
      entry && typeof entry === "object" ? entry.context ?? {} : {};
    const resolution = resolveSkillStatusActivation(skill, context);
    if (!resolution) return;
    if (!resolution.applied) {
      setToast(resolution.reason);
      return;
    }

    const selfDirection = side === "attacker" ? "forward" : "reverse";
    const oppositeDirection =
      selfDirection === "forward" ? "reverse" : "forward";
    const selfOverrides =
      latest.directions[selfDirection].overrides ?? {};
    const oppositeOverrides =
      latest.directions[oppositeDirection].overrides ?? {};
    const { deltas } = resolution;

    if (deltas.ownAttack !== 0 || deltas.targetDefense !== 0) {
      dispatch({
        direction: selfDirection,
        type: "direction/update",
        value: {
          overrides: {
            attackLevelStage: clampStage(
              (selfOverrides.attackLevelStage ?? 0) + deltas.ownAttack,
            ),
            defenseLevelStage: clampStage(
              (selfOverrides.defenseLevelStage ?? 0) + deltas.targetDefense,
            ),
          },
        },
      });
    }
    if (deltas.targetAttack !== 0 || deltas.ownDefense !== 0) {
      dispatch({
        direction: oppositeDirection,
        type: "direction/update",
        value: {
          overrides: {
            attackLevelStage: clampStage(
              (oppositeOverrides.attackLevelStage ?? 0) + deltas.targetAttack,
            ),
            defenseLevelStage: clampStage(
              (oppositeOverrides.defenseLevelStage ?? 0) + deltas.ownDefense,
            ),
          },
        },
      });
    }

    updateFourSkillEntry(side, index, {
      context: {
        skillUseCount: Math.max(
          0,
          Math.floor(Number(context.skillUseCount) || 0),
        ) + 1,
      },
    });
    setActiveDirection(selfDirection);
    setToast(`${skill.name}的能力等级已应用`);
  }

  function updateRememberedSingleDirection(value) {
    updateDirection(value);
    rememberSingleSkill();
  }

  function selectSingleSkill(skillId) {
    const nextSkill = getSkill(snapshot, skillId);
    const nextContext = { ...currentDirection.context };
    for (const input of [
      ...getSkillEffectInputs(selectedSingleSkill),
      ...getSkillEffectInputs(nextSkill),
    ]) {
      delete nextContext[input.key];
    }
    dispatch({
      direction: activeDirection,
      type: "direction/set-context",
      value: nextContext,
    });
    updateDirection({
      hitCount: getDefaultHitCount(nextSkill),
      overrides: { basePower: null, displayedPower: null },
    });
    rememberSingleSkill(skillId);
  }

  const singleEditor = configurationReady ? (
    <SingleSkillEditor
      attackerHealth={
        activeDirection === "forward" ? attackerHealth : defenderHealth
      }
      attackerTrait={getTraitView(snapshot, activeAttackSpirit, "attacker")}
      defenderHealth={
        activeDirection === "forward" ? defenderHealth : attackerHealth
      }
      defenderTrait={getTraitView(snapshot, activeDefenseSpirit, "defender")}
      hitCount={currentDirection.hitCount}
      manualPower={
        currentDirection.overrides.powerMode === "displayed"
          ? currentDirection.overrides.displayedPower ??
            selectedSingleSkill?.basePower ??
            0
          : currentDirection.overrides.basePower ??
            selectedSingleSkill?.basePower ??
            0
      }
      onHitCountChange={(hitCount) =>
        updateRememberedSingleDirection({ hitCount })
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
      onManualPowerChange={(power) =>
        updateRememberedSingleDirection({
          overrides:
            currentDirection.overrides.powerMode === "displayed"
              ? { displayedPower: power }
              : { basePower: power },
        })
      }
      onPowerModeChange={(powerMode) =>
        updateRememberedSingleDirection({ overrides: { powerMode } })
      }
      onSkillSelect={selectSingleSkill}
      onTraitContextChange={(key, value) => {
        updateTraitContext(activeDirection, key, value);
        rememberSingleSkill();
      }}
      result={resultModel.selectedResult}
      selectedSkill={selectedSingleSkill}
      skills={activeAttackSkills}
      powerMode={currentDirection.overrides.powerMode ?? "base"}
      traitContext={currentDirection.context}
    />
  ) : null;

  const fourEditor = configurationReady ? (
    <FourSkillEditor
      activeSide={activeAttackSideKey}
      activeSkillIndex={currentDirection.selectedSkillIndex}
      attackerHealth={attackerHealth}
      attackerHitCount={state.directions.forward.hitCount}
      attackerName={attacker.fullName}
      attackerResults={calculation.forward.results}
      attackerSkillChoices={attackerSkillChoices}
      attackerSkills={state.sides.attacker.skills.four.map((entry) =>
        getSkillSlotView(snapshot, entry),
      )}
      attackerTrait={getTraitView(snapshot, attacker, "attacker")}
      attackerTraitContext={state.directions.forward.context}
      attackerDefenseTrait={getTraitView(snapshot, defender, "defender")}
      defenderHitCount={state.directions.reverse.hitCount}
      defenderHealth={defenderHealth}
      defenderName={defender.fullName}
      defenderResults={calculation.reverse.results}
      defenderSkillChoices={defenderSkillChoices}
      defenderSkills={state.sides.defender.skills.four.map((entry) =>
        getSkillSlotView(snapshot, entry),
      )}
      defenderTrait={getTraitView(snapshot, defender, "attacker")}
      defenderTraitContext={state.directions.reverse.context}
      defenderDefenseTrait={getTraitView(snapshot, attacker, "defender")}
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
          value: { selectedSkillIndex: index },
        });
      }}
      onSkillSelect={(side, index, skillId) =>
        dispatch({
          index,
          side,
          type: "side/set-four-skill",
          value: {
            hitCount: getDefaultHitCount(getSkill(snapshot, skillId)),
            skillId,
          },
        })
      }
      onSkillHitCountChange={(side, index, hitCount) =>
        updateFourSkillEntry(side, index, { hitCount })
      }
      onSkillPowerChange={(side, index, power) =>
        updateFourSkillEntry(side, index, {
          overrides: { basePower: power },
        })
      }
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
      activeSide={activeAttackSideKey}
      activeSkillIndex={currentDirection.selectedSkillIndex}
      attackerName={attacker.fullName}
      attackerResults={calculation.forward.results}
      attackerSkillChoices={attackerSkillChoices}
      attackerSkills={state.sides.attacker.skills.four.map((entry) =>
        getSkillSlotView(snapshot, entry),
      )}
      defenderName={defender.fullName}
      defenderResults={calculation.reverse.results}
      defenderSkillChoices={defenderSkillChoices}
      defenderSkills={state.sides.defender.skills.four.map((entry) =>
        getSkillSlotView(snapshot, entry),
      )}
      onSkillFocus={(side, index) => {
        const direction = side === "attacker" ? "forward" : "reverse";
        setActiveDirection(direction);
        dispatch({
          direction,
          type: "direction/update",
          value: { selectedSkillIndex: index },
        });
      }}
      onSkillSelect={(side, index, skillId) =>
        dispatch({
          index,
          side,
          type: "side/set-four-skill",
          value: {
            hitCount: getDefaultHitCount(getSkill(snapshot, skillId)),
            skillId,
          },
        })
      }
    />
  ) : null;

  return (
    <>
      <AppHeader
        dataVersion={`S3 · ${snapshot.meta.bwikiRevision ?? snapshot.meta.snapshotVersion}`}
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
      {menuOpen ? (
        <nav
          aria-label="应用菜单"
          className="app-menu"
          id="app-menu"
          ref={menuRef}
        >
          <button
            onClick={() => {
              const nextConfigs = spiritConfigStore?.clear() ?? {
                configs: {},
                schemaVersion: 1,
              };
              spiritConfigsRef.current = nextConfigs;
              setSpiritConfigsState(nextConfigs);
              dispatch({ type: "state/replace", value: initialState });
              setMenuOpen(false);
            }}
            type="button"
          >
            重置全部配置
          </button>
          <button
            onClick={() => {
              share();
              setMenuOpen(false);
            }}
            type="button"
          >
            复制分享链接
          </button>
          <button
            onClick={() => {
              installWebApp();
              setMenuOpen(false);
            }}
            type="button"
          >
            安装 WebApp
          </button>
          <button
            onClick={() => {
              setImportOpen(true);
              setMenuOpen(false);
            }}
            type="button"
          >
            导入分享链接
          </button>
          <button
            onClick={() => {
              setToast(`BWIKI 修订 ${snapshot.meta.bwikiRevision ?? "—"}`);
              setMenuOpen(false);
            }}
            type="button"
          >
            数据来源
          </button>
          <button
            onClick={() => {
              setToast(`当前赛季 ${snapshot.meta.seasonId ?? "S3"}`);
              setMenuOpen(false);
            }}
            type="button"
          >
            赛季记录
          </button>
        </nav>
      ) : null}

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
            onSwap={() => dispatch({ type: "sides/swap" })}
            spirits={selectableSpirits}
          />
          {configurationReady && viewMode === "compact" ? (
            <section
              aria-label="即时配置"
              className="compact-workspace calculator-step"
            >
              <div className="compact-adjustment-grid">
                {["attacker", "defender"].map((side) => {
                  const label = side === "attacker" ? "攻击方" : "防御方";
                  return (
                    <div className="compact-adjustment-side" key={side}>
                      <QuickNaturePicker
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
              }),
            }}
            defender={{
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
            onAttackerLevelChange={(stage) =>
              updatePowerLevel(
                activeDirection === "forward" ? "attack" : "defense",
                stage,
              )
            }
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
            onDefenderLevelChange={(stage) =>
              updatePowerLevel(
                activeDirection === "forward" ? "defense" : "attack",
                stage,
              )
            }
              />
              <SkillStep
                activeMode={state.mode}
                fourSkillContent={fourEditor}
                onModeChange={setSkillMode}
                singleSkillContent={singleEditor}
              />
              <AdvancedOptions
                finalMultiplier={currentDirection.finalDamageMultiplier}
                marks={state.marks}
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
                onRainTurnsChange={updateWeatherRainTurns}
                onReductionChange={(percent) =>
                  dispatch({
                    direction: activeDirection,
                    type: "direction/set-reduction",
                    value: Math.max(0, 1 - percent / 100),
                  })
                }
                rainTurns={weatherRainTurns}
                reductionPercent={Math.round(
                  (1 - currentDirection.reduction) * 100,
                )}
                result={resultModel.selectedResult}
              />
            </>
          ) : null}
        </main>

        {configurationReady ? (
          <div className="result-column">
            <ResultRail
              onCurrentHpChange={(currentHp) => updateDirection({ currentHp })}
              onCurrentHpPercentChange={(currentHpPercent) =>
                updateDirection({ context: { currentHpPercent } })
              }
              onDirectionToggle={() =>
                setActiveDirection((direction) =>
                  direction === "forward" ? "reverse" : "forward",
                )
              }
              result={resultModel}
            />
          </div>
        ) : null}
      </div>

      {configurationReady ? (
        <button
          aria-label="展开伤害结果"
          className={`mobile-result-bar mobile-result-bar--${viewMode}`}
          onClick={() => setMobileResultOpen(true)}
          ref={mobileResultTriggerRef}
          type="button"
        >
          <span className="mobile-result-bar__matchup">
            {resultModel.attackerName} → {resultModel.defenderName}
          </span>
          <strong className="mobile-result-bar__damage">
            {resultModel.selectedResult.totalDamage ?? "—"}
          </strong>
          <span className="mobile-result-bar__percent">
            {Number.isFinite(resultModel.selectedResult.hpPercent)
              ? `${resultModel.selectedResult.hpPercent.toFixed(1)}%`
              : "待输入"}
          </span>
        </button>
      ) : null}

      {configurationReady && mobileResultOpen ? (
        <div
          aria-label="完整伤害结果"
          aria-modal="true"
          className="result-drawer"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setMobileResultOpen(false);
            }
          }}
          ref={resultDrawerRef}
          role="dialog"
        >
          <button
            aria-label="关闭伤害结果"
            className="result-drawer__close"
            onClick={() => setMobileResultOpen(false)}
            ref={drawerCloseRef}
            title="关闭结果"
            type="button"
          >
            <X aria-hidden="true" size={22} weight="bold" />
          </button>
          <ResultRail
            onCurrentHpChange={(currentHp) => updateDirection({ currentHp })}
            onCurrentHpPercentChange={(currentHpPercent) =>
              updateDirection({ context: { currentHpPercent } })
            }
            onDirectionToggle={() =>
              setActiveDirection((direction) =>
                direction === "forward" ? "reverse" : "forward",
              )
            }
            result={resultModel}
          />
        </div>
      ) : null}
      <TeamDrawer
        onActiveTeamChange={(id) => {
          if (teamStore) {
            setTeamsState((current) => teamStore.setActive(current, id));
          }
        }}
        onApply={(side, member) => {
          applySpiritConfiguration(side, member, true);
          setTeamOpen(false);
          const spirit = snapshot.spirits.find(
            (candidate) => candidate.id === member.spiritId,
          );
          setToast(
            `已载入${side === "attacker" ? "攻击方" : "防御方"} ${
              spirit?.fullName ?? "队伍成员"
            }`,
          );
        }}
        onClose={() => setTeamOpen(false)}
        onCaptureSide={(side, teamId, index) => {
          if (!teamStore) {
            setToast("当前环境无法保存队伍");
            return;
          }
          const member = createTeamMemberFromSide(state.sides[side]);
          if (!member) {
            setToast("请先选择精灵");
            return;
          }
          setTeamsState((current) =>
            teamStore.updateMember(current, teamId, index, member),
          );
          const spirit = snapshot.spirits.find(
            (candidate) => candidate.id === member.spiritId,
          );
          setToast(
            `已把${side === "attacker" ? "攻击方" : "防御方"} ${
              spirit?.fullName ?? "当前精灵"
            } 存入${index + 1}号位`,
          );
        }}
        onCreateTeam={(name) => {
          if (teamStore) {
            setTeamsState((current) => teamStore.create(current, name));
          } else {
            setToast("当前环境无法保存队伍");
          }
        }}
        onDeleteTeam={(id) => {
          if (teamStore) {
            setTeamsState((current) => teamStore.remove(current, id));
          }
        }}
        onDuplicateTeam={(id) => {
          if (teamStore) {
            setTeamsState((current) => teamStore.duplicate(current, id));
          }
        }}
        onMemberChange={(teamId, index, member) => {
          if (teamStore) {
            setTeamsState((current) =>
              teamStore.updateMember(current, teamId, index, member),
            );
          }
        }}
        onRenameTeam={(id, name) => {
          if (teamStore) {
            setTeamsState((current) => teamStore.rename(current, id, name));
          }
        }}
        open={teamOpen}
        returnFocusRef={teamsButtonRef}
        snapshot={snapshot}
        teamsState={teamsState}
      />
      {importOpen ? (
        <div
          className="dialog-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setImportOpen(false);
          }}
        >
          <form
            aria-label="导入分享链接"
            aria-modal="true"
            className="share-dialog"
            onSubmit={(event) => {
              event.preventDefault();
              loadSharedState(importDraft)
                .then(() => {
                  setImportOpen(false);
                  setImportDraft("");
                })
                .catch((error) =>
                  setToast(error instanceof Error ? error.message : "导入失败"),
                );
            }}
            ref={importDialogRef}
            role="dialog"
          >
            <h2>导入分享链接</h2>
            <label>
              <span>链接</span>
              <input
                aria-label="分享链接"
                autoFocus
                onChange={(event) => setImportDraft(event.target.value)}
                placeholder="粘贴完整链接或 #v1…"
                value={importDraft}
              />
            </label>
            <div>
              <button className="secondary-action" type="submit">
                导入
              </button>
              <button
                className="secondary-action"
                onClick={() => setImportOpen(false)}
                type="button"
              >
                取消
              </button>
            </div>
          </form>
        </div>
      ) : null}
      {shareLink ? (
        <div
          className="dialog-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setShareLink("");
          }}
        >
          <section
            aria-label="复制分享链接"
            aria-modal="true"
            className="share-dialog"
            ref={shareDialogRef}
            role="dialog"
          >
            <h2>分享链接</h2>
            <label>
              <span>链接</span>
              <input
                aria-label="生成的分享链接"
                autoFocus
                onFocus={(event) => event.currentTarget.select()}
                readOnly
                value={shareLink}
              />
            </label>
            <p>链接已选中，可直接复制</p>
            <div>
              <button
                className="secondary-action"
                onClick={() => setShareLink("")}
                type="button"
              >
                关闭
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {pendingSharedState ? (
        <div
          className="dialog-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setPendingSharedState(null);
            }
          }}
        >
          <section
            aria-label="分享版本不一致"
            aria-modal="true"
            className="share-dialog"
            ref={versionDialogRef}
            role="dialog"
          >
            <h2>分享版本不一致</h2>
            <p>
              原数据 {pendingSharedState.versions.data} · 规则{" "}
              {pendingSharedState.versions.rules}
            </p>
            <p>
              当前数据 {initialState.versions.data} · 规则{" "}
              {initialState.versions.rules}
            </p>
            <small>
              旧快照未内置。可保留全部输入并按当前版本重算，结果会在右侧即时更新。
            </small>
            <div>
              <button
                className="secondary-action"
                onClick={() => {
                  dispatch({
                    type: "state/replace",
                    value: migrateSharedState(
                      pendingSharedState,
                      initialState.versions,
                    ),
                  });
                  setPendingSharedState(null);
                  globalThis.history?.replaceState?.(
                    null,
                    "",
                    `${globalThis.location.pathname}${globalThis.location.search}`,
                  );
                  setToast("已按当前版本重算，请核对右侧结果");
                }}
                type="button"
              >
                按当前版本重算
              </button>
              <button
                className="secondary-action"
                onClick={() => setPendingSharedState(null)}
                type="button"
              >
                取消
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {toast ? <div className="toast">{toast}</div> : null}
    </>
  );
}

export function App({ initialAssetManifest = null, initialSnapshot = null }) {
  const [snapshot, setSnapshot] = useState(() =>
    initialSnapshot
      ? attachLocalAssets(initialSnapshot, initialAssetManifest)
      : null,
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
        return attachLocalAssets(loadedSnapshot, initialAssetManifest);
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
  }, [initialAssetManifest, initialSnapshot]);

  if (!snapshot) {
    return (
      <div className="app">
        <AppHeader dataVersion="加载中" />
        <main className="loading-state">
          <p>{error || "正在加载 S3 数据…"}</p>
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
