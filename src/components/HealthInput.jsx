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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 外部生命值变化时同步草稿，渲染期写入会丢掉输入法组字
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
      <div className="health-input__modes" role="group" aria-label={`${label}生命输入单位`}>
        {["hp", "percent"].map((unit) => (
          <button
            key={unit}
            aria-label={unit === "hp" ? "按当前值输入" : "按百分比输入"}
            aria-pressed={mode === unit}
            className="health-input__mode"
            onClick={() => changeMode(unit)}
            title={unit === "hp" ? "按当前生命输入" : "按百分比输入"}
            type="button"
          >
            {unit === "hp" ? "HP" : "%"}
          </button>
        ))}
      </div>
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
          onBlur={() => setDraft(String(displayedValue))}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              setDraft(String(displayedValue));
            }
          }}
          onChange={(event) => {
            setDraft(event.target.value);
            commit(event.target.value);
          }}
          step={mode === "percent" ? "0.1" : "1"}
          type="number"
          value={draft}
        />
        {mode === "hp" && <span>{`/ ${maxHp}`}</span>}
      </label>
    </div>
  );
}
