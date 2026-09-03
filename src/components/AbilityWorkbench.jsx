import {
  ArrowLeft,
  ChartBar,
  CheckCircle,
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
import { getNatureMultipliers } from "../domain/natures.js";
import {
  calculateAllPanelStats,
  hasCompleteRaceStats,
} from "../domain/stat.js";
import { NatureSelect } from "./NatureSelect.jsx";

const INVESTMENT_STATS = Object.freeze([
  { key: "physicalAttack", label: "物攻" },
  { key: "magicalAttack", label: "魔攻" },
  { key: "speed", label: "速度" },
  { key: "hp", label: "生命" },
  { key: "physicalDefense", label: "物防" },
  { key: "magicalDefense", label: "魔防" },
]);

const BUILD_OBJECTIVES = Object.freeze([
  { key: "physical", label: "物理承伤", stat: "物防" },
  { key: "magical", label: "魔法承伤", stat: "魔防" },
  { key: "combined", label: "综合承伤", stat: "生命", recommended: true },
]);

const METRIC_LABELS = Object.freeze({
  combined: "综合耐久",
  magical: "魔法耐久",
  physical: "物理耐久",
});

const SPEED_STATUS_LABELS = Object.freeze({
  CURRENTLY_REACHED: "当前已达标",
  INVALID_INVESTMENT: "请先修复投资规则",
  NO_INVESTMENT_SLOT: "没有剩余投资位",
  REQUIRES_SPEED_INVESTMENT: "需要启用速度60",
  UNREACHABLE_WITH_SPEED_INVESTMENT: "即使速度60也无法达到",
});

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

function speedForSpirit(spirit) {
  if (!hasCompleteRaceStats(spirit?.raceStats)) return null;
  return calculateAllPanelStats({
    displayIvs: Object.fromEntries(
      INVESTMENT_STATS.map(({ key }) => [key, key === "speed" ? 60 : 0]),
    ),
    natureMultipliers: {},
    raceStats: spirit.raceStats,
  }).speed;
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

function InvestmentPicker({ onChange, validation, values }) {
  return (
    <section className="ability-investment-panel">
      <header>
        <div>
          <strong>能力分析投资</strong>
          <small>每项只能取 0 或 60，最多选择三项</small>
        </div>
        <span>
          已用 {validation.activeCount} / {validation.maxActiveStats}
        </span>
      </header>
      <div aria-label="能力分析个体投资" className="ability-investments" role="group">
        {INVESTMENT_STATS.map(({ key, label }) => {
          const selected = Number(values[key]) > 0;
          const disabled = !selected && validation.remainingSlots === 0;
          return (
            <button
              aria-label={`${selected ? "取消" : "选择"}${label}投资，当前${values[key]}`}
              aria-pressed={selected}
              disabled={disabled}
              key={key}
              onClick={() => onChange(key, !selected)}
              type="button"
            >
              <span>{label}</span>
              <strong>{values[key]}</strong>
              <small>{selected ? "已投资" : disabled ? "无剩余位置" : "未投资"}</small>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function SpeedRail({ currentSpeed, onTargetChange, speedAnalysis, targets, targetId }) {
  const selected = targets.find((target) => target.id === targetId) ?? targets[0];
  return (
    <section className="ability-section ability-speed" aria-label="速度约束">
      <header className="ability-section__title">
        <span>1</span>
        <div>
          <h4>速度约束</h4>
          <small>{SPEED_STATUS_LABELS[speedAnalysis?.status] ?? "选择目标后分析"}</small>
        </div>
        <label>
          <span>目标精灵</span>
          <select
            aria-label="速度目标精灵"
            onChange={(event) => onTargetChange(event.target.value)}
            value={selected?.id ?? ""}
          >
            {targets.map((target) => (
              <option key={target.id} value={target.id}>
                {target.name} · {target.speed}
              </option>
            ))}
          </select>
        </label>
      </header>
      <div className="ability-speed__rail" role="list" aria-label="邻近速度断点">
        <span aria-hidden="true" className="ability-speed__line" />
        <div className="ability-speed__marker is-current" role="listitem">
          <b>{formatNumber(currentSpeed)}</b>
          <span>当前</span>
        </div>
        {targets.slice(0, 5).map((target) => (
          <div
            className={`ability-speed__marker${target.id === selected?.id ? " is-target" : ""}`}
            key={target.id}
            role="listitem"
          >
            {assetUrl(target.spirit) ? <img alt="" src={assetUrl(target.spirit)} /> : null}
            <b>{target.speed}</b>
            <span>{target.name}</span>
          </div>
        ))}
      </div>
      <footer>
        <span>
          当前 {formatNumber(speedAnalysis?.currentSpeed)} · 速度60 {formatNumber(speedAnalysis?.investedSpeed)}
        </span>
        <small>目标按 Lv.60、中性、速度个体60计算</small>
      </footer>
    </section>
  );
}

function BuildCard({ currentDurability, duplicateLabel, objective, onApply, result, source }) {
  if (!result) {
    return (
      <article className="ability-build-card is-empty">
        <h5>{objective.label}</h5>
        <p>当前锁定条件下没有合法方案。</p>
      </article>
    );
  }
  return (
    <article className={`ability-build-card${objective?.recommended ? " is-recommended" : ""}`}>
      <header>
        <div>
          <h5>{objective.label}</h5>
          <span>优先 {objective.stat}</span>
        </div>
        {objective.recommended ? <b>推荐</b> : duplicateLabel ? <b>{duplicateLabel}</b> : null}
      </header>
      <div className="ability-build-card__allocation">
        {INVESTMENT_STATS.filter(({ key }) => result.values[key] === 60).map(({ key, label }) => (
          <span key={key}>{label} 60</span>
        ))}
      </div>
      <dl>
        <div>
          <dt>速度</dt>
          <dd>{formatNumber(result.panel.speed)}</dd>
        </div>
        {Object.entries(METRIC_LABELS).map(([metric, label]) => {
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
      <button onClick={() => onApply(result)} type="button">
        {getSourceActionLabel(source)}
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
          <h4>标准耐久榜 · 已审计范围</h4>
          <small>
            仅纳入形态清单中的最终形态与双源确认首领；搜索不重新编号
          </small>
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
          <thead>
            <tr>
              <th>全体</th>
              <th>筛选内</th>
              <th>精灵</th>
              <th>物理耐久</th>
              <th>魔法耐久</th>
              <th>综合耐久</th>
            </tr>
          </thead>
          <tbody>
            {ranking.rows.map((entry) => (
              <tr className={entry.spiritId === currentSpiritId ? "is-current" : ""} key={entry.spiritId}>
                <td data-label="全体名次">{entry.globalRank[metric]}</td>
                <td data-label="筛选内名次">{entry.filteredRank[metric]}</td>
                <th scope="row">
                  {assetUrl(entry.spirit) ? <img alt="" src={assetUrl(entry.spirit)} /> : null}
                  <span>{entry.spirit.fullName}</span>
                  <small>{entry.formRole === "boss" ? "首领" : "最终形态"}</small>
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
  const [targetId, setTargetId] = useState("");
  const [templateId, setTemplateId] = useState("standard-hp-v1");

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
    setSpeedMode("keep");
    setTargetId("");
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
    return (snapshot.spirits ?? [])
      .map((targetSpirit) => ({
        id: targetSpirit.id,
        name: targetSpirit.fullName,
        speed: speedForSpirit(targetSpirit),
        spirit: targetSpirit,
      }))
      .filter((entry) => Number.isFinite(entry.speed))
      .sort((left, right) =>
        Math.abs(left.speed - panel.speed) - Math.abs(right.speed - panel.speed) ||
        left.speed - right.speed ||
        left.name.localeCompare(right.name, "zh-CN"),
      );
  }, [panel, snapshot.spirits]);
  const resolvedTargetId = targetId || speedTargets[0]?.id || "";
  const selectedTarget = speedTargets.find((entry) => entry.id === resolvedTargetId) ?? speedTargets[0];
  const speedAnalysis = useMemo(
    () =>
      configured && selectedTarget
        ? analyzeSpeedBreakpoints({
            configuration: configured,
            rulesetId: BINARY_60_MAX3_RULESET_ID,
            snapshotId: snapshot.meta?.id,
            target: selectedTarget.speed,
          })
        : null,
    [configured, selectedTarget, snapshot.meta?.id],
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
          ? { mode: "at-least", targetSpeed: selectedTarget?.speed }
          : { mode: speedMode },
    });
  }, [configured, lockedDimensions, selectedTarget?.speed, snapshot.meta?.id, speedMode, validation.valid]);
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
      return;
    }
    setDraft(next);
    setBaselineConfiguration(cloneConfiguration(next));
    setBaselineSignature(configurationSignature(next, source));
    setAnalysisOptionsDirty(false);
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

  const resultEntries = BUILD_OBJECTIVES.map(({ key }) => recommendations?.results?.[key] ?? null);
  const duplicateKeys = new Map();
  resultEntries.forEach((result) => {
    if (result) duplicateKeys.set(result.stableKey, (duplicateKeys.get(result.stableKey) ?? 0) + 1);
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
          分析草稿尚未应用；当前配置卡保持原值，以下断点与方案按草稿计算。
        </p>
      ) : null}

      <div className="ability-draft-controls">
        <InvestmentPicker onChange={updateInvestment} validation={validation} values={draft.displayIvs} />
        <label className="ability-draft-nature">
          <span>分析草稿性格</span>
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
            <strong>历史配置不符合能力分析规则</strong>
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
            清空投资草稿并重选
          </button>
        </div>
      ) : (
        <>
          <SpeedRail
            currentSpeed={panel.speed}
            onTargetChange={(nextTargetId) => {
              setTargetId(nextTargetId);
              if (nextTargetId !== resolvedTargetId) {
                setAnalysisOptionsDirty(true);
                onDirtyChange?.(true);
              }
            }}
            speedAnalysis={speedAnalysis}
            targetId={resolvedTargetId}
            targets={speedTargets}
          />

          <section aria-label="耐久方案对比" className="ability-section ability-builds">
            <header className="ability-section__title">
              <span>2</span>
              <div>
                <h4>耐久方案对比</h4>
                <small>三种目标共用同一套锁定与速度约束</small>
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
                    <option value="keep">保持当前速度</option>
                    <option value="at-least">达到目标速度</option>
                    <option value="unlocked">不锁速度</option>
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
              {resultEntries.map((result, index) => (
                <BuildCard
                  currentDurability={baselineDurability}
                  duplicateLabel={result && duplicateKeys.get(result.stableKey) > 1 ? "与另一方案相同" : null}
                  key={BUILD_OBJECTIVES[index].key}
                  objective={BUILD_OBJECTIVES[index]}
                  onApply={applyBuild}
                  result={result ? { ...result, objective: BUILD_OBJECTIVES[index].key } : null}
                  source={source}
                />
              ))}
            </div>
            <button className="ability-calculation-toggle" onClick={() => setShowCalculation((current) => !current)} type="button">
              <ChartBar aria-hidden="true" size={16} />
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
                <small>
                  Lv.60 · 生命/物防/魔防60 · 生命性格 · 已审计形态清单口径
                </small>
              </div>
              <span className="ability-ranking-template">仅最终形态 + 首领</span>
            </header>
            {currentRankingEntry ? (
              <div className="ability-ranking-current">
                <CheckCircle aria-hidden="true" size={17} weight="fill" />
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
              <span>
                未知形态默认排除：
                {ranking.counts.excludedByReason.UNKNOWN_FORM_ROLE ?? 0}
              </span>
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
