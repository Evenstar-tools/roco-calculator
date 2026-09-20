import {
  ArrowLeft,
  Crosshair,
  Eye,
  EyeSlash,
  Info,
  LockSimple,
  LockSimpleOpen,
  MagnifyingGlass,
} from "@phosphor-icons/react";
import { createSpeedTargetCatalog, speedQuery, speedReference, speedBadge, speedMatchSummary } from "../features/team-ability/domain/ranking-tools.js";
import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  analyzeSpeedBreakpoints,
  isDurabilityBuildApplicable,
  recommendDurabilityBuilds,
} from "../features/team-ability/domain/ability-analysis.js";
import {
  BINARY_60_MAX3_RULESET_ID,
  transitionAbilityInvestment,
  validateAbilityInvestment,
} from "../features/team-ability/domain/ability-investment.js";
import {
  createDurabilityRanking,
  selectDurabilityRanking,
} from "../features/team-ability/domain/durability-ranking.js";
import { calculateDurability } from "../features/team-ability/domain/durability.js";
import {
  findNearestSpeedTarget,
  groupSpeedTargets,
  SPEED_TARGET_PROFILES,
} from "../features/team-ability/domain/speed-targets.js";
import { createSpeedModifiers } from "../features/team-ability/domain/speed-modifiers.js";
import {
  getNature,
  getNatureMultipliers,
  STAT_LABELS,
} from "../domain/natures.js";
import {
  calculateAllPanelStats,
  hasCompleteRaceStats,
} from "../domain/stat.js";
import { NatureSelect } from "./NatureSelect.jsx";
import { StatIcon } from "./StatIcon.jsx";
const DurabilityRankingView = lazy(() => import("./RankingsPanel.jsx").then((module) => ({ default: module.DurabilityRankingView })));

const INVESTMENT_STATS = Object.freeze([
  { key: "physicalAttack", label: "物攻" },
  { key: "magicalAttack", label: "魔攻" },
  { key: "speed", label: "速度" },
  { key: "hp", label: "生命" },
  { key: "physicalDefense", label: "物防" },
  { key: "magicalDefense", label: "魔防" },
]);

const BUILD_OBJECTIVES = Object.freeze([
  { key: "combined", label: "综合承伤", goal: "综合耐久", recommended: true },
  { key: "physical", label: "物理承伤", goal: "物理耐久" },
  { key: "magical", label: "魔法承伤", goal: "魔法耐久" },
]);

const METRIC_ENTRIES = Object.freeze([
  ["combined", "综合耐久"],
  ["physical", "物理耐久"],
  ["magical", "魔法耐久"],
]);

const METRIC_LABELS = Object.freeze(Object.fromEntries(METRIC_ENTRIES));

const SPEED_STATUS_LABELS = Object.freeze({
  CURRENTLY_REACHED: "当前已达标",
  INVALID_INVESTMENT: "请先修正个体值分配",
  NO_INVESTMENT_SLOT: "速度未达标 · 无可用位置",
  REQUIRES_SPEED_INVESTMENT: "需要启用速度60",
  UNREACHABLE_WITH_SPEED_INVESTMENT: "即使速度60也无法达到",
});

const SPECIAL_SPEED_PROFILE_ID = "special";
const SPEED_PROFILE_OPTIONS = Object.freeze([
  ...Object.values(SPEED_TARGET_PROFILES),
  Object.freeze({ id: SPECIAL_SPEED_PROFILE_ID, label: "特殊口径" }),
]);
const DEFAULT_SPEED_PROFILE_IDS = Object.freeze([
  "positive-max",
  "neutral-max",
  "neutral-zero",
  SPECIAL_SPEED_PROFILE_ID,
]);

const OVERVIEW_FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function trapOverviewFocus(event, container) {
  if (event.key !== "Tab" || !container) return;
  const focusable = [...container.querySelectorAll(OVERVIEW_FOCUSABLE_SELECTOR)]
    .filter((element) => !element.closest("details:not([open])") || element.matches("summary"));
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

function speedTargetLabel(target) {
  return target
    ? `${target.name} · ${target.speed}（${target.profileLabel}${target.specialLabel ? ` · ${target.specialLabel}` : ""}）`
    : "";
}

function speedTargetMeta(target, { compact = false } = {}) {
  const role = target.formRole === "boss" ? " · 首领" : "";
  const context = target.specialLabel && compact
    ? target.specialLabel
    : `${target.profileLabel}${target.specialLabel ? ` · ${target.specialLabel}` : ""}`;
  return `${target.spirit.raceStats.speed}族${role} · ${context}`;
}

function cloneConfiguration(configuration) {
  if (!configuration) return null;
  return {
    ...configuration,
    displayIvs: Object.fromEntries(
      INVESTMENT_STATS.map(({ key }) => [
        key,
        Number(configuration.displayIvs?.[key] ?? 0),
      ]),
    ),
    natureId: configuration.natureId ?? configuration.nature ?? "neutral",
    skills: configuration.skills
      ? {
          ...configuration.skills,
          four: [...(configuration.skills.four ?? [])],
        }
      : { four: [], single: null },
  };
}

function configurationSignature(configuration, source) {
  return JSON.stringify({
    displayIvs: configuration
      ? Object.fromEntries(
          INVESTMENT_STATS.map(({ key }) => [
            key,
            Number(configuration.displayIvs?.[key] ?? 0),
          ]),
        )
      : null,
    natureId: configuration
      ? (configuration.natureId ?? configuration.nature ?? "neutral")
      : null,
    source,
    spiritId: configuration?.spiritId ?? null,
  });
}

function sourceIdentitySignature(configuration, source) {
  return JSON.stringify({
    source,
    spiritId: configuration?.spiritId ?? null,
  });
}

function serializedConfiguration(configuration) {
  // Persistence may reorder keys; equivalent saved configurations are still the same acknowledgement.
  return JSON.stringify(cloneConfiguration(configuration), (_, value) =>
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)))
      : value);
}

function calculationConfiguration(configuration, spirit) {
  return {
    ...configuration,
    natureId: configuration.natureId ?? configuration.nature ?? "neutral",
    raceStats: spirit.raceStats,
  };
}

function formatNumber(value) {
  return Number.isFinite(value) ? Math.round(value).toLocaleString("zh-CN") : "—";
}

function assetUrl(spirit) {
  return spirit?.asset?.localUrl ?? spirit?.assetUrl ?? null;
}

function exclusionLabel(reason) {
  if (reason === "GROWTH_FORM") return "成长形态不参与标准榜";
  if (reason === "INCOMPLETE_RACE_STATS") return "种族值尚未确认";
  return "尚未确认为最终形态或首领";
}

function getSourceActionLabel(source) {
  if (source?.kind === "side") {
    return source.side === "attacker" ? "应用回攻击方" : "应用回防御方";
  }
  return "应用到成员";
}

function isCurrentBuild(result, configuration) {
  if (!result || !configuration) return false;
  return (
    getNature(result.natureId).id ===
      getNature(configuration.natureId ?? configuration.nature).id &&
    INVESTMENT_STATS.every(
      ({ key }) => Number(result.values[key]) === Number(configuration.displayIvs?.[key]),
    )
  );
}

