import { useEffect, useState } from "react";

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}

function percentage(currentHp, maxHp) {
  if (!(maxHp > 0)) return 0;
  return Number(((clamp(currentHp, 0, maxHp) / maxHp) * 100).toFixed(1));
}

export function HealthInput({
  currentHp,
  defaultMode = "hp",
  label,
  maxHp,
  onCurrentHpChange,
  onPercentChange,
  percentValue,
}) {
  const [mode, setMode] = useState(defaultMode);
  const displayedValue =
    mode === "percent"
      ? percentValue ?? percentage(currentHp, maxHp)
      : currentHp;
  const [draft, setDraft] = useState(String(displayedValue));

  useEffect(() => {
    setDraft(String(displayedValue));
  }, [displayedValue, mode]);

  function changeMode(nextMode) {
    setMode(nextMode);
    const nextValue =
      nextMode === "percent"
        ? percentValue ?? percentage(currentHp, maxHp)
        : currentHp;
    setDraft(String(nextValue));
  }

  function commit(value) {
    if (value === "") return;
    if (mode === "percent") {
      const normalized = clamp(value, 0, 100);
      onCurrentHpChange?.(Math.round((maxHp * normalized) / 100));
      onPercentChange?.(normalized);
      return;
    }
    const normalized = clamp(value, 0, maxHp);
    onCurrentHpChange?.(normalized);
    onPercentChange?.(percentage(normalized, maxHp));
  }

  return (
    <div className="health-input">
      <button
        aria-label={mode === "hp" ? "按百分比输入" : "按当前值输入"}
        className="health-input__mode"
        onClick={() => changeMode(mode === "hp" ? "percent" : "hp")}
        title={mode === "hp" ? "切换为百分比" : "切换为当前生命"}
        type="button"
      >
        {mode === "hp" ? "%" : "HP"}
      </button>
      <label className="health-input__field">
        <input
          aria-label={
            mode === "percent"
              ? `${label}生命百分比`
              : `${label}当前生命`
          }
          inputMode="decimal"
          max={mode === "percent" ? 100 : maxHp}
          min="0"
          onBlur={() => {
            if (draft === "") setDraft(String(displayedValue));
          }}
          onChange={(event) => {
            setDraft(event.target.value);
            commit(event.target.value);
          }}
          step={mode === "percent" ? "0.1" : "1"}
          type="number"
          value={draft}
        />
        <span>{mode === "percent" ? "%" : `/ ${maxHp}`}</span>
      </label>
    </div>
  );
}
