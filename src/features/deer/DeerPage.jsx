import { loadServerSnapshot } from "../../runtime/load-snapshot.js";
import { publicResourceUrl } from "../../runtime/public-resource-url.js";
import { Fragment, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { deerResultKind, useCalculationMetrics } from "../../analytics/use-completion-metrics.js";
import { ArrowLeft, CaretDown, CaretRight, Minus, Plus, SlidersHorizontal } from "@phosphor-icons/react";
import { abilityLevelHint, RepeatLevelButton } from "../../components/NatureStatsStep.jsx";
import { withCalculatorExtras } from "../../data/snapshot-extras.js";
import { SpiritPicker } from "../../components/SpiritPicker.jsx";
import { AppHeader } from "../../components/AppHeader.jsx";
import { readThemeSetting, writeThemeSetting } from "../../state/display-settings.js";
import { isWebDocument } from "../../seo/page-metadata.js";
import { QuickNaturePicker } from "../../components/QuickNaturePicker.jsx";
import { QuickIvPicker } from "../../components/QuickIvPicker.jsx";
import { NatureSelect } from "../../components/NatureSelect.jsx";
import { NatureEffect } from "../../components/NatureEffect.jsx";
import { StatTile } from "../../components/StatTile.jsx";
import { SkillIcon } from "../../components/SkillIcon.jsx";
import { ElementIcon } from "../../components/ElementIcon.jsx";
import { DraftNumberInput, TraitInputs } from "../../components/SingleSkillEditor.jsx";
import { MoonMemoryTraitEditor } from "../../components/MoonMemoryTraitEditor.jsx";
import { getTraitView, stageMultiplier } from "../../domain/calculator-view-model.js";
import { getNature, QUICK_STATS, STAT_LABELS } from "../../domain/natures.js";
import { ELEMENT_TYPES } from "../../domain/type-chart.js";
import { hasCompleteRaceStats } from "../../domain/stat.js";
import { chooseDefaultSkillIds } from "../../domain/skill-loadout.js";
import { isCompleteSpiritConfig, spiritConfigsRepository } from "../../state/spirit-configs.js";
import { canonicalTraitControlKey, materializeTraitContext } from "../../state/trait-values.js";
import { DEER_NAMES, DEFENSE_TEMPLATES, applyDeerPreset, calculateDeerRow, calculateDeerSummaryRows, createDeerSetup, evaluateDeerAttack, getDeerDefenseLimitations, hasDeerDefenseTrait, panelFor } from "./deer-model.js";
import "./deer.css";
import { useRuntime } from "../../runtime/RuntimeContext.jsx";
import { useToolLocale as useLocale } from "../../i18n/useToolLocale.js";
import { previewRoute } from "../../runtime/preview-channel.js";
import { routeFor } from "../../runtime/routes.js";

function DeerHeader({ onReturn }) {
  const { serverId, locale } = useRuntime();
  const { t } = useLocale();
  useEffect(() => { document.documentElement.dataset.theme = readThemeSetting(); }, []);
  return <AppHeader pageTitle={t("电鹿斩杀线")} toolAction={<a className="deer-back" href={serverId === "cn" ? previewRoute("/") : routeFor(serverId, locale)} onClick={onReturn}><ArrowLeft aria-hidden="true" size={15} weight="bold" />{t("返回主站")}</a>} onThemeChange={(theme) => {
    document.documentElement.dataset.theme = writeThemeSetting(undefined, theme);
  }} />;
}

function NumberField({ label, value, onChange, min = 0, max = 100, suffix = "", step = 1, integer = false }) {
  const { t } = useLocale();
  return <label className="deer-number"><span>{t(label)}</span><DraftNumberInput ariaLabel={t(label)} value={value} min={min} max={max} step={step} onCommit={(next) => onChange(integer ? Math.trunc(next) : next)} />{suffix && <span>{suffix}</span>}</label>;
}

function standardAttackPreset(spiritName) {
  return { nature: spiritName === "爵士鹿" ? "adamant" : "cheerful", displayIvs: { hp: 60, physicalAttack: 60, speed: 60, magicalAttack: 0, physicalDefense: 0, magicalDefense: 0 } };
}

function SideConfiguration({ snapshot, setup, sideKey, presets, onSide, onSetup, onSelect, onDefenseLevel, children }) {
  const { typeName, t } = useLocale();
  const [expanded, setExpanded] = useState(false);
  const side = setup.state.sides[sideKey];
  const attack = sideKey === "attacker";
  const defenseStage = setup.state.directions.forward.overrides.defenseLevelStage ?? 0;
  const defensePercent = defenseStage * 10;
  const label = attack ? "攻击方" : "防御方";
  const spirit = snapshot.spirits.find((entry) => entry.id === side.spiritId);
  const panels = spirit ? panelFor(snapshot, side) : null;
  const options = useMemo(() => snapshot.spirits.filter((entry) => hasCompleteRaceStats(entry.raceStats) && (!attack || DEER_NAMES.includes(entry.fullName))).map((entry) => ({ ...entry, assetUrl: entry.asset?.localUrl })), [snapshot, attack]);
  const selected = options.find((entry) => entry.id === spirit?.id);
  const setIv = (stat, value) => onSide({ displayIvs: { ...side.displayIvs, [stat]: value } });
  function selectPreset(id) {
    if (id === "custom") return;
    const preset = id === "saved" ? presets[side.spiritId] : attack
      ? standardAttackPreset(spirit.fullName)
      : DEFENSE_TEMPLATES.find((entry) => entry.id === id);
    if (!preset) return;
    const next = applyDeerPreset(side, preset);
    onSide(id === "saved" ? next : { nature: next.nature, displayIvs: next.displayIvs }, false);
    onSetup(attack ? { attackPreset: id } : { defenseTemplate: id });
  }
  const presetId = attack ? setup.attackPreset : setup.defenseTemplate;
  const defenseTemplates = DEFENSE_TEMPLATES.map((template) => template.id === "none" && presets[side.spiritId] ? { id: "saved", label: "精灵预设" } : template);
  const effectControl = attack && spirit ? getTraitView(snapshot, spirit, "attacker").inputs.find((input) => input.contextKey === "attackerTraitEffect") : null;
  const stackControl = attack && spirit ? getTraitView(snapshot, spirit, "attacker").inputs.find((input) => input.contextKey === "attackerTraitStacks") : null;
  const stackMax = Number.isFinite(stackControl?.max) ? stackControl.max : null;
  const effectValue = effectControl ? setup.state.directions.forward.context[effectControl.id] ?? materializeTraitContext(side.traitValues, snapshot, spirit.id, "attacker")[effectControl.id] ?? effectControl.defaultValue : 0;
  if (!spirit) return <section className="deer-side deer-side--defender" aria-label={t("防御方配置")}><div className="deer-side-heading"><span>{t("防御方")}</span></div><SpiritPicker label={t(label)} side={sideKey} spirits={options} selected={null} onSelect={onSelect} showFavorite={false} /><p className="deer-muted">{t("请选择防御方，当前未代入默认对手。")}</p></section>;
  return <section className={`deer-side deer-side--${sideKey}`} aria-label={t("{v0}配置", { v0: label })}>
    <div className="deer-side-heading"><span>{t(label)}</span><button type="button" className="deer-link" onClick={() => setExpanded(!expanded)} aria-expanded={expanded}>{expanded ? t("收起配置") : t("手调配置")}<CaretDown size={12} /></button></div>
    <div className="deer-identity"><img src={spirit.asset?.localUrl} alt={t(spirit.fullName)} width="54" height="54" /><div className="deer-picker"><SpiritPicker label={t(label)} side={sideKey} spirits={options} selected={selected} onSelect={onSelect} showFavorite={false} /></div>
      {attack && <select aria-label={t("电鹿配置预设")} value={presetId} onChange={(event) => selectPreset(event.target.value)}><option value="standard">{t("常用配置")}</option>{presets[side.spiritId] && <option value="saved">{t("已存预设")}</option>}<option value="current" disabled>{t("当前配置")}</option><option value="custom" disabled>{t("自定义")}</option></select>}
    </div>
    {attack ? <><QuickNaturePicker side={sideKey} label={t(label)} displayIvs={side.displayIvs} value={side.nature} onChange={(nature) => onSide({ nature })} /><QuickIvPicker side={sideKey} label={t(label)} values={side.displayIvs} onChange={setIv} /></> : <>
      <div className="deer-templates" role="group" aria-label={t("防守模板")}>{defenseTemplates.map((template) => <button key={template.id} type="button" aria-pressed={presetId === template.id} onClick={() => selectPreset(template.id)}>{t(template.label)}</button>)}</div>
      <div className="deer-config-summary"><span>{presetId === "current" ? t("当前配置 · ") : presetId === "custom" ? t("自定义 · ") : ""}{t(getNature(side.nature).name)}{" "}{t("· 生命")}{side.displayIvs.hp}{" "}{t("/ 物防")}{side.displayIvs.physicalDefense}{" "}{t("/ 魔防")}{side.displayIvs.magicalDefense}</span></div>
    </>}
    <div className={`deer-side-bottom${attack ? "" : " deer-side-bottom--defender"}`}>{attack && <><div className="deer-stacks"><span>{t("特性层数")}</span><button type="button" aria-label={t("特性层数减一")} disabled={setup.stacks === 0} onClick={() => onSetup({ stacks: setup.stacks - 1 })}>−</button><DraftNumberInput ariaLabel={t("特性层数")} min={0} max={Number.isFinite(stackMax) ? stackMax : undefined} step={1} value={setup.stacks} onCommit={(next) => onSetup({ stacks: Math.trunc(next) })} /><button type="button" aria-label={t("特性层数加一")} disabled={Number.isFinite(stackMax) && setup.stacks >= stackMax} onClick={() => onSetup({ stacks: setup.stacks + 1 })}>＋</button></div><small className="deer-stack-help">{t(spirit.stage)} · {t(spirit.traitName)} · {side.ignoreTraits ? t("特性已关闭") : t("每层双攻＋{v0}%", { v0: effectValue })}</small>{spirit.fullName === "爵士鹿" && <label className="deer-bloodline"><span>{t("血脉")}</span><ElementIcon type={setup.wishPowerType ?? "武"} size={16} /><select aria-label={t("爵士鹿血脉")} value={setup.wishPowerType ?? "武"} onChange={(event) => onSetup({ wishPowerType: event.target.value })}>{ELEMENT_TYPES.map((type) => <option key={type} value={type}>{typeName(type)}{t("系")}</option>)}</select></label>}</>}
      {!attack && <NumberField label={t("目标HP")} value={setup.defenderHp} min={1} suffix="%" onChange={(value) => onSetup({ defenderHp: value })} />}
      {!attack && <div className="level-control" role="group" aria-label={t("防御能力等级")}><span>{t("防御能力等级")}</span><div>
      <RepeatLevelButton ariaLabel={t("防御方等级减一")} delta={-1} disabled={defenseStage <= -99} onChange={onDefenseLevel} value={defenseStage}><Minus aria-hidden="true" size={14} /></RepeatLevelButton>
      <span className="deer-level-value" title={t(abilityLevelHint(stageMultiplier(defenseStage)))}>{defenseStage}{" "}{t("层 ·")}{" "}{defensePercent > 0 ? "+" : ""}{defensePercent}%</span>
      <RepeatLevelButton ariaLabel={t("防御方等级加一")} delta={1} disabled={defenseStage >= 99} onChange={onDefenseLevel} value={defenseStage}><Plus aria-hidden="true" size={14} /></RepeatLevelButton>
      </div></div>}
    </div>
    {children}
    {expanded && <div className="deer-manual"><NatureSelect ariaLabel={t("{v0}性格", { v0: label })} value={side.nature} onChange={(nature) => onSide({ nature })} /><NatureEffect natureId={side.nature} /><div className="stat-grid">{QUICK_STATS.map((stat) => <StatTile key={stat} label={STAT_LABELS[stat]} natureId={side.nature} stat={stat} race={spirit.raceStats[stat]} panel={panels[stat]} displayIv={side.displayIvs[stat]} onIvChange={(value) => setIv(stat, value)} accent={attack ? "attack" : "defense"} />)}</div><p className="deer-muted">{t("仅修改本页，不覆盖计算器收藏配置。")}</p></div>}
  </section>;
}

function DefenderTraitConfiguration({ snapshot, spirit, side, trait, context, onTrait, onSide }) {
  const { t } = useLocale();
  const limitations = getDeerDefenseLimitations(snapshot, side);
  return <section className="deer-defense-trait" aria-label={t("防守特性设置")}>
    <div className="deer-defense-trait-heading">
      <label className="deer-check"><input aria-label={t("防守特性")} type="checkbox" checked={!side.ignoreTraits} onChange={(event) => onSide({ ignoreTraits: !event.target.checked })} /><strong>{t(trait?.name ?? t("防守特性"))}</strong></label>
      <span aria-live="polite">{side.ignoreTraits ? t("已关闭 · 参数保留，不参与计算") : limitations.length ? t("保命效果未计入 · 斩杀待确认") : t("已启用 · 按当前条件计算")}</span>
    </div>
    <p className="deer-defense-trait-description">{t(trait?.description ?? t("暂无特性说明，请核对计算提示。"))}</p>
    <fieldset disabled={side.ignoreTraits} aria-label={t("防守特性参数")}>
      <div className="deer-fields"><TraitInputs context={context} inputs={trait?.inputs ?? []} onChange={onTrait} /></div>
      <MoonMemoryTraitEditor snapshot={snapshot} spirit={spirit} side={side} sideKey="defender"
        onAdd={(id) => onSide({ acquiredTraitIds: [...side.acquiredTraitIds, id] })}
        onRemove={(id) => onSide({ acquiredTraitIds: side.acquiredTraitIds.filter((entry) => entry !== id) })}
        onValueChange={(traitId, key, value) => onSide({ acquiredTraitValues: { ...side.acquiredTraitValues, [traitId]: { ...side.acquiredTraitValues[traitId], [key]: value } } })} />
    </fieldset>
  </section>;
}

function minimumText(value, ready) { return value === null ? (ready ? "查询范围内未达" : "待确认") : `${value} 层`; }
function bestRow(rows, field) { return rows.filter((row) => row[field] !== null).sort((a, b) => a[field] - b[field])[0]; }

export function DeerWorkspace({ snapshot, presets = {}, initialState = null, onReturn }) {
  const { typeName, t, locale } = useLocale();
  const { serverId } = useRuntime();
  const [setup, commitSetup] = useState(() => {
    const next = { ...createDeerSetup(snapshot, initialState), showFollowup: false };
    if (initialState) {
      const attacker = next.state.sides.attacker;
      if (!isCompleteSpiritConfig(attacker)) {
        const spiritName = snapshot.spirits.find((spirit) => spirit.id === attacker.spiritId)?.fullName;
        next.state.sides.attacker = applyDeerPreset(attacker, standardAttackPreset(spiritName));
        next.attackPreset = "standard";
      }
    } else {
      const side = next.state.sides.defender;
      const preset = presets[side.spiritId];
      next.state.sides.defender = applyDeerPreset(side, preset ?? DEFENSE_TEMPLATES.find((entry) => entry.id === "hp"));
      next.defenseTemplate = preset ? "saved" : "hp";
    }
    return next;
  });
  const setupRef = useRef(setup);
  const [expandedRow, setExpandedRow] = useState(null);
  const [appliedMinimum, setAppliedMinimum] = useState(null);
  const [conditionsOpen, setConditionsOpen] = useState(false);
  const deferredSetup = useDeferredValue(setup);
  const {
    state: deferredState,
    stacks: deferredStacks,
    attackerHp: deferredAttackerHp,
    defenderHp: deferredDefenderHp,
    freeze: deferredFreeze,
    starfall: deferredStarfall,
    weather: deferredWeather,
    reduction: deferredReduction,
    showFollowup: deferredShowFollowup,
    normalElectric: deferredNormalElectric,
    dischargeElectrified: deferredDischargeElectrified,
    wishPowerType: deferredWishPowerType,
    wishPowerResponse: deferredWishPowerResponse,
  } = deferredSetup;
  const scanStacks = Math.max(99, Math.floor(Number(deferredStacks) || 0));
  const scanSetup = useMemo(() => ({
      state: deferredState,
      stacks: scanStacks,
      attackerHp: deferredAttackerHp,
      defenderHp: deferredDefenderHp,
      freeze: deferredFreeze,
      starfall: deferredStarfall,
      weather: deferredWeather,
      reduction: deferredReduction,
      showFollowup: deferredShowFollowup,
      normalElectric: deferredNormalElectric,
      dischargeElectrified: deferredDischargeElectrified,
      wishPowerType: deferredWishPowerType,
      wishPowerResponse: deferredWishPowerResponse,
  }), [
    deferredState,
    scanStacks,
    deferredAttackerHp,
    deferredDefenderHp,
    deferredFreeze,
    deferredStarfall,
    deferredWeather,
    deferredReduction,
    deferredShowFollowup,
    deferredNormalElectric,
    deferredDischargeElectrified,
    deferredWishPowerType,
    deferredWishPowerResponse,
  ]);
  const scanRows = useMemo(() => deferredState.sides.defender.spiritId
    ? calculateDeerSummaryRows(snapshot, scanSetup)
    : [], [snapshot, scanSetup, deferredState]);
  const rows = useMemo(() => scanRows.map((row) => ({
    ...row,
    current: row.evaluatedByStack[deferredStacks] ?? evaluateDeerAttack(snapshot, scanSetup, row, deferredStacks),
  })), [scanRows, deferredStacks, snapshot, scanSetup]);
  const expandedDetails = useMemo(() => {
    const variant = scanRows.find((row) => row.id === expandedRow);
    return variant ? calculateDeerRow(snapshot, scanSetup, variant) : null;
  }, [scanRows, expandedRow, snapshot, scanSetup]);
  const visibleRows = setup.showFollowup ? rows : rows.filter((row) => row.id !== "stone-counter").map((row) => row.id === "stone" ? { ...row, label: "裂石", note: "应对状态不改变本击伤害；勾选显示先发补刀后，区分普通与应对降防的后续伤害。" } : row);
  const updating = deferredSetup !== setup;
  const recordCalculationInput = useCalculationMetrics({ feature: "deer", input: deferredSetup,
    resultKind: deerResultKind(visibleRows, updating) });
  function setSetup(update) {
    const previous = setupRef.current;
    const next = typeof update === "function" ? update(previous) : update;
    setupRef.current = next;
    recordCalculationInput(next, previous);
    commitSetup(next);
  }
  const speed = rows[0]?.current.speed;
  const best = bestRow(visibleRows, "minimum");
  const activeMinimum = appliedMinimum?.setup === setup ? appliedMinimum : null;
  const combo = bestRow(rows, "comboMinimum");
  const warnings = [...new Set(rows.flatMap((row) => row.current.first.warnings ?? []))].filter((warning) => typeof warning === "string");
  const defender = snapshot.spirits.find((spirit) => spirit.id === setup.state.sides.defender.spiritId);
  const defenseTrait = defender ? getTraitView(snapshot, defender, "defender") : null;
  const defenseContext = { ...(defender ? materializeTraitContext(setup.state.sides.defender.traitValues, snapshot, defender.id, "defender") : {}), ...setup.state.directions.forward.context };
  const stats = defender ? panelFor(snapshot, setup.state.sides.defender) : null;
  const attackerMaxHp = panelFor(snapshot, setup.state.sides.attacker).hp;
  const darkBetActive = Math.max(1, Math.round(attackerMaxHp * setup.attackerHp / 100)) < attackerMaxHp / 2;
  const defenseLimitations = defender ? getDeerDefenseLimitations(snapshot, setup.state.sides.defender) : [];
  const conditions = [
    setup.attackerHp !== 100 && `自身HP ${Number(setup.attackerHp.toFixed(2))}%`,
    setup.weather !== "none" && t("{weather}（不计天气伤害）", { weather: { rain: "雨天", thunder: "雷暴", sandstorm: "沙尘暴", blizzard: "暴风雪", dream: "萌系天气（占位）" }[setup.weather] }),
    setup.state.directions.forward.overrides.attackLevelStage && t("攻击等级 {stage}", { stage: setup.state.directions.forward.overrides.attackLevelStage }),
    setup.state.directions.forward.overrides.defenseLevelStage && t("防御等级 {stage}", { stage: setup.state.directions.forward.overrides.defenseLevelStage }),
    setup.reduction > 0 && `减伤 ${Number(setup.reduction.toFixed(2))}%`,
    setup.starfall > 0 && t("星陨 {count}层", { count: setup.starfall }),
    setup.freeze > 0 && `${t("冻结 {count}层", { count: setup.freeze })}${defender?.types.includes("冰") ? t("（冰系免疫）") : ""}`,
  ].filter(Boolean);
  const setOptions = (patch) => setSetup((current) => ({ ...current, ...patch }));
  function fillMinimum() {
    if (updating || !best) return;
    const next = { ...setup, stacks: best.minimum };
    setSetup(next);
    setAppliedMinimum({ setup: next, id: best.id, label: best.label, condition: best.condition });
  }
  function setSide(sideKey, patch, manual = true) {
    setSetup((current) => {
      const directions = Object.hasOwn(patch, "traitValues")
        ? Object.fromEntries(Object.entries(current.state.directions).map(([key, direction]) => {
          const role = (key === "forward") === (sideKey === "attacker") ? "attackerTrait" : "defenderTrait";
          return [key, { ...direction, context: Object.fromEntries(Object.entries(direction.context).filter(([id]) => !id.startsWith(role))) }];
        })) : current.state.directions;
      return { ...current, ...(manual ? (sideKey === "attacker" ? { attackPreset: "custom" } : { defenseTemplate: "custom" }) : {}), state: { ...current.state, directions, sides: { ...current.state.sides, [sideKey]: { ...current.state.sides[sideKey], ...patch } } } };
    });
  }
  function selectSpirit(sideKey, id) {
    setSetup((current) => {
      const next = structuredClone(current);
      const four = chooseDefaultSkillIds(snapshot, id);
      Object.assign(next.state.sides[sideKey], { spiritId: id, traitValues: {}, acquiredTraitIds: [], acquiredTraitValues: {}, skills: { four, single: four[0] ?? null } });
      for (const [key, direction] of Object.entries(next.state.directions)) {
        const role = (key === "forward") === (sideKey === "attacker") ? "attackerTrait" : "defenderTrait";
        direction.context = Object.fromEntries(Object.entries(direction.context).filter(([id]) => !id.startsWith(role)));
      }
      if (sideKey === "attacker" && next.attackPreset === "saved") next.attackPreset = "custom";
      if (sideKey === "attacker" && next.attackPreset === "standard") {
        Object.assign(next.state.sides.attacker, standardAttackPreset(snapshot.spirits.find((spirit) => spirit.id === id)?.fullName));
      }
      if (sideKey === "defender") {
        const preset = presets[id];
        next.state.sides.defender = applyDeerPreset(next.state.sides.defender, preset ?? DEFENSE_TEMPLATES.find((entry) => entry.id === "hp"));
        next.defenseTemplate = preset ? "saved" : "hp";
      }
      return next;
    });
  }
  function setOverride(key, value) {
    setSetup((current) => ({ ...current, state: { ...current.state, directions: { ...current.state.directions, forward: { ...current.state.directions.forward, overrides: { ...current.state.directions.forward.overrides, [key]: value } } } } }));
  }
  function setTrait(id, value) {
    const control = defenseTrait.inputs.find((input) => input.id === id);
    if (!control) return;
    setSetup((current) => ({ ...current, state: { ...current.state,
      sides: { ...current.state.sides, defender: { ...current.state.sides.defender, traitValues: { ...current.state.sides.defender.traitValues, [canonicalTraitControlKey(control)]: value } } },
      directions: { ...current.state.directions, forward: { ...current.state.directions.forward, context: { ...current.state.directions.forward.context, [id]: value } } },
    } }));
  }
  return <><DeerHeader onReturn={onReturn} /><main className="deer-page">
    <div className="deer-scenery" aria-hidden="true"><div className="deer-scenery-shards" /><img className="deer-scenery-portrait" src={publicResourceUrl("/assets/deer/bopulu-background-v2.webp")} alt="" width="1024" height="1536" decoding="async" draggable={false} /><div className="deer-scenery-spark deer-scenery-spark--right" /><div className="deer-scenery-spark deer-scenery-spark--left" /></div>
    <div className="deer-header"><span>{t("共享计算内核 · 60级")}</span></div>
    <div className="deer-configs">{["attacker", "defender"].map((sideKey) => <div className="deer-config-column" key={sideKey}><SideConfiguration snapshot={snapshot} setup={setup} sideKey={sideKey} presets={presets} onSide={(patch, manual) => setSide(sideKey, patch, manual)} onSetup={setOptions} onSelect={(id) => selectSpirit(sideKey, id)} onDefenseLevel={(value) => setOverride("defenseLevelStage", value)}>
      {sideKey === "defender" && hasDeerDefenseTrait(snapshot, setup.state.sides.defender) && <DefenderTraitConfiguration snapshot={snapshot} spirit={defender} side={setup.state.sides.defender} trait={defenseTrait} context={defenseContext} onTrait={setTrait} onSide={(patch) => setSide("defender", patch, false)} />}
    </SideConfiguration>{sideKey === "attacker" && defender && speed && <section className="deer-speed" aria-label={t("速度对比")} aria-live="polite" aria-busy={updating}>
      <span>{t("速度对比")}</span><strong data-state={speed.state}>{t(updating ? t("正在复算…") : speed.label)}</strong>
      {speed.attacker !== null && <span className="deer-speed-values">{t("我方")}{" "}{speed.attacker}{" "}{t("/ 对方")}{" "}{speed.defender}</span>}
      <small>{setup.weather === "dream" ? t("同先制度，萌系天气下速度较慢者先行动") : t("同先制度，仅比较当前速度")}</small>
    </section>}</div>)}</div>
    {defender && <><section className="deer-conditions"><button type="button" aria-expanded={conditionsOpen} onClick={() => setConditionsOpen(!conditionsOpen)}><SlidersHorizontal size={16} /><strong>{t("战斗条件")}</strong><span data-active={conditions.length > 0}>{t(conditions.length ? conditions.join(" · ") : t("默认条件 · 天气 / 血量 / 能力 / 异常 / 减伤"))}</span><CaretDown size={14} /></button>
      {conditionsOpen && <div className="deer-conditions-body"><div className="deer-fields">
        <NumberField label={t("自身HP")} value={setup.attackerHp} min={1} suffix="%" onChange={(attackerHp) => setOptions({ attackerHp })} />
        <label className="deer-number">{t("天气")}<select aria-label={t("天气")} value={setup.weather} onChange={(event) => setOptions({ weather: event.target.value })}><option value="none">{t("无")}</option><option value="rain">{t("雨天")}</option><option value="thunder">{t("雷暴")}</option><option value="sandstorm">{t("沙尘暴")}</option><option value="blizzard">{t("暴风雪")}</option>{serverId !== "global" && <option value="dream">{t("萌系天气（占位）")}</option>}</select></label>
        <NumberField label={t("攻击能力等级")} integer min={-99} max={99} value={setup.state.directions.forward.overrides.attackLevelStage ?? 0} onChange={(value) => setOverride("attackLevelStage", value)} />
        <NumberField label={t("防守技能减伤")} suffix="%" value={setup.reduction} onChange={(reduction) => setOptions({ reduction })} />
        <NumberField label={t("敌方星陨")} integer max={99} value={setup.starfall} onChange={(starfall) => setOptions({ starfall })} />
        <NumberField label={t("敌方冻结")} integer max={20} value={setup.freeze} onChange={(freeze) => setOptions({ freeze })} />
      </div><p className="deer-muted">{t("天气仅用于内核已支持的技能／特性联动，不计天气本身的回合末伤害。")}</p><p className="deer-muted">{t("能力每层10%；冻结每层占最大生命5%，冰系免疫。先发按第一击后的生命和裂石降防复算；其余防守特性触发条件沿用手调值，不推演对手行动。")}</p></div>}
    </section>
    {defenseLimitations.length > 0 && <p className="deer-warning" role="note">{defenseLimitations.map(name => t(name)).join(locale === "en" ? ", " : "、")}{t("的保命效果尚未纳入本页。仅展示理论伤害，不提供确定斩杀层数或先发连招结论。")}</p>}
    {warnings.length > 0 && <p className="deer-warning" role="status">{warnings.map(warning => t(warning)).join(locale === "en" ? "; " : "；")}{t("。以下为当前内核条件下的估算，请核对特性。")}</p>}
    <div className="deer-summary" aria-live="polite"><span>{t("单招最低")}{" "}<strong>{best ? t("{v0} 层", { v0: best.minimum }) : rows.some((row) => !row.current.lethalKnown) ? t("条件待确认") : t("查询范围内未达")}</strong>{t(best?.label)}{best?.condition && <small>{t(best.condition)}</small>}<button className="deer-fill-minimum" type="button" disabled={updating || !best} onClick={fillMinimum} title={t("填入单招击倒的最低层数，不含先发补刀；额外条件不会自动开启")}>{t("一键填层数")}</button></span>{setup.showFollowup && <span>{t("接先发最低")}{" "}<strong>{combo ? t("{v0} 层", { v0: combo.comboMinimum }) : rows.some((row) => !row.current.lethalKnown) ? t("条件待确认") : t("查询范围内未达")}</strong>{t(combo?.label)}{combo?.condition && <small>{t(combo.condition)}</small>}</span>}</div>
    {activeMinimum && <p className="deer-fill-notice" role="status">{t("已填入")}{" "}{setup.stacks}{" "}{t("层 ·")}{" "}{t(activeMinimum.label)}{activeMinimum.condition ? t("（{v0}；条件未自动变更）", { v0: activeMinimum.condition }) : ""}</p>}
    <section className="deer-results" aria-label={t("技能斩杀线")} aria-busy={updating}><div className="deer-results-heading"><h2>{t("技能斩杀线")}</h2><span className="deer-muted">{updating ? t("正在复算…") : t("目标生命 {v0} · 当前 {v1}%", { v0: stats.hp, v1: setup.defenderHp })}</span><label className="deer-check"><input type="checkbox" checked={setup.showFollowup} onChange={(event) => { setOptions({ showFollowup: event.target.checked }); if (!event.target.checked && expandedRow === "stone-counter") setExpandedRow("stone"); }} />{t("显示先发补刀")}</label></div>
      <div className="deer-table-scroll"><table className="deer-table"><thead><tr><th>{t("技能 / 条件")}</th><th>{t("属性")}</th><th>{t("单招最低")}{" "}</th>{setup.showFollowup && <th>{t("接先发最低")}{" "}</th>}<th>{t("当前")}{" "}{deferredSetup.stacks}{" "}{t("层伤害")}</th><th><span className="sr-only">{t("详情")}</span></th></tr></thead><tbody>
        {visibleRows.map((row) => <Fragment key={row.id}><tr className={`${expandedRow === row.id ? "is-selected" : ""}${activeMinimum?.id === row.id ? " is-recommended" : ""}`} aria-selected={activeMinimum?.id === row.id || undefined}>
          <td><div className="deer-skill"><SkillIcon skill={row.skill} size={28} /><div><button type="button" className="deer-skill-name" aria-expanded={expandedRow === row.id} onClick={() => setExpandedRow(expandedRow === row.id ? null : row.id)}>{t(row.label)}</button>{row.condition && <small className="deer-condition-tag">{t(row.condition)}</small>}{row.id === "bet-dark" && <label className="deer-check deer-electric" title={t("勾选将自身HP设为49%，取消恢复100%；手动修改血量时同步状态")}><input type="checkbox" checked={darkBetActive} onChange={(event) => setOptions({ attackerHp: event.target.checked ? 49 : 100 })} />{t("触发暗特效")}</label>}{row.id === "discharge" && <label className="deer-check deer-electric"><input type="checkbox" checked={setup.dischargeElectrified === true} onChange={(event) => setOptions({ dischargeElectrified: event.target.checked })} />{t("触发2层引电")}</label>}{row.id === "wish-power" && <label className="deer-check deer-electric" title={t("目标本回合使用状态技能时，愿力冲击威力×2.5")}><input type="checkbox" aria-label={t("愿力冲击触发应对")} checked={setup.wishPowerResponse === true} onChange={(event) => setOptions({ wishPowerResponse: event.target.checked })} />{t("触发应对")}</label>}{row.id === "arc" && <label className="deer-electric"><span className="sr-only">{t("普通电系技能")}</span><select aria-label={t("普通电系技能")} value={setup.normalElectric} onChange={(event) => setOptions({ normalElectric: event.target.value })}><option value="电弧">{t("电弧")}</option><option value="离子火花">{t("离子火花")}</option></select><small>{t("同威力 · 不同能耗")}</small></label>}</div></div></td>
          <td><span className="deer-element"><ElementIcon type={row.skill.type} size={17} />{typeName(row.skill.type)}</span></td>
          <td className="deer-threshold" data-label={t("单招最低")}>{t(minimumText(row.minimum, row.current.lethalKnown))}</td>
          {setup.showFollowup && <td className="deer-threshold" data-label={t("接先发最低")}>{t(row.id === "first" ? "—" : minimumText(row.comboMinimum, row.current.lethalKnown))}</td>}
          <td><span className="deer-mobile-damage-label">{t("当前")}{" "}{deferredSetup.stacks}{" "}{t("层伤害")}</span><div className={`deer-damage ${row.current.lethal ? "is-lethal" : ""}`}><div><strong>{row.current.percent === null ? t("待确认") : `${row.current.percent.toFixed(1)}%`}</strong><small>{t(row.current.damage === null ? row.current.first.reason : `${row.current.damage} ${row.current.defenseLimitations.length ? "理论伤害" : "伤害"}${row.current.lethal ? " · 可击倒" : ""}`)}</small></div><div className="deer-bar"><i style={{ width: `${Math.min(100, row.current.percent ?? 0)}%` }} /><b title={t("冻结占{v0}%", { v0: row.current.freeze.thresholdPercent })} style={{ width: `${Math.min(100 - Math.min(100, row.current.percent ?? 0), row.current.freeze.thresholdPercent)}%` }} /></div></div>{row.current.electrified && <small className="deer-freeze-label">{t("通电")}{" "}{row.current.first.totalDamage ?? "—"}{" "}{t("＋ 引电")}{" "}{row.current.electrified.damage}{row.current.electrified.immune ? t("（免疫）") : ""}</small>}{setup.freeze > 0 && <small className="deer-freeze-label">{t("蓝色：冻结")}{" "}{row.current.freeze.thresholdPercent}%</small>}</td>
          <td><button type="button" className="deer-expand" aria-label={t("查看{v0}详情", { v0: row.label })} aria-expanded={expandedRow === row.id} onClick={() => setExpandedRow(expandedRow === row.id ? null : row.id)}>{expandedRow === row.id ? <CaretDown size={14} /> : <CaretRight size={14} />}</button></td>
        </tr>{expandedRow === row.id && <tr className="deer-detail"><td colSpan={setup.showFollowup ? 6 : 5}><p><strong>{t(row.label)}</strong> · {t(row.skill.description)}</p>{row.note && <p>{t(row.note)}</p>}{row.current.electrified && <p>{t("合计：通电")}{" "}{row.current.first.totalDamage ?? "—"}{" "}{t("＋ 引电")}{" "}{row.current.electrified.damage} ＝ {row.current.damage ?? "—"}{" "}{t("HP。按凑齐2层引电触发一次计算，最大生命25% × 电系克制；电系免疫，不额外结算天气和其他异常状态。")}</p>}<p>{t("实际威力")}{" "}{row.current.first.staticPower ?? "—"}{" "}{t("· 克制 ×")}{row.current.first.typeMultiplier ?? "—"}{" "}{t("· 目标剩余")}{" "}{row.current.remainingHp ?? "—"} HP{setup.freeze > 0 ? t(" · 冻结占 {v0}%（{v1} HP）", { v0: row.current.freeze.thresholdPercent, v1: row.current.freeze.thresholdHp }) : ""}</p>{row.current.followup && <p>{t("本次")}{" "}{row.current.damage}{" "}{t("＋ 先发")}{" "}{row.current.followup.totalDamage} ＝ {row.current.comboDamage}{" "}{t("伤害 ·")}{" "}{row.current.comboLethal ? t("可击倒") : t("未击倒")}</p>}{row.current.followupReason && <p>{t(row.current.followupReason)}</p>}
          {row.current.first.warnings?.map((warning, index) => <p role="note" key={index}>{t(typeof warning === "string" ? warning : warning.message ?? JSON.stringify(warning))}</p>)}
          <div className="deer-layer-grid">{expandedDetails?.byStack.map((entry) => <div key={entry.stacks} data-lethal={entry.lethal}><strong>{entry.stacks}{" "}{t("层")}</strong><span>{entry.damage ?? t("待定")} HP</span><small>{!entry.lethalKnown ? t("待确认") : entry.lethal ? t("单招击倒") : entry.comboLethal && setup.showFollowup ? t("接先发击倒") : t("未击倒")}</small></div>)}</div>
          <details><summary>{t("查看当前层计算过程")}</summary>{row.current.first.formulaSteps?.map((step, index) => <p key={index}>{t(step.label)}：{typeof step.value === "object" ? JSON.stringify(step.value) : step.value ?? step.after ?? "—"}</p>)}</details>
        </td></tr>}</Fragment>)}
      </tbody></table></div>
    </section></>}
    {!defender && <p className="deer-summary" role="status">{t("请选择防御方后查看技能斩杀线。")}</p>}
    <footer className="deer-footer"><span>{t("按特性层数查询 · 点击技能查看逐层伤害")}</span><span>{t("先发为理论连续出招；通电可选计一次引电，其余不模拟对手行动与回合末伤害")}</span></footer>
  </main></>;
}

export default function DeerPage(props) {
  const { release } = useRuntime();
  const { t } = useLocale();
  if (release.capabilities.calculate) return <VerifiedDeerPage {...props} />;
  return <><DeerHeader onReturn={props.onReturn} /><main className="deer-page"><p role="status">{t("国际服数值与规则待核验，暂不可计算斩杀线。")}</p></main></>;
}

function VerifiedDeerPage({ initialState = null, onReturn }) {
  const { serverId } = useRuntime();
  const { t } = useLocale();
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const previousTitle = isWebDocument() ? null : document.title;
    if (previousTitle !== null) document.title = "电鹿斩杀线 · 洛克计算器";
    const controller = new AbortController();
    async function load() {
      try {
        const raw = await loadServerSnapshot(serverId, { signal: controller.signal });
        const snapshot = serverId === "cn" ? withCalculatorExtras(raw) : raw;
        let presets = {};
        try {
          const response = serverId === "cn" ? await fetch(publicResourceUrl("/data/presets/pvp-popular-configs.json"), { signal: controller.signal }) : null;
          if (response?.ok) presets = Object.fromEntries((await response.json()).entries.map((preset) => [preset.spiritId, preset]));
        } catch { /* 无网络时仍可使用四种模板。 */ }
        try { presets = { ...presets, ...spiritConfigsRepository({ serverId }).load(snapshot).configs }; } catch { /* 不可用的本地存储不阻断计算。 */ }
        if (!controller.signal.aborted) setData({ snapshot, presets });
      } catch { if (!controller.signal.aborted) setError(true); }
    }
    load();
    return () => { controller.abort(); if (previousTitle !== null) document.title = previousTitle; };
  }, [serverId]);
  if (!data) return <><DeerHeader onReturn={onReturn} /><main className="deer-page"><p role={error ? "alert" : "status"}>{t(error ? "资料加载失败，请重试。" : "正在加载电鹿斩杀线…")}</p>{error && <button className="secondary-action" type="button" onClick={() => window.location.reload()}>{t("重新加载")}</button>}</main></>;
  return <DeerWorkspace {...data} initialState={initialState} onReturn={onReturn} />;
}
