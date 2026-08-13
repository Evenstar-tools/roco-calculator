import { Button, Input, Text, View } from "@tarojs/components";

function eventValue(event) {
  return event?.detail?.value ?? event?.target?.value ?? "";
}

function numericValue(event, minimum = 0, maximum) {
  const numeric = Number(eventValue(event));
  const safe = Number.isFinite(numeric) ? numeric : minimum;
  return Math.min(
    maximum ?? Number.POSITIVE_INFINITY,
    Math.max(minimum, safe),
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
        <Text>{input.label}</Text>
        <Text>{value === true ? "已开启" : "未开启"}</Text>
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

  return (
    <View className="condition-editor__field condition-editor__field--number">
      <Text className="condition-editor__label">{input.label}</Text>
      <Input
        aria-label={input.label}
        className={classes("condition-editor__input", className)}
        inputMode="numeric"
        max={input.max}
        min={input.min ?? 0}
        onInput={(event) =>
          onChange(numericValue(event, input.min ?? 0, input.max))
        }
        type="number"
        value={value ?? input.defaultValue ?? ""}
      />
    </View>
  );
}