function CurrentSummary({ durability, panel, label }) {
  return (
    <section aria-label={`${label}摘要`} className="ability-current-summary">
      <strong>{label}</strong>
      {[
        ["速度", panel?.speed], ["综合耐久", durability?.display.combined],
        ["物理耐久", durability?.display.physical], ["魔法耐久", durability?.display.magical],
      ].map(([label, value]) => (
        <span key={label}>
          <small>{label}</small><b>{formatNumber(value)}</b>
        </span>
      ))}
    </section>
  );
}

function InvestmentPicker({ natureId, onChange, onReplace, panel, validation, values }) {
  const [replacementStat, setReplacementStat] = useState(null);
  const replacementLabel = INVESTMENT_STATS.find(
    ({ key }) => key === replacementStat,
  )?.label;

  function selectStat(key, selected) {
    if (selected && validation.remainingSlots === 0) {
      setReplacementStat(key);
      return;
    }
    setReplacementStat(null);
    onChange(key, selected);
  }

  return (
    <section className="ability-investment-panel">
      <header>
        <div>
          <strong>个体值分配</strong>
          <small>0 / 60 · 最多三项</small>
        </div>
        <span>
          已用 {validation.activeCount} / {validation.maxActiveStats}
        </span>
      </header>
      <div aria-label="个体值分配" className="ability-investments" role="group">
        {INVESTMENT_STATS.map(({ key, label }) => {
          const selected = Number(values[key]) > 0;
          return (
            <button
              aria-label={`${selected ? "取消" : "选择"}${label}个体值，当前${values[key]}`}
              aria-pressed={selected}
              key={key}
              onClick={() => selectStat(key, !selected)}
              type="button"
            >
              <span className="ability-investments__label">
                <StatIcon gain={getNature(natureId).upStat === key} size={17} stat={key} />
                <span>{label}</span>
              </span>
              <span aria-label={`${label}实际值`} className="ability-investments__value">
                {formatNumber(panel?.[key])}
              </span>
              <span className="ability-investments__iv">
                <small>个体</small>
                <strong>{values[key]}</strong>
              </span>
            </button>
          );
        })}
      </div>
      {replacementStat ? (
        <div aria-label="替换个体值" className="ability-investment-replace" role="dialog">
          <span>要将{replacementLabel}设为 60，请选择替换一项：</span>
          <div>
            {INVESTMENT_STATS.filter(({ key }) => Number(values[key]) > 0).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => {
                  onReplace(key, replacementStat);
                  setReplacementStat(null);
                }}
                type="button"
              >
                替换{label}
              </button>
            ))}
            <button onClick={() => setReplacementStat(null)} type="button">取消</button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function SpeedProfilePicker({ onProfilesChange, profileIds }) {
  return (
    <div className="ability-speed__profile-picker">
      <span>口径</span>
      <details>
        <summary aria-label="速度目标口径">
          {profileIds
            .map((id) => SPEED_PROFILE_OPTIONS.find((entry) => entry.id === id)?.label)
            .filter(Boolean)
            .join("、")}
        </summary>
        <fieldset>
          <legend>速度口径</legend>
          {SPEED_PROFILE_OPTIONS.map((entry) => (
            <label key={entry.id}>
              <input
                checked={profileIds.includes(entry.id)}
                disabled={profileIds.length === 1 && profileIds.includes(entry.id)}
                onChange={(event) => {
                  const next = event.target.checked
                    ? [...profileIds, entry.id]
                    : profileIds.filter((id) => id !== entry.id);
                  onProfilesChange(next);
                }}
                type="checkbox"
              />
              {entry.label}
            </label>
          ))}
        </fieldset>
      </details>
    </div>
  );
}

function SpeedTargetPicker({ onTargetChange, selected, targets }) {
  const [targetInput, setTargetInput] = useState(null);
  const targetOptions = targetInput === null
    ? []
    : targets.filter((target) => {
        const query = targetInput.trim();
        if (!query) return true;
        return `${target.name}${target.speed}${target.qualifier}`.includes(query);
      }).slice(0, 12);

  function lockTarget(target) {
    onTargetChange(target.id);
    setTargetInput(null);
  }

  return (
    <div
      className="ability-speed__target-picker"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setTargetInput(null);
      }}
    >
      <span>目标精灵</span>
      <div className="ability-speed__target-input">
        <MagnifyingGlass aria-hidden="true" size={15} />
        <input
          aria-label="速度目标精灵"
          title={speedTargetLabel(selected)}
          onChange={(event) => setTargetInput(event.target.value)}
          onFocus={() => setTargetInput("")}
          onKeyDown={(event) => {
            if (event.key === "Escape" && targetInput !== null) {
              event.preventDefault();
              event.stopPropagation();
              setTargetInput(null);
              return;
            }
            if (event.key === "Enter" && targetOptions[0]) {
              event.preventDefault();
              lockTarget(targetOptions[0]);
            }
          }}
          placeholder="搜索"
          role="combobox"
          type="search"
          value={targetInput ?? speedTargetLabel(selected)}
        />
        {targetInput !== null ? (
          <div
            aria-label="速度目标候选"
            className="ability-speed__target-options"
            role="listbox"
          >
            {targetOptions.map((target) => (
              <button
                aria-label={`选择${target.name} ${target.speed} ${target.profileLabel}${target.specialLabel ? ` ${target.specialLabel}` : ""}`}
                aria-selected={target.id === selected?.id}
                data-target-id={target.id}
                key={target.id}
                onClick={() => lockTarget(target)}
                onMouseDown={(event) => event.preventDefault()}
                role="option"
                type="button"
              >
                {assetUrl(target.spirit) ? <img alt="" loading="lazy" decoding="async" src={assetUrl(target.spirit)} /> : null}
                <span>
                  <strong>{target.name}</strong>
                  <small>{speedTargetMeta(target)}</small>
                </span>
                <b>{target.speed}</b>
              </button>
            ))}
            {targetOptions.length === 0 ? <p>无匹配精灵</p> : null}
          </div>
        ) : null}
      </div>
      {targetInput === null && selected ? (
        <span className="ability-speed__selected-target">{speedTargetLabel(selected)}</span>
      ) : null}
    </div>
  );
}

