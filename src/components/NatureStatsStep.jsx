import { Minus, Plus } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { DurabilityOverview } from "./DurabilityOverview.jsx";
import { NatureEffect } from "./NatureEffect.jsx";
import { NatureSelect } from "./NatureSelect.jsx";
import { StatTile } from "./StatTile.jsx";
import { abilityAdjustedStat, clampAbilityStage } from "../domain/skill-result/numeric.js";

const HOLD_DELAY_MS = 350;
const HOLD_INTERVAL_MS = 80;

export function abilityLevelHint(multiplier) {
  return `原值的 ${Math.round(multiplier * 1000) / 10}%`;
}

function abilityStageLabel(stage) {
  return `${stage}层 · ${stage > 0 ? "+" : ""}${stage * 10}%`;
}

export function RepeatLevelButton({
  ariaLabel,
  children,
  delta,
  disabled,
  onChange,
  value,
}) {
  const timeoutRef = useRef(null);
  const intervalRef = useRef(null);
  const valueRef = useRef(value);
  const repeatedRef = useRef(false);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  function stopRepeat() {
    globalThis.clearTimeout(timeoutRef.current);
    globalThis.clearInterval(intervalRef.current);
    timeoutRef.current = null;
    intervalRef.current = null;
  }

  useEffect(() => stopRepeat, []);

  function step() {
    const next = Math.max(-99, Math.min(99, valueRef.current + delta));
    if (next === valueRef.current) {
      stopRepeat();
      return;
    }
    valueRef.current = next;
    onChange(next);
  }

  function handlePointerDown(event) {
    if (disabled || (event.button !== undefined && event.button !== 0)) return;
    stopRepeat();
    repeatedRef.current = false;
    timeoutRef.current = globalThis.setTimeout(() => {
      repeatedRef.current = true;
      step();
      intervalRef.current = globalThis.setInterval(step, HOLD_INTERVAL_MS);
    }, HOLD_DELAY_MS);
  }

  function handleClick(event) {
    if (repeatedRef.current) {
      event.preventDefault();
      repeatedRef.current = false;
      return;
    }
    step();
  }

  return (
    <button
      aria-label={ariaLabel}
      disabled={disabled}
      onBlur={stopRepeat}
      onClick={handleClick}
      onPointerCancel={stopRepeat}
      onPointerDown={handlePointerDown}
      onPointerLeave={stopRepeat}
      onPointerUp={stopRepeat}
      type="button"
    >
      {children}
    </button>
  );
}

