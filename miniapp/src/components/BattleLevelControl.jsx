import { useEffect, useState } from "react";
import { Button, Input, Text, View } from "@tarojs/components";

export default function BattleLevelControl({ control, onChange, side, value }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value, control.id]);
  const label = `${side === "attacker" ? "攻击方" : "防守方"}等级`;
  const { min = 1, max = 150, step = 1 } = control;
  const clamp = number => Math.min(max, Math.max(min, Math.trunc(number)));
  function commit() {
    const next = draft.trim() === "" || !Number.isFinite(Number(draft))
      ? value : clamp(Number(draft));
    setDraft(String(next));
    if (next !== value) onChange(next);
  }
  function adjust(delta) {
    const next = clamp(value + delta);
    setDraft(String(next));
    if (next !== value) onChange(next);
  }
  return (
    <View aria-label={`${label}快捷调整`} className="battle-level-control">
      <Text className="battle-level-control__label">等级</Text>
      <View className="battle-level-control__stepper">
        <Button aria-label={`${label}降低${step}级`} className="battle-level-control__button"
          disabled={value <= min} onClick={() => adjust(-step)}>−{step}</Button>
        <Input aria-label={label} className="battle-level-control__input" type="number"
          min={min} max={max} confirmType="done" value={draft}
          onInput={event => {
            const text = String(event.detail?.value ?? event.target?.value ?? "");
            setDraft(text);
            const number = Number(text);
            if (text.trim() && Number.isInteger(number) && number >= min && number <= max && number !== value) {
              onChange(number);
            }
          }} onBlur={commit} onConfirm={commit} />
        <Button aria-label={`${label}提高${step}级`} className="battle-level-control__button"
          disabled={value >= max} onClick={() => adjust(step)}>+{step}</Button>
      </View>
    </View>
  );
}
