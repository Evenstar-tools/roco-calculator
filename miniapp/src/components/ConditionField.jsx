import { Button, Input, Text, View } from "@tarojs/components";

function eventValue(event) {
  return event?.detail?.value ?? event?.target?.value ?? "";
}

function numericValue(event, minimum = 0, maximum) {
  const numeric = Number(eventValue(event));
  const safe = Number.isFinite(numeric) ? numeric : minimum;
  return clampNumeric(safe, minimum, maximum);
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

export function ConditionField({ className, input, onChange, value }) {
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
      <View className="condition-editor__number-stepper">
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
        <Input
          aria-label={input.label}
          className={classes("condition-editor__input", className)}
          inputMode="numeric"
          max={maximum}
          min={minimum}
          onInput={(event) =>
            onChange(numericValue(event, minimum, maximum))
          }
          step={step}
          type="number"
          value={value ?? input.defaultValue ?? ""}
        />
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
      </View>
    </View>
  );
}