function SideStats({
  accent,
  label,
  onAnalyze,
  onIvChange,
  onLevelChange = () => {},
  onNatureChange,
  showDurabilityOverview,
  side,
}) {
  const [panelView, setPanelView] = useState({
    showFinalPanel: true,
    spiritId: side.id,
  });
  const showFinalPanel =
    panelView.spiritId === side.id ? panelView.showFinalPanel : true;

  const fallbackLevel = side.level ?? {
    label: label === "攻击方" ? "攻击能力等级" : "防御能力等级",
    multiplier: 1,
    stage: 0,
  };
  const levels = side.levels?.length > 0 ? side.levels : [fallbackLevel];
  const multipleLevels = levels.length > 1;
  return (
    <div aria-label={`${label}能力`} className="nature-side" role="group">
      {side.fullName ? (
        <div
          className={`nature-side__identity nature-side__identity--${accent}`}
          title={`${label} · ${side.fullName}`}
        >
          {label} · {side.fullName}
        </div>
      ) : null}
      <NatureSelect
        ariaLabel={`${label}性格`}
        onChange={onNatureChange}
        value={side.nature}
      />
      <NatureEffect natureId={side.nature} />

      <div className="stat-grid">
        {side.stats.map((stat) => (
          <StatTile
            accent={accent}
            basePanel={stat.basePanel}
            change={stat.change}
            delta={stat.delta}
            displayIv={stat.displayIv}
            key={stat.key}
            label={stat.label}
            natureId={side.nature}
            onIvChange={(value) => onIvChange(stat.key, value)}
            onPanelToggle={() =>
              setPanelView({
                showFinalPanel: !showFinalPanel,
                spiritId: side.id,
              })
            }
            panel={stat.panel}
            race={stat.race}
            showFinalPanel={showFinalPanel}
            stat={stat.key}
          />
        ))}
      </div>

      {showDurabilityOverview ? (
        <DurabilityOverview
          accent={accent}
          label={label}
          onAnalyze={onAnalyze}
          showFinalPanel={showFinalPanel}
          stats={side.stats}
        />
      ) : null}

      {levels.map((level) => {
        const bonusStage = Number(level.bonusStages?.physical ?? level.bonusStage) || 0;
        const magicalBonusStage = Number(level.bonusStages?.magical ?? bonusStage) || 0;
        const displayedStage = clampAbilityStage((Number(level.stage) || 0) + bonusStage);
        const magicalStage = clampAbilityStage((Number(level.stage) || 0) + magicalBonusStage);
        const splitAttackStages = displayedStage !== magicalStage;
        const levelHint = bonusStage !== magicalBonusStage
          ? `手调 ${level.stage}层（双攻） · 特性：物攻 ${bonusStage > 0 ? "+" : ""}${bonusStage}层、魔攻 ${magicalBonusStage > 0 ? "+" : ""}${magicalBonusStage}层`
          : bonusStage
            ? `手调 ${level.stage}层 · 特性 ${bonusStage > 0 ? "+" : ""}${bonusStage}层；${abilityLevelHint(abilityAdjustedStat(1, displayedStage))}`
            : abilityLevelHint(level.multiplier);
        const changeLevel = (nextStage) =>
          multipleLevels
            ? onLevelChange(level.role, nextStage)
            : onLevelChange(nextStage);
        const controlLabel = multipleLevels
          ? `${label}${level.label}`
          : `${label}等级`;
        return (
          <div className="level-control" key={level.role ?? level.label}>
            <span>{level.label}</span>
            <div>
              <RepeatLevelButton
                ariaLabel={`${controlLabel}减一`}
                delta={-1}
                disabled={level.stage <= -99}
                onChange={changeLevel}
                value={level.stage}
              >
                <Minus aria-hidden="true" size={14} />
              </RepeatLevelButton>
              <output title={levelHint}>
                {splitAttackStages ? (
                  <>
                    <span>物攻 {abilityStageLabel(displayedStage)}</span>
                    <br />
                    <span>魔攻 {abilityStageLabel(magicalStage)}</span>
                  </>
                ) : abilityStageLabel(displayedStage)}
              </output>
              <RepeatLevelButton
                ariaLabel={`${controlLabel}加一`}
                delta={1}
                disabled={level.stage >= 99}
                onChange={changeLevel}
                value={level.stage}
              >
                <Plus aria-hidden="true" size={14} />
              </RepeatLevelButton>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function NatureStatsStep({
  attacker,
  defender,
  onAttackerAnalyze,
  onAttackerIvChange,
  onAttackerLevelChange,
  onAttackerNatureChange,
  onDefenderAnalyze,
  onDefenderIvChange,
  onDefenderLevelChange,
  onDefenderNatureChange,
  showDurabilityOverview = false,
}) {
  return (
    <section aria-label="性格配置" className="calculator-step">
      <div className="nature-grid">
        <SideStats
          accent="attack"
          label="攻击方"
          onAnalyze={onAttackerAnalyze}
          onIvChange={onAttackerIvChange}
          onLevelChange={onAttackerLevelChange}
          onNatureChange={onAttackerNatureChange}
          showDurabilityOverview={showDurabilityOverview}
          side={attacker}
        />
        <SideStats
          accent="defense"
          label="防御方"
          onAnalyze={onDefenderAnalyze}
          onIvChange={onDefenderIvChange}
          onLevelChange={onDefenderLevelChange}
          onNatureChange={onDefenderNatureChange}
          showDurabilityOverview={showDurabilityOverview}
          side={defender}
        />
      </div>
    </section>
  );
}
