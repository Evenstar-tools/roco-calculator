import { Minus, Plus } from "@phosphor-icons/react";
import { useEffect, useRef } from "react";
import { NatureEffect } from "./NatureEffect.jsx";
import { NatureSelect } from "./NatureSelect.jsx";
import { StatTile } from "./StatTile.jsx";

const HOLD_DELAY_MS = 350;
const HOLD_INTERVAL_MS = 80;

function RepeatLevelButton({
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
    const next = Math.max(-50, Math.min(50, valueRef.current + delta));
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
  onIvChange,
  onLevelChange = () => {},
  onNatureChange,
  side,
}) {
  const fallbackLevel = side.level ?? {
    label: label === "攻击方" ? "攻击能力等级" : "防御能力等级",
    multiplier: 1,
    stage: 0,
  };
  const levels = side.levels?.length > 0 ? side.levels : [fallbackLevel];
  const multipleLevels = levels.length > 1;
  return (
    <div aria-label={`${label}能力`} className="nature-side" role="group">
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
            displayIv={stat.displayIv}
            key={stat.key}
            label={stat.label}
            onIvChange={(value) => onIvChange(stat.key, value)}
            panel={stat.panel}
            race={stat.race}
            stat={stat.key}
          />
        ))}
      </div>

      {levels.map((level) => {
        const levelPercent = Math.round((level.multiplier - 1) * 100);
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
                disabled={level.stage <= -50}
                onChange={changeLevel}
                value={level.stage}
              >
                <Minus aria-hidden="true" size={14} />
              </RepeatLevelButton>
              <output>
                {level.stage}层 · {levelPercent > 0 ? "+" : ""}
                {levelPercent}%
              </output>
              <RepeatLevelButton
                ariaLabel={`${controlLabel}加一`}
                delta={1}
                disabled={level.stage >= 50}
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
  onAttackerIvChange,
  onAttackerLevelChange,
  onAttackerNatureChange,
  onDefenderIvChange,
  onDefenderLevelChange,
  onDefenderNatureChange,
}) {
  return (
    <section aria-label="性格配置" className="calculator-step">
      <div className="nature-grid">
        <SideStats
          accent="attack"
          label="攻击方"
          onIvChange={onAttackerIvChange}
          onLevelChange={onAttackerLevelChange}
          onNatureChange={onAttackerNatureChange}
          side={attacker}
        />
        <SideStats
          accent="defense"
          label="防御方"
          onIvChange={onDefenderIvChange}
          onLevelChange={onDefenderLevelChange}
          onNatureChange={onDefenderNatureChange}
          side={defender}
        />
      </div>
    </section>
  );
}