function SpeedRail({
  activeModifierIds,
  currentSpeed,
  currentSpirit,
  isDraft,
  modifiers,
  onOpenOverview,
  onProfilesChange,
  onToggleModifier,
  onTargetChange,
  openOverviewButtonRef,
  profileIds,
  speedAnalysis,
  targets,
  targetId,
}) {
  const railRef = useRef(null);
  const selectedTargetRef = useRef(null);
  const currentMarkerRef = useRef(null);
  const dragRef = useRef({ active: false, moved: false, scrollLeft: 0, startX: 0 });
  const selected = targets.find((target) => target.id === targetId) ?? targets[0];
  const relation = !selected ? null : currentSpeed > selected.speed ? "faster" : currentSpeed === selected.speed ? "equal" : "slower";
  const comparisonLabel = { faster: "可以先手", equal: "同速需拼速", slower: "无法先手" }[relation];
  const targetGroups = useMemo(() => groupSpeedTargets(targets), [targets]);
  const modifierGroups = Object.values(modifiers.reduce((groups, modifier) => {
    (groups[modifier.groupId] ??= []).push(modifier);
    return groups;
  }, {}));
  const railItems = [
    ...targetGroups.map((group) => {
      const target = group.targets.find((item) => item.id === selected?.id) ?? group.targets[0];
      return {
        id: `speed:${group.speed}`,
        kind: "target",
        speed: group.speed,
        target,
      };
    }),
    { id: "current-configuration", kind: "current", speed: currentSpeed },
  ].sort((left, right) => right.speed - left.speed || left.id.localeCompare(right.id));

  useEffect(() => {
    const viewport = railRef.current;
    const target = selectedTargetRef.current;
    if (!viewport || !target) return;
    function centerMarkers() {
      const current = currentMarkerRef.current;
      const left = Math.min(target.offsetLeft, current?.offsetLeft ?? target.offsetLeft);
      const right = Math.max(target.offsetLeft + target.offsetWidth, current ? current.offsetLeft + current.offsetWidth : 0);
      // 相邻时同时展示本体与目标；相距太远时定位目标，避免两个标记都在屏外。
      const center = right - left + 32 <= viewport.clientWidth
        ? (left + right) / 2
        : target.offsetLeft + target.offsetWidth / 2;
      viewport.scrollTo?.({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
        left: center - viewport.clientWidth / 2,
      });
    }
    centerMarkers();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(centerMarkers);
    observer?.observe(viewport);
    return () => observer?.disconnect();
  }, [currentSpeed, profileIds, selected?.id]);

  function startDrag(event) {
    if (event.button !== 0 || event.pointerType === "touch") return;
    dragRef.current = {
      active: true,
      moved: false,
      scrollLeft: railRef.current?.scrollLeft ?? 0,
      startX: event.clientX,
    };
  }

  function moveDrag(event) {
    if (!dragRef.current.active || !railRef.current) return;
    if (event.buttons === 0) {
      dragRef.current.active = false;
      return;
    }
    const delta = event.clientX - dragRef.current.startX;
    if (Math.abs(delta) <= 4 && !dragRef.current.moved) return;
    // 普通点击交给目标按钮，只有实际拖动才接管指针。
    if (!dragRef.current.moved) event.currentTarget.setPointerCapture?.(event.pointerId);
    dragRef.current.moved = true;
    railRef.current.scrollLeft = dragRef.current.scrollLeft - delta;
  }

  function endDrag(event) {
    dragRef.current.active = false;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function selectTarget(targetIdToSelect, event) {
    const dragged = dragRef.current.moved;
    dragRef.current.moved = false;
    // 拦截拖动产生的指针点击，不吞掉键盘或辅助技术的激活。
    if (dragged && event.detail !== 0) return;
    onTargetChange(targetIdToSelect);
  }

  return (
    <section className="ability-section ability-speed" aria-label="速度目标">
      <header className="ability-section__title">
        <span>1</span>
        <div>
          <h4>速度目标</h4>
          <small className="ability-speed__comparison" data-relation={relation}>
            {selected ? `${isDraft ? "试算" : "当前"} ${formatNumber(currentSpeed)} / 目标 ${formatNumber(selected.speed)} · ${comparisonLabel}` : "选择目标后分析"}
          </small>
          {speedAnalysis && speedAnalysis.status !== "CURRENTLY_REACHED" ? (
            <small>{SPEED_STATUS_LABELS[speedAnalysis.status]}</small>
          ) : null}
        </div>
        <div className="ability-speed__controls">
          <SpeedProfilePicker
            onProfilesChange={onProfilesChange}
            profileIds={profileIds}
          />
          <SpeedTargetPicker
            onTargetChange={onTargetChange}
            selected={selected}
            targets={targets}
          />
        </div>
      </header>
      {modifiers.length > 0 ? (
        <div className="ability-speed__modifiers">
          <span>本体额外速度</span>
          <div>
            {modifierGroups.map((group) => {
              const stacked = group.every(({ stack }) => Number.isInteger(stack));
              const active = group.find(({ id }) => activeModifierIds.includes(id));
              if (stacked) {
                const name = group[0].label.replace(/（\d+层）$/, "");
                return (
                  <label className="ability-speed__stack" key={group[0].groupId}>
                    <span>{name}</span>
                    <select
                      aria-label={`${name}层数`}
                      onChange={(event) => {
                        if (!event.target.value) {
                          if (active) onToggleModifier(active, false);
                          return;
                        }
                        onToggleModifier(group.find(({ id }) => id === event.target.value), true);
                      }}
                      value={active?.id ?? ""}
                    >
                      <option value="">未触发</option>
                      {group.map((modifier) => (
                        <option key={modifier.id} value={modifier.id}>
                          {modifier.stack}层 +{modifier.amount}
                        </option>
                      ))}
                    </select>
                  </label>
                );
              }
              return group.map((modifier) => (
                <label key={modifier.id}>
                  <input
                    checked={activeModifierIds.includes(modifier.id)}
                    onChange={(event) => onToggleModifier(modifier, event.target.checked)}
                    type="checkbox"
                  />
                  <span>{modifier.label} +{modifier.amount}</span>
                </label>
              ));
            })}
          </div>
          <strong>
            {isDraft ? "试算" : "当前"} {formatNumber(currentSpeed)}
          </strong>
        </div>
      ) : null}
      <div
        aria-label="速度排行榜横轴"
        className="ability-speed__viewport"
        onKeyDown={(event) => {
          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
          event.preventDefault();
          railRef.current?.scrollBy?.({
            behavior: "smooth",
            left: event.key === "ArrowLeft" ? -240 : 240,
          });
        }}
        onPointerCancel={endDrag}
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        ref={railRef}
        role="region"
        tabIndex="0"
      >
        <div className="ability-speed__rail" role="list" aria-label="速度排行断点">
          <span aria-hidden="true" className="ability-speed__line" />
          {railItems.map((item) => item.kind === "current" ? (
            <div className="ability-speed__marker is-current" key={item.id} ref={currentMarkerRef} role="listitem">
              {assetUrl(currentSpirit) ? <img alt="" src={assetUrl(currentSpirit)} /> : null}
              <b>{formatNumber(item.speed)}</b>
              <span>{isDraft ? "试算配置" : "当前配置"}</span>
            </div>
          ) : (
            <button
              aria-current={item.target.id === selected?.id ? "true" : undefined}
              aria-label={`选择速度目标${item.target.name}，速度${item.target.speed}${item.target.specialLabel ? `，${item.target.specialLabel}` : ""}`}
              className={`ability-speed__marker${item.target.id === selected?.id ? " is-target" : ""}`}
              key={item.id}
              onClick={(event) => selectTarget(item.target.id, event)}
              ref={item.target.id === selected?.id ? selectedTargetRef : null}
              role="listitem"
              type="button"
            >
              {assetUrl(item.target.spirit) ? <img alt="" src={assetUrl(item.target.spirit)} /> : null}
              <b>{item.target.speed}</b>
              <span>{item.target.name}</span>
              <small>
                {speedTargetMeta(item.target, { compact: true })}
              </small>
            </button>
          ))}
        </div>
      </div>
      <button
        className="ability-speed__table-toggle"
        onClick={onOpenOverview}
        ref={openOverviewButtonRef}
        type="button"
      >
        <span>速度一览</span>
        <small>{targetGroups.length}档 · 同优先度，仅比较速度</small>
      </button>
    </section>
  );
}

export function SpeedOverview({
  location,
  onLocateResult,
  onLocateBase,
  detail,
  detailPanel,
  backButtonRef,
  currentSpeed,
  isDraft = false,
  locateTargetId,
  onBack,
  onProfilesChange,
  onTargetChange,
  profileIds,
  targetId,
  targets,
  standalone = false,
  query = "",
  onQueryChange,
  queryMode = "auto",
  onQueryModeChange,
}) {
  const locateTargetRef = useRef(null);
  const referenceRef = useRef(null);
  const scrollRef = useRef(null);
  const [iconOnly, setIconOnly] = useState(standalone);
  const [jump, setJump] = useState(0);
  const selected = standalone ? null : targets.find((target) => target.id === targetId) ?? targets[0];
  const targetGroups = useMemo(() => groupSpeedTargets(targets), [targets]);
  const search = speedQuery(query, queryMode);
  const reference = speedReference(targetGroups, standalone ? location?.speed ?? (search.kind === "actual" ? search.value : null) : null);
  const referenceValue = reference?.value;
  const matchSummary = standalone && query && reference ? speedMatchSummary(targets, reference.value) : "";
  const namedTargets = standalone && query ? [...new Map(targets.filter(target => search.kind === "text" || target.matchReasons?.some(reason => reason === "图鉴号" || reason === "名称 / 别名")).map(target => [target.spiritId, target])).values()] : [];
  const namedLocations = namedTargets.map(target => <button type="button" key={target.spiritId} onClick={() => onLocateResult?.(target.speed, target.id)}>定位 {target.name}</button>);
  const hasBaseMatch = standalone && query && targets.some(target => target.matchReasons?.includes("种族速度"));
  const hasActualMatch = targets.some(target => target.matchReasons?.includes("实际速度"));
  const baseOnlyMatch = hasBaseMatch && !hasActualMatch;
  const displayGroups = baseOnlyMatch ? targetGroups : reference?.groups ?? targetGroups;
  const nearestCurrentTarget = standalone ? null : findNearestSpeedTarget(targets, currentSpeed);
  const resolvedLocateTargetId = targets.some((target) => target.id === locateTargetId)
    ? locateTargetId
    : nearestCurrentTarget?.id;

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      locateTargetRef.current?.scrollIntoView?.({ block: "center" });
    });
    return () => cancelAnimationFrame(frame);
  }, [profileIds, resolvedLocateTargetId]);

  useEffect(() => {
    if (!standalone || referenceValue === undefined || location?.targetId) return;
    const frame = requestAnimationFrame(() => {
      const row = referenceRef.current;
      const scroll = scrollRef.current;
      if (row && scroll) scroll.scrollTop += row.getBoundingClientRect().top - scroll.getBoundingClientRect().top - (scroll.querySelector("thead")?.offsetHeight ?? 0);
    });
    return () => cancelAnimationFrame(frame);
  }, [standalone, search.kind, search.value, profileIds, jump, iconOnly, location, referenceValue]);

  return (
    <section
      aria-label="速度一览"
      className={`ability-full-ranking ability-speed-overview${standalone ? " rank-speed-standalone" : ""}${iconOnly ? " is-icon-only" : ""}`}
      onKeyDown={(event) => {
        if (event.key === "Tab" && !standalone) {
          event.stopPropagation();
          trapOverviewFocus(event, event.currentTarget);
          return;
        }
        if (event.key === "Escape") {
          if (standalone && detail) return;
          event.preventDefault();
          event.stopPropagation();
          onBack();
        }
      }}
      role="region"
    >
      {!standalone ? <header>
        <button onClick={onBack} ref={backButtonRef} type="button">
          <ArrowLeft aria-hidden="true" size={17} />
          返回能力分析
        </button>
        <div>
          <h4>速度一览</h4>
          <small>
            {isDraft ? "试算配置" : "当前配置"} {formatNumber(currentSpeed)} · {targetGroups.length}档
          </small>
        </div>
      </header> : null}

      <div className="ability-speed-overview__controls">
        <button type="button" className="speed-portrait-toggle" aria-label={iconOnly ? "显示精灵文字" : "隐藏精灵文字"} aria-pressed={iconOnly} title={iconOnly ? "显示精灵文字" : "隐藏精灵文字"} onClick={() => setIconOnly(!iconOnly)}>{iconOnly ? <Eye size={19} /> : <EyeSlash size={19} />}</button>
        <SpeedProfilePicker
          onProfilesChange={onProfilesChange}
          profileIds={profileIds}
        />
        {standalone ? <label className="rank-search"><MagnifyingGlass size={16} /><input aria-label="搜索速度榜精灵" placeholder="搜索名称、别名、图鉴号或速度" value={query} onChange={(event) => onQueryChange(event.target.value)} /></label> : <SpeedTargetPicker
          onTargetChange={onTargetChange}
          selected={selected}
          targets={targets}
        />}
      </div>

      {standalone ? <div className="speed-query-guide">

        <div className="speed-reference-summary" role="status">{search.invalid ? <span>请输入非负整数速度值</span> : reference ? <><span>{matchSummary ? <span className="speed-match-summary">{matchSummary.split("；").map(item => { const [label, ...value] = item.split("："); return <span key={label}>{label}：<strong>{value.join("：")}</strong></span>; })}</span> : null}当前结果比 <b>{reference.value}</b> 快 <b>{reference.faster}</b> · 同速 <b>{reference.equal}</b> · 慢 <b>{reference.slower}</b> 个配置</span><span className="speed-locate-actions">{namedLocations}{hasBaseMatch ? <button type="button" onClick={() => onLocateBase?.(reference.value)}>定位种族 {reference.value}</button> : null}{!baseOnlyMatch ? <button type="button" onClick={() => { if (onLocateResult) onLocateResult(reference.value); setJump(jump + 1); }}>定位 {reference.value}</button> : null}</span></> : <><span>{search.kind === "base" && search.value !== null ? `种族速度 ${search.value} · 按实际速度排列` : "输入名称找精灵，输入速度看快慢"}</span><span className="speed-locate-actions">{namedLocations}</span>{!query ? <button type="button" onClick={() => { onQueryModeChange("auto"); onQueryChange("267"); }}>试查 267</button> : null}</>}</div>
      </div> : null}

      {standalone ? <div className="rank-summary"><span>共 {targetGroups.length} 档 · 同速聚合</span><button type="button" onClick={() => {onQueryChange(""); onQueryModeChange("auto"); onProfilesChange(["positive-max", "neutral-max"]);}}>重置</button></div> : <div className="ability-speed-overview__selection" role="status">
        <span>{isDraft ? "试算配置" : "当前配置"} <b>{formatNumber(currentSpeed)}</b></span>
        {selected ? (
          <span>已选目标 <b>{selected.name} · {formatNumber(selected.speed)}</b></span>
        ) : null}
      </div>}

      <div ref={scrollRef} className="ability-speed__table-wrap ability-speed-overview__table-wrap">
        <table aria-label="速度档位表" className="ability-speed__table">
          <colgroup>
            <col className="ability-speed__table-value" />
            <col />
          </colgroup>
          <thead>
            <tr>
              <th>速度</th>
              <th>精灵 · 最终形态与首领</th>
            </tr>
          </thead>
          <tbody>
            {displayGroups.map((group) => (
              <tr
                className={group.speed === reference?.value || group.targets.some((target) => target.id === selected?.id) ? "is-selected" : ""}
                ref={group.speed === reference?.value ? referenceRef : null}
                key={group.speed}
              >
                <th scope="row">
                  <span className="ability-speed-overview__tier-value">{group.speed}{reference ? <small>{group.speed === reference.value ? "基准" : `${group.speed > reference.value ? "+" : ""}${group.speed - reference.value}`}</small> : null}</span>
                </th>
                <td>
                  <div className="ability-speed__tier-spirits">
                    {!group.targets.length ? <span className="rank-note">基准位置 · 没有同速配置</span> : null}
                    {group.targets.map((target) => (
                      <button
                        aria-label={`在速度表选择${target.name}，速度${target.speed}${target.specialLabel ? `，${target.specialLabel}` : ""}`}
                        aria-pressed={target.id === selected?.id || target.id === location?.targetId}
                        key={target.id}
                        onClick={() => onTargetChange(target.id)}
                        ref={target.id === resolvedLocateTargetId ? locateTargetRef : null}
                        title={`${target.matchReasons?.length ? `命中${target.matchReasons.join("、")} · ` : ""}${target.name} · ${target.qualifier} · ${target.formRole === "boss" ? "首领" : "最终形态"}`}
                        type="button"
                      >
                        {assetUrl(target.spirit) ? <img alt="" loading="lazy" decoding="async" src={assetUrl(target.spirit)} /> : null}
                        {iconOnly ? <small className="speed-profile-badge">{speedBadge(target)}</small> : <span>
                          <strong>{target.name}</strong>
                          <small>{speedTargetMeta(target)}</small>
                        </span>}
                      </button>
                    ))}
                  </div>
                  {detail && group.targets.some(target => target.id === detail.id) ? detailPanel : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function BuildCard({ current, currentDurability, objective, onApply, result, source }) {
  if (!result) {
    return (
      <article className="ability-build-card is-empty">
        <h5>{objective.label}</h5>
        <p>当前锁定条件下没有合法方案。</p>
      </article>
    );
  }
  const nature = getNature(result.natureId);
  const natureLabel = nature.id === "neutral"
    ? "普通（无修正）"
    : `${nature.name}（+${STAT_LABELS[nature.upStat]} -${STAT_LABELS[nature.downStat]}）`;
  const applied = isCurrentBuild(result, current);
  return (
    <article className={`ability-build-card${objective?.recommended ? " is-recommended" : ""}`}>
      <header>
        <div>
          <h5>{objective.label}</h5>
          <span>性格：{natureLabel}</span>
        </div>
        {objective.recommended ? <b>推荐</b> : null}
      </header>
      <div className="ability-build-card__allocation">
        {INVESTMENT_STATS.filter(({ key }) => result.values[key] === 60).map(({ key, label }) => (
          <span key={key}>{label} 60</span>
        ))}
      </div>
      <dl>
        <div>
          <dt>速度</dt>
          <dd>{formatNumber(result.effectiveSpeed ?? result.panel.speed)}</dd>
        </div>
        {METRIC_ENTRIES.map(([metric, label]) => {
          const next = result.durability.display[metric];
          const current = currentDurability?.display[metric];
          const delta = Number.isFinite(current) ? next - current : null;
          return (
            <div key={metric}>
              <dt>{label}</dt>
              <dd>
                {formatNumber(next)}
                {Number.isFinite(delta) ? (
                  <small className={delta > 0 ? "is-positive" : delta < 0 ? "is-negative" : ""}>
                    {delta > 0 ? "+" : ""}{formatNumber(delta)}
                  </small>
                ) : null}
              </dd>
            </div>
          );
        })}
      </dl>
      <button disabled={applied} onClick={() => onApply(result)} type="button">
        {applied ? "当前方案" : getSourceActionLabel(source)}
      </button>
    </article>
  );
}

function nearbyRankingRows(rows, currentSpiritId, limit = 4) {
  const currentIndex = rows.findIndex((entry) => entry.spiritId === currentSpiritId);
  if (currentIndex < 0) return rows.slice(0, limit);
  const start = Math.min(
    Math.max(currentIndex - 1, 0),
    Math.max(rows.length - limit, 0),
  );
  return rows.slice(start, start + limit);
}

function RankingPodium({ active, currentSpiritId, metric, rows }) {
  const visibleRows = nearbyRankingRows(rows, currentSpiritId);
  return (
    <section
      aria-label={`${METRIC_LABELS[metric]}当前附近排名`}
      className={`ability-ranking-podium${active ? " is-active" : ""}`}
    >
      <h5>{METRIC_LABELS[metric]}</h5>
      <ol>
        {visibleRows.map((entry) => (
          <li
            aria-current={entry.spiritId === currentSpiritId ? "true" : undefined}
            className={entry.spiritId === currentSpiritId ? "is-current" : ""}
            key={entry.spiritId}
          >
            <span>{entry.globalRank[metric]}</span>
            {assetUrl(entry.spirit) ? <img alt="" src={assetUrl(entry.spirit)} /> : null}
            <strong>{entry.spirit.fullName}</strong>
            <b>{formatNumber(entry.durability.display[metric])}</b>
          </li>
        ))}
      </ol>
    </section>
  );
}

function FullRanking(props) {
  return <Suspense fallback={<div role="status">正在打开耐久榜…</div>}><DurabilityRankingView {...props} /></Suspense>;
}

export function AbilityWorkbench({
  configuration,
  onApplyMember,
  onApplySide,
  onDirtyChange,
  snapshot,
  source,
}) {
  const backButtonRef = useRef(null);
  const currentRankingRowRef = useRef(null);
  const openRankingButtonRef = useRef(null);
  const openSpeedOverviewButtonRef = useRef(null);
  const pendingAppliedConfigurationRef = useRef(null);
  const previousIncomingSignatureRef = useRef(
    serializedConfiguration(configuration),
  );
  const previousSourceIdentityRef = useRef(
    sourceIdentitySignature(configuration, source),
  );
  const scrollRef = useRef(null);
  const restoreScrollRef = useRef(0);
  const sourceSignature = configurationSignature(configuration, source);
  const sourceIdentity = sourceIdentitySignature(configuration, source);
  const incomingSignature = serializedConfiguration(configuration);
  const [baselineSignature, setBaselineSignature] = useState(sourceSignature);
  const [baselineConfiguration, setBaselineConfiguration] = useState(() =>
    cloneConfiguration(configuration),
  );
  const [draft, setDraft] = useState(() => cloneConfiguration(configuration));
  const [detailPage, setDetailPage] = useState("analysis");
  const [rankingResistance, setRankingResistance] = useState(undefined);
  const [lockedDimensions, setLockedDimensions] = useState(() =>
    ["physicalAttack", "magicalAttack"].filter(
      (stat) => Number(configuration?.displayIvs?.[stat]) === 60,
    ),
  );
  const [metric, setMetric] = useState("combined");
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [showCalculation, setShowCalculation] = useState(false);
  const [speedMode, setSpeedMode] = useState("keep");
  const [speedProfileIds, setSpeedProfileIds] = useState(DEFAULT_SPEED_PROFILE_IDS);
  const [activeSpeedModifierIds, setActiveSpeedModifierIds] = useState([]);
  const [targetId, setTargetId] = useState("");
  const [templateId, setTemplateId] = useState("standard-hp-v1");
  const [applyStatus, setApplyStatus] = useState("");

  useEffect(() => {
    const identityChanged = previousSourceIdentityRef.current !== sourceIdentity;
    const configurationChanged =
      previousIncomingSignatureRef.current !== incomingSignature;
    previousSourceIdentityRef.current = sourceIdentity;
    previousIncomingSignatureRef.current = incomingSignature;
    if (!identityChanged && !configurationChanged) return;
    if (
      !identityChanged &&
      pendingAppliedConfigurationRef.current === incomingSignature
    ) {
      pendingAppliedConfigurationRef.current = null;
      return;
    }

    const nextConfiguration = JSON.parse(incomingSignature);
    const nextSource = JSON.parse(sourceIdentity).source;
    setDraft(nextConfiguration);
    setBaselineConfiguration(nextConfiguration);
    setBaselineSignature(configurationSignature(nextConfiguration, nextSource));
    setLockedDimensions(
      ["physicalAttack", "magicalAttack"].filter(
        (stat) => Number(nextConfiguration?.displayIvs?.[stat]) === 60,
      ),
    );
    setDetailPage("analysis");
    setActiveSpeedModifierIds([]);
    if (identityChanged) {
      setSpeedMode("keep");
      setSpeedProfileIds(DEFAULT_SPEED_PROFILE_IDS);
      setTargetId("");
    }
    setApplyStatus("");
  }, [incomingSignature, sourceIdentity]);

  const spirit = useMemo(
    () => (snapshot.spirits ?? []).find((entry) => entry.id === draft?.spiritId) ?? null,
    [draft?.spiritId, snapshot.spirits],
  );
  const ready = Boolean(draft && spirit && hasCompleteRaceStats(spirit.raceStats));
  const validation = useMemo(
    () => validateAbilityInvestment({ values: draft?.displayIvs ?? {} }),
    [draft?.displayIvs],
  );
  const configured = useMemo(() => ready ? calculationConfiguration(draft, spirit) : null, [ready, draft, spirit]);
  const baselineConfigured = useMemo(() => ready ? calculationConfiguration(baselineConfiguration, spirit) : null, [ready, baselineConfiguration, spirit]);
  const panel = useMemo(
    () =>
      configured
        ? calculateAllPanelStats({
            displayIvs: configured.displayIvs,
            natureMultipliers: getNatureMultipliers(configured.natureId),
            raceStats: configured.raceStats,
          })
        : null,
    [configured],
  );
  const baselinePanel = useMemo(
    () =>
      baselineConfigured
        ? calculateAllPanelStats({
            displayIvs: baselineConfigured.displayIvs,
            natureMultipliers: getNatureMultipliers(
              baselineConfigured.natureId,
            ),
            raceStats: baselineConfigured.raceStats,
          })
        : null,
    [baselineConfigured],
  );
  const baselineDurability = useMemo(
    () =>
      baselinePanel
        ? calculateDurability({
            magicalDefense: baselinePanel.magicalDefense,
            maxHp: baselinePanel.hp,
            physicalDefense: baselinePanel.physicalDefense,
          })
        : null,
    [baselinePanel],
  );
  const speedTargets = useMemo(() => groupSpeedTargets(
    createSpeedTargetCatalog({ snapshot, profiles: speedProfileIds }).map((target) =>
      target.specialLabel ? target : { ...target, id: `${target.profileId}:${target.id}` }),
  ).flatMap(({ targets }) => targets), [snapshot, speedProfileIds]);
  const speedModifiers = useMemo(
    () => panel ? createSpeedModifiers({
      configuration: draft,
      currentSpeed: panel.speed,
      snapshot,
      spirit,
    }) : [],
    [draft, panel, snapshot, spirit],
  );
  const activeSpeedModifiers = speedModifiers.filter((modifier) =>
    activeSpeedModifierIds.includes(modifier.id),
  );
  const speedBonus = activeSpeedModifiers.reduce(
    (total, modifier) => total + modifier.amount,
    0,
  );
  const nearestTarget = panel
    ? findNearestSpeedTarget(speedTargets, panel.speed + speedBonus)
    : null;
  const selectedTarget = speedTargets.find((entry) => entry.id === targetId) ?? nearestTarget;
  const resolvedTargetId = selectedTarget?.id ?? "";
  // Percentage-based speed modifiers must be recomputed from the final candidate speed.
  const speedBonusForSpeed = useMemo(() => {
    if (!activeSpeedModifierIds.length) return undefined;
    const cache = new Map();
    return (currentSpeed) => {
      if (!cache.has(currentSpeed)) cache.set(currentSpeed, createSpeedModifiers({
        configuration: draft, currentSpeed, snapshot, spirit,
      }).filter(({ id }) => activeSpeedModifierIds.includes(id))
        .reduce((total, modifier) => total + modifier.amount, 0));
      return cache.get(currentSpeed);
    };
  }, [activeSpeedModifierIds, draft, snapshot, spirit]);
  const speedAnalysis = useMemo(
    () =>
      configured && selectedTarget
        ? analyzeSpeedBreakpoints({
            configuration: configured,
            rulesetId: BINARY_60_MAX3_RULESET_ID,
            snapshotId: snapshot.meta?.id,
            speedBonus,
            speedBonusForSpeed,
            target: selectedTarget.speed,
          })
        : null,
    [configured, selectedTarget, snapshot.meta?.id, speedBonus, speedBonusForSpeed],
  );
  const speedConstraint = useMemo(() => speedMode === "at-least"
    ? { flatBonus: speedBonus, speedBonusForSpeed, mode: "at-least", targetSpeed: selectedTarget?.speed }
    : { flatBonus: speedBonus, speedBonusForSpeed, mode: speedMode }, [speedBonus, speedBonusForSpeed, speedMode, selectedTarget?.speed]);
  const recommendations = useMemo(() => {
    if (!configured || !validation.valid) return null;
    return recommendDurabilityBuilds({
      current: configured,
      compareDefensiveNatures: true,
      lockedDimensions,
      rulesetId: BINARY_60_MAX3_RULESET_ID,
      snapshotId: snapshot.meta?.id,
      speedConstraint,
    });
  }, [configured, lockedDimensions, snapshot.meta?.id, speedConstraint, validation.valid]);
  const previewRanking = useMemo(() => createDurabilityRanking({
    spiritFilterRevision: snapshot.meta?.revisions?.spiritFilter,
    spirits: snapshot.spirits ?? [],
    templateId: "standard-hp-v1",
  }), [snapshot.meta?.revisions?.spiritFilter, snapshot.spirits]);
  const previewRankings = useMemo(() => Object.fromEntries(
    Object.keys(METRIC_LABELS).map((sortBy) => [sortBy, selectDurabilityRanking(previewRanking, { sortBy }).rows]),
  ), [previewRanking]);
  const currentRankingEntry = previewRankings.combined.find(
    (entry) => entry.spiritId === spirit?.id,
  );
  const currentExclusion = previewRanking.excluded.find((entry) => entry.spiritId === spirit?.id);
  const dirty = Boolean(
    draft && configurationSignature(draft, source) !== baselineSignature,
  );

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  if (!configuration || !spirit) {
    return (
      <section aria-label="能力分析" className="ability-workbench ability-workbench--empty">
        <Crosshair aria-hidden="true" size={34} />
        <h4>先选择一只精灵</h4>
        <p>能力分析每次只处理当前成员或临时攻防方配置。</p>
      </section>
    );
  }

  if (!ready) {
    return (
      <section aria-label="能力分析" className="ability-workbench ability-workbench--empty">
        <Info aria-hidden="true" size={34} />
        <h4>种族值待确认</h4>
        <p>当前精灵缺少完整六维，暂时无法进行能力分析。</p>
      </section>
    );
  }

  function updateDraft(next) {
    setDraft(next);
  }

  function updateInvestment(stat, selected) {
    const transition = transitionAbilityInvestment({
      rulesetId: BINARY_60_MAX3_RULESET_ID,
      selected,
      stat,
      values: draft.displayIvs,
    });
    if (transition.changed) {
      updateDraft({ ...draft, displayIvs: transition.values });
    }
  }

  function replaceInvestment(removeStat, addStat) {
    const removed = transitionAbilityInvestment({
      rulesetId: BINARY_60_MAX3_RULESET_ID,
      selected: false,
      stat: removeStat,
      values: draft.displayIvs,
    });
    const added = transitionAbilityInvestment({
      rulesetId: BINARY_60_MAX3_RULESET_ID,
      selected: true,
      stat: addStat,
      values: removed.values,
    });
    if (removed.changed && added.changed) {
      updateDraft({ ...draft, displayIvs: added.values });
    }
  }

  function applyBuild(result) {
    if (!isDurabilityBuildApplicable({ current: configured, candidate: result, lockedDimensions, speedConstraint })) {
      setApplyStatus("方案不再满足当前约束，请重新选择");
      return;
    }
    const next = {
      ...draft,
      displayIvs: { ...result.values },
      natureId: result.natureId,
    };
    const nextIncomingSignature = serializedConfiguration(next);
    pendingAppliedConfigurationRef.current = nextIncomingSignature;
    const applied =
      source?.kind === "side"
        ? onApplySide?.(next)
        : onApplyMember?.(next);
    if (applied === false) {
      pendingAppliedConfigurationRef.current = null;
      setApplyStatus("应用失败，请重试");
      return;
    }
    setDraft(next);
    setBaselineConfiguration(cloneConfiguration(next));
    setBaselineSignature(configurationSignature(next, source));
    setApplyStatus(`方案已${getSourceActionLabel(source)}`);
  }

  function openFullRanking() {
    const scrollContainer =
      scrollRef.current?.closest(".team-drawer__editor-pane") ??
      scrollRef.current;
    restoreScrollRef.current = scrollContainer?.scrollTop ?? 0;
    setDetailPage("ranking");
    requestAnimationFrame(() => {
      const nextScrollContainer =
        scrollRef.current?.closest(".team-drawer__editor-pane") ??
        scrollRef.current;
      if (nextScrollContainer) nextScrollContainer.scrollTop = 0;
      currentRankingRowRef.current?.scrollIntoView?.({ block: "center" });
      backButtonRef.current?.focus({ preventScroll: true });
    });
  }

  function closeFullRanking() {
    setDetailPage("analysis");
    requestAnimationFrame(() => {
      const scrollContainer =
        scrollRef.current?.closest(".team-drawer__editor-pane") ??
        scrollRef.current;
      if (scrollContainer) {
        scrollContainer.scrollTop = restoreScrollRef.current;
      }
      openRankingButtonRef.current?.focus();
    });
  }

  function openSpeedOverview() {
    const scrollContainer =
      scrollRef.current?.closest(".team-drawer__editor-pane") ??
      scrollRef.current;
    restoreScrollRef.current = scrollContainer?.scrollTop ?? 0;
    setDetailPage("speed");
    requestAnimationFrame(() => {
      const nextScrollContainer =
        scrollRef.current?.closest(".team-drawer__editor-pane") ??
        scrollRef.current;
      if (nextScrollContainer) nextScrollContainer.scrollTop = 0;
      backButtonRef.current?.focus({ preventScroll: true });
    });
  }

  function closeSpeedOverview() {
    setDetailPage("analysis");
    requestAnimationFrame(() => {
      const scrollContainer =
        scrollRef.current?.closest(".team-drawer__editor-pane") ??
        scrollRef.current;
      if (scrollContainer) {
        scrollContainer.scrollTop = restoreScrollRef.current;
      }
      openSpeedOverviewButtonRef.current?.focus();
    });
  }

  if (detailPage === "speed") {
    return (
      <div className="ability-workbench" ref={scrollRef}>
        <SpeedOverview
          backButtonRef={backButtonRef}
          currentSpeed={panel.speed + speedBonus}
          isDraft={dirty}
          locateTargetId={targetId}
          onBack={closeSpeedOverview}
          onProfilesChange={(nextProfileIds) => {
            setSpeedProfileIds(nextProfileIds);
            setApplyStatus("");
          }}
          onTargetChange={(nextTargetId) => {
            if (!nextTargetId) return;
            setTargetId(nextTargetId);
            setApplyStatus("");
          }}
          profileIds={speedProfileIds}
          targetId={resolvedTargetId}
          targets={speedTargets}
        />
      </div>
    );
  }

  if (detailPage === "ranking") {
    return (
      <div className="ability-workbench" ref={scrollRef}>
        <FullRanking
          snapshot={snapshot}
          resistance={rankingResistance}
          setResistance={setRankingResistance}
          backButtonRef={backButtonRef}
          currentRowRef={currentRankingRowRef}
          currentSpiritId={spirit.id}
          metric={metric}
          onBack={closeFullRanking}
          query={query}
          roleFilter={roleFilter}
          setMetric={setMetric}
          setQuery={setQuery}
          setRoleFilter={setRoleFilter}
          setTemplateId={setTemplateId}
          templateId={templateId}
        />
      </div>
    );
  }

  const displayedBuilds = BUILD_OBJECTIVES.map((objective) => ({
    key: objective.key, objective, result: recommendations?.results?.[objective.key] ?? null,
  }));
  const manualControls = (
    <details className="ability-manual" open={!validation.valid || undefined}>
      <summary>
        <strong>手动微调</strong>
        <span>{getNature(draft.natureId).name} · {INVESTMENT_STATS
          .filter(({ key }) => Number(draft.displayIvs[key]) > 0)
          .map(({ key, label }) => `${label} ${draft.displayIvs[key]}`)
          .join(" / ") || "无个体投入"}</span>
      </summary>
      <div className="ability-draft-controls">
        <InvestmentPicker
          natureId={draft.natureId}
          onChange={updateInvestment}
          onReplace={replaceInvestment}
          panel={panel}
          validation={validation}
          values={draft.displayIvs}
        />
        <label className="ability-draft-nature">
          <span>性格</span>
          <NatureSelect
            ariaLabel="能力分析性格"
            onChange={(natureId) => updateDraft({ ...draft, natureId })}
            value={draft.natureId}
          />
        </label>
      </div>
    </details>
  );

  return (
    <div
      aria-label="能力分析"
      className="ability-workbench"
      ref={scrollRef}
      role="region"
    >
      <CurrentSummary durability={baselineDurability} panel={baselinePanel} label={source?.kind === "side" ? "当前配置" : "已保存配置"} />
      {dirty ? (
        <p className="ability-draft-status" role="status">
          试算草稿 · 尚未{source?.kind === "side" ? "应用回计算器" : "应用到成员"}
        </p>
      ) : null}

      {!validation.valid ? (
        <>
          <div className="ability-rule-warning" role="alert">
            <Info aria-hidden="true" size={19} weight="fill" />
            <div>
              <strong>历史配置不符合个体值分配规则</strong>
              <span>原值已保留，计算暂停。请在草稿中明确改为最多三项 60。</span>
            </div>
            <button
              onClick={() =>
                updateDraft({
                  ...draft,
                  displayIvs: Object.fromEntries(INVESTMENT_STATS.map(({ key }) => [key, 0])),
                })
              }
              type="button"
            >
              清空个体值并重选
            </button>
          </div>
          {manualControls}
        </>
      ) : (
        <>
          <SpeedRail
            activeModifierIds={activeSpeedModifierIds}
            currentSpeed={panel.speed + speedBonus}
            currentSpirit={spirit}
            isDraft={dirty}
            modifiers={speedModifiers}
            onOpenOverview={openSpeedOverview}
            onProfilesChange={(nextProfileIds) => {
              setSpeedProfileIds(nextProfileIds);
              setApplyStatus("");
            }}
            onTargetChange={(nextTargetId) => {
              if (!nextTargetId) return;
              setTargetId(nextTargetId);
              setApplyStatus("");
            }}
            onToggleModifier={(modifier, selected) => {
              setActiveSpeedModifierIds((current) => selected
                ? [
                    ...current.filter((id) =>
                      speedModifiers.find((entry) => entry.id === id)?.groupId !== modifier.groupId,
                    ),
                    modifier.id,
                  ]
                : current.filter((id) => id !== modifier.id));
              setApplyStatus("");
            }}
            openOverviewButtonRef={openSpeedOverviewButtonRef}
            speedAnalysis={speedAnalysis}
            profileIds={speedProfileIds}
            targetId={resolvedTargetId}
            targets={speedTargets}
          />

          {manualControls}
          <section aria-label="耐久方案对比" className="ability-section ability-builds">
            <header className="ability-section__title">
              <span>2</span>
              <div>
                <h4>耐久方案对比</h4>
              </div>
              <div className="ability-build-constraints">
                <label>
                  <span>速度</span>
                  <select
                    aria-label="推荐速度约束"
                    onChange={(event) => {
                      setSpeedMode(event.target.value);
                    }}
                    value={speedMode}
                  >
                    <option value="keep">保留当前速度</option>
                    <option value="at-least">达到目标速度</option>
                    <option value="unlocked">只看耐久</option>
                  </select>
                </label>
                {["physicalAttack", "magicalAttack"].map((stat) => {
                  const label = INVESTMENT_STATS.find((entry) => entry.key === stat).label;
                  const locked = lockedDimensions.includes(stat);
                  return (
                    <button
                      aria-pressed={locked}
                      key={stat}
                      onClick={() => {
                        setLockedDimensions((current) =>
                          locked
                            ? current.filter((entry) => entry !== stat)
                            : [...current, stat],
                        );
                      }}
                      type="button"
                    >
                      {locked ? <LockSimple aria-hidden="true" size={14} /> : <LockSimpleOpen aria-hidden="true" size={14} />}
                      {label}{locked ? "已锁" : "未锁"}
                    </button>
                  );
                })}
              </div>
            </header>
            {recommendations?.status === "no-solution" ? (
              <p className="ability-builds__conflict">
                当前锁定和速度目标冲突，未生成非法方案。{recommendations.conflicts[0]?.code === "SPEED_TARGET_UNREACHABLE" ? "即使速度60也无法达到。" : "请解除锁定或调整速度约束。"}
              </p>
            ) : null}
            <div className="ability-build-grid">
              {displayedBuilds.map(({ key, objective, result }) => (
                <BuildCard
                  current={baselineConfiguration}
                  currentDurability={baselineDurability}
                  key={key}
                  objective={objective}
                  onApply={applyBuild}
                  result={result ? { ...result, objective: objective.key } : null}
                  source={source}
                />
              ))}
            </div>
            {applyStatus ? (
              <p className="ability-apply-status" role="status">{applyStatus}</p>
            ) : null}
            <button className="ability-calculation-toggle" onClick={() => setShowCalculation((current) => !current)} type="button">
              {showCalculation ? "收起计算依据" : "查看计算依据"}
            </button>
            {showCalculation ? (
              <div className="ability-calculation-note">
                <code>物理 = 最大生命 × 物防</code>
                <code>魔法 = 最大生命 × 魔防</code>
                <code>综合 = 最大生命 × 物防 × 魔防 ÷ (物防 + 魔防)</code>
                <span>展示值统一 Math.round；推荐仅枚举 0/60 且不超过三项的合法组合。</span>
              </div>
            ) : null}
          </section>

          <section aria-label="标准耐久榜定位" className="ability-section ability-ranking-preview">
            <header className="ability-section__title">
              <span>3</span>
              <div>
                <h4>标准耐久榜定位</h4>
              </div>
              <span className="ability-ranking-template">仅最终形态 + 首领</span>
            </header>
            {currentRankingEntry ? (
              <div className="ability-ranking-current">
                <span aria-hidden="true">✓</span>
                {spirit.fullName}：物理第 {currentRankingEntry.globalRank.physical}、魔法第 {currentRankingEntry.globalRank.magical}、综合第 {currentRankingEntry.globalRank.combined}
              </div>
            ) : (
              <div className="ability-ranking-current is-excluded">
                <Info aria-hidden="true" size={17} weight="fill" />
                {spirit.fullName}未入榜：{exclusionLabel(currentExclusion?.reason)}
              </div>
            )}
            <div
              aria-label="榜单预览指标"
              className="ability-ranking-preview-metrics"
              role="group"
            >
              {Object.entries(METRIC_LABELS).map(([key, label]) => (
                <button
                  aria-pressed={metric === key}
                  key={key}
                  onClick={() => setMetric(key)}
                  type="button"
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="ability-ranking-grid">
              <RankingPodium active={metric === "physical"} currentSpiritId={spirit.id} metric="physical" rows={previewRankings.physical} />
              <RankingPodium active={metric === "magical"} currentSpiritId={spirit.id} metric="magical" rows={previewRankings.magical} />
              <RankingPodium active={metric === "combined"} currentSpiritId={spirit.id} metric="combined" rows={previewRankings.combined} />
            </div>
            <footer>
              <button onClick={openFullRanking} ref={openRankingButtonRef} type="button">
                查看完整耐久榜
              </button>
            </footer>
          </section>
        </>
      )}
    </div>
  );
}
