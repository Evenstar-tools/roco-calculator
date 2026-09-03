import {
  ArrowLeft,
  Crosshair,
  Info,
  LockSimple,
  LockSimpleOpen,
  MagnifyingGlass,
} from "@phosphor-icons/react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  analyzeSpeedBreakpoints,
  recommendDurabilityBuilds,
} from "../features/team-ability/domain/ability-analysis.js";
import {
  BINARY_60_MAX3_RULESET_ID,
  transitionAbilityInvestment,
  validateAbilityInvestment,
} from "../features/team-ability/domain/ability-investment.js";
import {
  STANDARD_DURABILITY_TEMPLATES,
  createDurabilityRanking,
} from "../features/team-ability/domain/durability-ranking.js";
import { calculateDurability } from "../features/team-ability/domain/durability.js";
import {
  findNearestSpeedTarget,
  groupSpeedTargets,
  SPEED_TARGET_PROFILES,
  createSpeedTargets,
} from "../features/team-ability/domain/speed-targets.js";
import { createSpeedModifiers } from "../features/team-ability/domain/speed-modifiers.js";
import {
  getNature,
  getNatureMultipliers,
  getQuickNatureId,
  STAT_LABELS,
} from "../domain/natures.js";
import {
  calculateAllPanelStats,
  hasCompleteRaceStats,
} from "../domain/stat.js";
import { NatureSelect } from "./NatureSelect.jsx";
import { StatIcon } from "./StatIcon.jsx";

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

const DEFAULT_SPEED_PROFILE_IDS = Object.freeze([
  "positive-max",
  "neutral-max",
  "neutral-zero",
]);

