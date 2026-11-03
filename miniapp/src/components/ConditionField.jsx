import { Button, Input, Picker, Text, View } from "@tarojs/components";
import { useEffect, useState } from "react";

function eventValue(event) {
  return event?.detail?.value ?? event?.target?.value ?? "";
}

function clampNumeric(value, minimum = 0, maximum) {
  return Math.min(
    maximum ?? Number.POSITIVE_INFINITY,
    Math.max(minimum, value),
  );
}

function classes(...values) {
  return values.filter(Boolean).join(" ");
}

function NumericConditionInput({ className, input, onChange, value }) {
  const canonical = value ?? input.defaultValue ?? "";
  const [draft, setDraft] = useState(String(canonical));
  useEffect(() => setDraft(String(canonical)), [canonical]);
  const minimum = input.min ?? 0;
  const maximum = input.max;
  function commit(event) {
    const text = String(event?.detail?.value ?? event?.target?.value ?? draft);
    const numeric = Number(text);
    const next = text.trim() && Number.isFinite(numeric)
      ? clampNumeric(numeric, minimum, maximum)
      : canonical;
    setDraft(String(next));
    if (next !== canonical) onChange(next);
  }
  return <Input aria-label={input.label} className={classes("condition-editor__input", className)}
    confirmType="done" inputMode="numeric" max={maximum} min={minimum} step={input.step ?? 1}
    type="number" value={draft} onBlur={commit} onConfirm={commit}
    onInput={event => {
      const text = String(eventValue(event));
      setDraft(text);
      const numeric = Number(text);
      if (text.trim() && Number.isFinite(numeric) && numeric >= minimum &&
          (maximum === undefined || numeric <= maximum)) onChange(numeric);
    }} />;
}

export function ConditionField({ className, input, onChange, value }) {
  if (input.hidden === true) return null;
  if (input.action) return (
    <Button aria-label={input.label} className={classes("condition-editor__choice", className)}
      onClick={() => onChange(true)}>{input.label}</Button>
  );
  if (input.selectOptions?.length) {
    const options = input.selectOptions;
    const index = Math.max(0, options.findIndex(option => option.value === (value ?? input.defaultValue)));
    return (
      <View className="condition-editor__field">
        <Text className="condition-editor__label">{input.label}</Text>
        <Picker aria-label={input.label} mode="selector" range={options.map(option => option.label)} value={index}
          onChange={event => onChange(options[Number(eventValue(event))]?.value ?? input.defaultValue)}>
          <View className={classes("condition-editor__choice", className)} style={{ width: "100%", height: "auto", whiteSpace: "normal", wordBreak: "break-all", boxSizing: "border-box" }}>
            {options[index].label} ▾
          </View>
        </Picker>
      </View>
    );
  }
  if (input.type === "boolean") {
    return (
      <Button
        aria-label={input.label}
        aria-pressed={value === true}
        className={classes(
          value === true
            ? "condition-editor__toggle condition-editor__toggle--active"
            : "condition-editor__toggle",
          className,
        )}
        onClick={() => onChange(value !== true)}
      >
        <Text className="condition-editor__toggle-label">{input.label}</Text>
        <Text className="condition-editor__toggle-state">
          {value === true ? "已开启" : "未开启"}
        </Text>
      </Button>
    );
  }

  if (input.type === "choice") {
    return (
      <View className="condition-editor__field">
        <Text className="condition-editor__label">{input.label}</Text>
        <View className="condition-editor__choices">
          {(input.options ?? []).map((option) => (
            <Button
              aria-label={option.label}
              aria-pressed={value === option.value}
              className={classes(
                value === option.value
                  ? "condition-editor__choice condition-editor__choice--active"
                  : "condition-editor__choice",
                className,
              )}
              key={option.value}
              onClick={() => onChange(option.value)}
            >
              {option.label}
            </Button>
          ))}
        </View>
      </View>
    );
  }

  const minimum = input.min ?? 0;
  const maximum = input.max;
  const step = Number(input.step) > 0 ? Number(input.step) : 1;
  const numericCurrent = Number(value ?? input.defaultValue ?? minimum);
  const current = clampNumeric(
    Number.isFinite(numericCurrent) ? numericCurrent : minimum,
    minimum,
    maximum,
  );
  const decreaseDisabled = current <= minimum;
  const increaseDisabled = maximum !== undefined && current >= maximum;

  return (
    <View className="condition-editor__field condition-editor__field--number">
      <Text className="condition-editor__label">{input.label}</Text>
      <View className={classes("condition-editor__number-stepper", (input.contextKey ?? input.key) === "skillUseCount" && "condition-editor__number-stepper--usage")}>
        <Button
          aria-label={`${input.label}减少`}
          className={classes(
            "condition-editor__step-button",
            decreaseDisabled && "condition-editor__step-button--disabled",
          )}
          disabled={decreaseDisabled}
          hoverClass="condition-editor__step-button--pressed"
          onClick={() => onChange(clampNumeric(current - step, minimum, maximum))}
        >
          −
        </Button>
        <NumericConditionInput className={className} input={input} onChange={onChange} value={value} />
        <Button
          aria-label={`${input.label}增加`}
          className={classes(
            "condition-editor__step-button",
            increaseDisabled && "condition-editor__step-button--disabled",
          )}
          disabled={increaseDisabled}
          hoverClass="condition-editor__step-button--pressed"
          onClick={() => onChange(clampNumeric(current + step, minimum, maximum))}
        >
          ＋
        </Button>
        {(input.contextKey ?? input.key) === "skillUseCount" ? <Button
          aria-label={`${input.label}重置`}
          className="condition-editor__step-button"
          disabled={current === minimum}
          onClick={() => onChange(minimum)}
        >重置</Button> : null}
      </View>
    </View>
  );
}
