import { useEffect, useRef, useState } from "react";

function validationMessage(mode, draft) {
  if (draft === "") return "";
  const value = Number(draft);
  if (!Number.isFinite(value) || value < 0 || value > 9999) {
    return `请输入 0–9999 的${mode === "panel" ? "显示" : "静态"}威力`;
  }
  if (!Number.isInteger(value)) {
    return `${mode === "panel" ? "显示" : "静态"}威力只能填整数`;
  }
  return "";
}

export function PowerDraftInput({
  ariaLabel,
  className = "",
  disabled = false,
  isManual = false,
  mode = "static",
  onClear,
  onCommit,
  value,
}) {
  const [draft, setDraft] = useState(String(value ?? ""));
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const changed = useRef(false);
  const draftMode = useRef(mode);

  useEffect(() => {
    // 无错误的非编辑态跟外部威力；非法草稿保留供修正，切换口径仍丢弃。
    const modeChanged = draftMode.current !== mode;
    if (modeChanged) {
      draftMode.current = mode;
      changed.current = false;
      setEditing(false);
      setError("");
    }
    if (modeChanged || (!editing && !error)) setDraft(String(value ?? ""));
  }, [editing, error, mode, value]);

  function restoreCurrent() {
    changed.current = false;
    setDraft(String(value ?? ""));
    setError("");
  }

  function submit() {
    if (!changed.current) return true;
    changed.current = false;
    if (draft === "") {
      setError("");
      onClear?.();
      return true;
    }
    const message = validationMessage(mode, draft);
    setError(message);
    if (message) return false;
    onCommit?.(Number(draft));
    return true;
  }

  function step(direction) {
    const current = Number(draft === "" ? value : draft);
    const next = Math.min(9999, Math.max(0, (Number.isFinite(current) ? current : 0) + direction));
    const normalized = Math.round(next);
    changed.current = false;
    setDraft(String(normalized));
    setError("");
    onCommit?.(normalized);
  }

  return (
    <span className={`power-draft${className ? ` ${className}` : ""}`}>
      <span className="power-draft__control">
        <input
          aria-describedby={error ? `${ariaLabel}-error` : undefined}
          aria-invalid={Boolean(error)}
          aria-label={ariaLabel}
          disabled={disabled}
          max="9999"
          min="0"
          onBlur={() => {
            setEditing(false);
            submit();
          }}
          onChange={(event) => {
            changed.current = true;
            setEditing(true);
            setDraft(event.target.value);
            if (error) setError("");
          }}
          onFocus={() => setEditing(true)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              submit();
            } else if (event.key === "Escape") {
              event.preventDefault();
              setEditing(false);
              restoreCurrent();
            } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
              event.preventDefault();
              step(event.key === "ArrowUp" ? 1 : -1);
            }
          }}
          step="1"
          type="number"
          value={draft}
        />
        {isManual ? (
          <button
            aria-label="恢复自动威力"
            className="power-draft__reset"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              changed.current = false;
              setEditing(false);
              setError("");
              onClear?.();
            }}
            title="恢复自动威力"
            type="button"
          >
            ↺
          </button>
        ) : null}
      </span>
      {error ? (
        <small className="power-draft__error" id={`${ariaLabel}-error`} role="alert">
          {error}
        </small>
      ) : null}
    </span>
  );
}