function speedTargetLabel(target) {
  return target
    ? `${target.name} · ${target.speed}（${target.profileLabel}）`
    : "";
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
  return JSON.stringify(cloneConfiguration(configuration));
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

const DEFENSIVE_NATURE_STAT = Object.freeze({
  combined: "hp",
  physical: "physicalDefense",
  magical: "magicalDefense",
});

function withDefensiveNature(result, objective, raceStats, speedBonus) {
  if (!result) return null;
  const natureId = getQuickNatureId(DEFENSIVE_NATURE_STAT[objective], "defender");
  const panel = calculateAllPanelStats({
    displayIvs: result.values,
    natureMultipliers: getNatureMultipliers(natureId),
    raceStats,
  });
  return {
    ...result,
    durability: calculateDurability({
      maxHp: panel.hp,
      magicalDefense: panel.magicalDefense,
      physicalDefense: panel.physicalDefense,
    }),
    effectiveSpeed: panel.speed + speedBonus,
    natureId,
    panel,
  };
}

function CurrentSummary({ durability, panel }) {
  return (
    <section aria-label="当前配置摘要" className="ability-current-summary">
      <strong>当前配置</strong>
      <span>
        <small>速度</small>
        <b>{formatNumber(panel?.speed)}</b>
      </span>
      <span>
        <small>物理耐久</small>
        <b>{formatNumber(durability?.display.physical)}</b>
      </span>
      <span>
        <small>魔法耐久</small>
        <b>{formatNumber(durability?.display.magical)}</b>
      </span>
      <span>
        <small>综合耐久</small>
        <b>{formatNumber(durability?.display.combined)}</b>
      </span>
    </section>
  );
}

function InvestmentPicker({ onChange, onReplace, panel, validation, values }) {
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
                <StatIcon size={17} stat={key} />
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

function SpeedRail({
  activeModifierIds,
  currentSpeed,
  modifiers,
  onProfilesChange,
  onToggleModifier,
  onTargetChange,
  profileIds,
  speedAnalysis,
  targets,
  targetId,
}) {
  const railRef = useRef(null);
  const selectedTargetRef = useRef(null);
  const speedTableRef = useRef(null);
  const selectedTableTargetRef = useRef(null);
  const dragRef = useRef({ active: false, moved: false, scrollLeft: 0, startX: 0 });
  const [showSpeedTable, setShowSpeedTable] = useState(false);
  const selected = targets.find((target) => target.id === targetId) ?? targets[0];
  const [targetInput, setTargetInput] = useState(null);
  const targetGroups = groupSpeedTargets(targets);
  const targetOptions = targetInput === null
    ? []
    : targets.filter((target) => {
        const query = targetInput.trim();
        if (!query) return true;
        return `${target.name}${target.speed}${target.qualifier}`.includes(query);
      }).slice(0, 12);
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
    viewport.scrollTo?.({
      behavior: "smooth",
      left: target.offsetLeft - (viewport.clientWidth - target.offsetWidth) / 2,
    });
  }, [profileIds, selected?.id]);

  useEffect(() => {
    if (!showSpeedTable) return undefined;
    const frame = requestAnimationFrame(() => {
      const viewport = speedTableRef.current;
      const target = selectedTableTargetRef.current;
      if (!viewport || !target) return;
      const viewportRect = viewport.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      viewport.scrollTop +=
        targetRect.top - viewportRect.top -
        (viewport.clientHeight - targetRect.height) / 2;
    });
    return () => cancelAnimationFrame(frame);
  }, [profileIds, selected?.id, showSpeedTable]);

  function startDrag(event) {
    if (event.button !== 0) return;
    dragRef.current = {
      active: true,
      moved: false,
      scrollLeft: railRef.current?.scrollLeft ?? 0,
      startX: event.clientX,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function moveDrag(event) {
    if (!dragRef.current.active || !railRef.current) return;
    const delta = event.clientX - dragRef.current.startX;
    if (Math.abs(delta) > 4) dragRef.current.moved = true;
    railRef.current.scrollLeft = dragRef.current.scrollLeft - delta;
  }

  function endDrag(event) {
    dragRef.current.active = false;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }

  function selectTarget(targetIdToSelect) {
    if (dragRef.current.moved) {
      dragRef.current.moved = false;
      return;
    }
    onTargetChange(targetIdToSelect);
  }

  function lockTarget(target) {
    onTargetChange(target.id);
    setTargetInput(null);
  }

  return (
    <section className="ability-section ability-speed" aria-label="速度目标">
      <header className="ability-section__title">
        <span>1</span>
        <div>
          <h4>速度目标</h4>
          <small>{SPEED_STATUS_LABELS[speedAnalysis?.status] ?? "选择目标后分析"}</small>
        </div>
        <div className="ability-speed__controls">
          <div className="ability-speed__profile-picker">
            <span>口径</span>
            <details>
              <summary aria-label="速度目标口径">{profileIds.length}种口径</summary>
              <fieldset>
                <legend>速度口径</legend>
                {Object.values(SPEED_TARGET_PROFILES).map((entry) => (
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
                onChange={(event) => setTargetInput(event.target.value)}
                onFocus={() => setTargetInput("")}
                onKeyDown={(event) => {
                  if (event.key === "Escape") setTargetInput(null);
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
                      aria-label={`选择${target.name} ${target.speed} ${target.profileLabel}`}
                      aria-selected={target.id === selected?.id}
                      data-target-id={target.id}
                      key={target.id}
                      onClick={() => lockTarget(target)}
                      onMouseDown={(event) => event.preventDefault()}
                      role="option"
                      type="button"
                    >
                      {assetUrl(target.spirit) ? <img alt="" src={assetUrl(target.spirit)} /> : null}
                      <span>
                        <strong>{target.name}</strong>
                        <small>{target.spirit.raceStats.speed}族 · {target.profileLabel}</small>
                      </span>
                      <b>{target.speed}</b>
                    </button>
                  ))}
                  {targetOptions.length === 0 ? <p>无匹配精灵</p> : null}
                </div>
              ) : null}
            </div>
          </div>
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
            当前 {formatNumber(currentSpeed)}
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
            <div className="ability-speed__marker is-current" key={item.id} role="listitem">
              <b>{formatNumber(item.speed)}</b>
              <span>当前配置</span>
            </div>
          ) : (
            <button
              aria-current={item.target.id === selected?.id ? "true" : undefined}
              aria-label={`选择速度目标${item.target.name}，速度${item.target.speed}`}
              className={`ability-speed__marker${item.target.id === selected?.id ? " is-target" : ""}`}
              key={item.id}
              onClick={() => selectTarget(item.target.id)}
              ref={item.target.id === selected?.id ? selectedTargetRef : null}
              role="listitem"
              type="button"
            >
              {assetUrl(item.target.spirit) ? <img alt="" src={assetUrl(item.target.spirit)} /> : null}
              <b>{item.target.speed}</b>
              <span>{item.target.name}</span>
              <small>
                {item.target.spirit.raceStats.speed}族
                {item.target.formRole === "boss" ? " · 首领" : ""}
                {` · ${item.target.profileLabel}`}
              </small>
            </button>
          ))}
        </div>
      </div>
      <button
        aria-controls="ability-speed-tier-table"
        aria-expanded={showSpeedTable}
        className="ability-speed__table-toggle"
        onClick={() => setShowSpeedTable((current) => !current)}
        type="button"
      >
        <span>
          {showSpeedTable ? "收起速度表" : "展开速度表"}
        </span>
        <small>{targetGroups.length}档</small>
      </button>
      {showSpeedTable ? (
        <div className="ability-speed__table-wrap" id="ability-speed-tier-table" ref={speedTableRef}>
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
              {targetGroups.map((group) => (
                <tr
                  className={group.targets.some((target) => target.id === selected?.id) ? "is-selected" : ""}
                  key={group.speed}
                >
                  <th scope="row">{group.speed}</th>
                  <td>
                    <div className="ability-speed__tier-spirits">
                      {group.targets.map((target) => (
                        <button
                          aria-label={`在速度表选择${target.name}，速度${target.speed}`}
                          aria-pressed={target.id === selected?.id}
                          key={target.id}
                          onClick={() => onTargetChange(target.id)}
                          ref={target.id === selected?.id ? selectedTableTargetRef : null}
                          title={`${target.name} · ${target.qualifier} · ${target.formRole === "boss" ? "首领" : "最终形态"}`}
                          type="button"
                        >
                          {assetUrl(target.spirit) ? <img alt="" src={assetUrl(target.spirit)} /> : null}
                          <span>
                            <strong>{target.name}</strong>
                            <small>
                              {target.spirit.raceStats.speed}族
                              {target.formRole === "boss" ? " · 首领" : ""}
                              {` · ${target.profileLabel}`}
                            </small>
                          </span>
                        </button>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
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

function RankingPodium({ active, metric, rows }) {
  return (
    <section
      aria-label={`${METRIC_LABELS[metric]}前四名`}
      className={`ability-ranking-podium${active ? " is-active" : ""}`}
    >
      <h5>{METRIC_LABELS[metric]}</h5>
      <ol>
        {rows.slice(0, 4).map((entry) => (
          <li key={entry.spiritId}>
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

function FullRanking({ backButtonRef, currentSpiritId, onBack, ranking, setMetric, setQuery, setRoleFilter, setTemplateId, metric, query, roleFilter, templateId }) {
  return (
    <section aria-label="完整耐久榜" className="ability-full-ranking">
      <header>
        <button onClick={onBack} ref={backButtonRef} type="button">
          <ArrowLeft aria-hidden="true" size={17} />
          返回能力分析
        </button>
        <div>
          <h4>标准耐久榜</h4>
          <small>最终形态与首领 · 搜索不改变名次</small>
        </div>
      </header>
      <div className="ability-ranking-controls">
        <label className="ability-ranking-search">
          <MagnifyingGlass aria-hidden="true" size={16} />
          <input
            aria-label="搜索耐久榜精灵"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索精灵、图鉴号或属性"
            value={query}
          />
        </label>
        <select aria-label="耐久榜模板" onChange={(event) => setTemplateId(event.target.value)} value={templateId}>
          {Object.values(STANDARD_DURABILITY_TEMPLATES).map((template) => (
            <option key={template.id} value={template.id}>{template.label}</option>
          ))}
        </select>
        <select aria-label="形态筛选" onChange={(event) => setRoleFilter(event.target.value)} value={roleFilter}>
          <option value="all">最终形态 + 首领</option>
          <option value="final">仅最终形态</option>
          <option value="boss">仅首领</option>
        </select>
      </div>
      <div aria-label="排行指标" className="ability-ranking-metrics" role="group">
        {Object.entries(METRIC_LABELS).map(([key, label]) => (
          <button aria-pressed={metric === key} key={key} onClick={() => setMetric(key)} type="button">{label}</button>
        ))}
      </div>
      <p className="ability-ranking-counts">
        已纳入 {ranking.counts.eligible} · 已排除 {ranking.counts.excluded} · 当前显示 {ranking.counts.visible}
      </p>
      <div className="ability-ranking-table-wrap">
        <table aria-label="标准耐久完整榜" className="ability-ranking-table">
          <colgroup>
            <col className="ability-ranking-table__rank" />
            <col className="ability-ranking-table__spirit" />
            <col />
            <col />
            <col />
          </colgroup>
          <thead>
            <tr>
              <th>排名</th>
              <th>精灵</th>
              <th>物理耐久</th>
              <th>魔法耐久</th>
              <th>综合耐久</th>
            </tr>
          </thead>
          <tbody>
            {ranking.rows.map((entry) => (
              <tr className={entry.spiritId === currentSpiritId ? "is-current" : ""} key={entry.spiritId}>
                <td data-label="排名">{entry.filteredRank[metric]}</td>
                <th scope="row">
                  <div className="ability-ranking-spirit">
                    {assetUrl(entry.spirit) ? <img alt="" src={assetUrl(entry.spirit)} /> : null}
                    <span>{entry.spirit.fullName}</span>
                    <small>{entry.formRole === "boss" ? "首领" : "最终形态"}</small>
                  </div>
                </th>
                <td data-label="物理耐久">{formatNumber(entry.durability.display.physical)}</td>
                <td data-label="魔法耐久">{formatNumber(entry.durability.display.magical)}</td>
                <td data-label="综合耐久">{formatNumber(entry.durability.display.combined)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
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
  const openRankingButtonRef = useRef(null);
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
  const [fullRanking, setFullRanking] = useState(false);
  const [analysisOptionsDirty, setAnalysisOptionsDirty] = useState(false);
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
    setFullRanking(false);
    setAnalysisOptionsDirty(false);
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
  const configured = ready ? calculationConfiguration(draft, spirit) : null;
  const baselineConfigured = ready
    ? calculationConfiguration(baselineConfiguration, spirit)
    : null;
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
  const speedTargets = useMemo(() => {
    if (!panel) return [];
    return groupSpeedTargets(speedProfileIds.flatMap((profileId) =>
      createSpeedTargets({
        profileId,
        spiritFilterRevision: snapshot.meta?.revisions?.spiritFilter,
        spirits: snapshot.spirits ?? [],
      }).map((target) => ({
        ...target,
        id: `${profileId}:${target.id}`,
      })),
    )).flatMap(({ targets }) => targets);
  }, [panel, snapshot.meta?.revisions?.spiritFilter, snapshot.spirits, speedProfileIds]);
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
  const speedAnalysis = useMemo(
    () =>
      configured && selectedTarget
        ? analyzeSpeedBreakpoints({
            configuration: configured,
            rulesetId: BINARY_60_MAX3_RULESET_ID,
            snapshotId: snapshot.meta?.id,
            speedBonus,
            target: selectedTarget.speed,
          })
        : null,
    [configured, selectedTarget, snapshot.meta?.id, speedBonus],
  );
  const recommendations = useMemo(() => {
    if (!configured || !validation.valid) return null;
    return recommendDurabilityBuilds({
      current: configured,
      lockedDimensions,
      rulesetId: BINARY_60_MAX3_RULESET_ID,
      snapshotId: snapshot.meta?.id,
      speedConstraint:
        speedMode === "at-least"
          ? { flatBonus: speedBonus, mode: "at-least", targetSpeed: selectedTarget?.speed }
          : { flatBonus: speedBonus, mode: speedMode },
    });
  }, [configured, lockedDimensions, selectedTarget?.speed, snapshot.meta?.id, speedBonus, speedMode, validation.valid]);
  const rankingFilter = useMemo(
    () =>
      roleFilter === "all" ? undefined : (entry) => entry.formRole === roleFilter,
    [roleFilter],
  );
  const ranking = useMemo(
    () =>
      createDurabilityRanking({
        filter: rankingFilter,
        query,
        sortBy: metric,
        spiritFilterRevision: snapshot.meta?.revisions?.spiritFilter,
        spirits: snapshot.spirits ?? [],
        templateId,
      }),
    [metric, query, rankingFilter, snapshot.meta?.revisions?.spiritFilter, snapshot.spirits, templateId],
  );
  const previewRankings = useMemo(
    () =>
      Object.fromEntries(
        Object.keys(METRIC_LABELS).map((previewMetric) => [
          previewMetric,
          createDurabilityRanking({
            sortBy: previewMetric,
            spiritFilterRevision: snapshot.meta?.revisions?.spiritFilter,
            spirits: snapshot.spirits ?? [],
            templateId: "standard-hp-v1",
          }).rows,
        ]),
      ),
    [snapshot.meta?.revisions?.spiritFilter, snapshot.spirits],
  );
  const currentRankingEntry = previewRankings.combined.find(
    (entry) => entry.spiritId === spirit?.id,
  );
  const currentExclusion = ranking.excluded.find((entry) => entry.spiritId === spirit?.id);
  const dirty = Boolean(
    analysisOptionsDirty ||
      (draft && configurationSignature(draft, source) !== baselineSignature),
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
    setAnalysisOptionsDirty(false);
    setApplyStatus(`方案已${getSourceActionLabel(source)}`);
  }

  function openFullRanking() {
    const scrollContainer =
      scrollRef.current?.closest(".team-drawer__editor-pane") ??
      scrollRef.current;
    restoreScrollRef.current = scrollContainer?.scrollTop ?? 0;
    setFullRanking(true);
    requestAnimationFrame(() => {
      const nextScrollContainer =
        scrollRef.current?.closest(".team-drawer__editor-pane") ??
        scrollRef.current;
      if (nextScrollContainer) nextScrollContainer.scrollTop = 0;
      backButtonRef.current?.focus();
    });
  }

  function closeFullRanking() {
    setFullRanking(false);
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

  if (fullRanking) {
    return (
      <div className="ability-workbench" ref={scrollRef}>
        <FullRanking
          backButtonRef={backButtonRef}
          currentSpiritId={spirit.id}
          metric={metric}
          onBack={closeFullRanking}
          query={query}
          ranking={ranking}
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

  const compareDefensiveNatures =
    validation.valid &&
    validation.activeCount === 3 &&
    ["hp", "physicalDefense", "magicalDefense"].every(
      (stat) => draft.displayIvs[stat] === 60,
    );
  const displayedBuilds = BUILD_OBJECTIVES.map((objective) => {
    const result = recommendations?.results?.[objective.key] ?? null;
    return {
      key: objective.key,
      objective,
      result: compareDefensiveNatures
        ? withDefensiveNature(result, objective.key, configured.raceStats, speedBonus)
        : result,
    };
  });

  return (
    <div
      aria-label="能力分析"
      className="ability-workbench"
      ref={scrollRef}
      role="region"
    >
      <CurrentSummary durability={baselineDurability} panel={baselinePanel} />
      {dirty ? (
        <p className="ability-draft-status" role="status">
          草稿未应用
        </p>
      ) : null}

      <div className="ability-draft-controls">
        <InvestmentPicker
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

      {!validation.valid ? (
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
      ) : (
        <>
          <SpeedRail
            activeModifierIds={activeSpeedModifierIds}
            currentSpeed={panel.speed + speedBonus}
            modifiers={speedModifiers}
            onProfilesChange={(nextProfileIds) => {
              setSpeedProfileIds(nextProfileIds);
              setAnalysisOptionsDirty(true);
              setApplyStatus("");
              onDirtyChange?.(true);
            }}
            onTargetChange={(nextTargetId) => {
              if (!nextTargetId) return;
              setTargetId(nextTargetId);
              setApplyStatus("");
              if (nextTargetId !== resolvedTargetId) {
                setAnalysisOptionsDirty(true);
                onDirtyChange?.(true);
              }
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
              setAnalysisOptionsDirty(true);
              setApplyStatus("");
              onDirtyChange?.(true);
            }}
            speedAnalysis={speedAnalysis}
            profileIds={speedProfileIds}
            targetId={resolvedTargetId}
            targets={speedTargets}
          />

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
                      setAnalysisOptionsDirty(true);
                      onDirtyChange?.(true);
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
                        setAnalysisOptionsDirty(true);
                        onDirtyChange?.(true);
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
              <RankingPodium active={metric === "physical"} metric="physical" rows={previewRankings.physical} />
              <RankingPodium active={metric === "magical"} metric="magical" rows={previewRankings.magical} />
              <RankingPodium active={metric === "combined"} metric="combined" rows={previewRankings.combined} />
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
