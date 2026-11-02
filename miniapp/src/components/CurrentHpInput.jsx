import { useEffect, useState } from "react";
import { Input } from "@tarojs/components";

export default function CurrentHpInput({ className, label, maxHp, onChange, resetKey, value }) {
  const [draft, setDraft] = useState(Number.isFinite(value) ? String(value) : "");
  useEffect(() => setDraft(Number.isFinite(value) ? String(value) : ""), [value, maxHp, resetKey]);

  function commit() {
    const numeric = Number(draft);
    const next = draft.trim() === "" || !Number.isFinite(numeric)
      ? value
      : Math.min(maxHp ?? numeric, Math.max(0, Math.floor(numeric)));
    setDraft(Number.isFinite(next) ? String(next) : "");
    if (Number.isFinite(next) && next !== value) onChange?.(next);
  }

  return (
    <Input aria-label={label} className={className} confirmType="done" inputMode="numeric"
      max={maxHp ?? undefined} min="0" placeholder="输入" type="number" value={draft}
      onInput={event => {
        const text = String(event?.detail?.value ?? event?.target?.value ?? "");
        setDraft(text);
        const numeric = Number(text);
        if (text.trim() && Number.isInteger(numeric) && numeric >= 0 &&
            (!Number.isFinite(maxHp) || numeric <= maxHp) && numeric !== value) onChange?.(numeric);
      }} onBlur={commit} onConfirm={commit} />
  );
}
