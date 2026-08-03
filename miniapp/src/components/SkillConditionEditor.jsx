import { Button, Input, Text, View } from "@tarojs/components";
import { getVisibleSkillInputs } from "../view-models/skills.js";

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

function ConditionField({ input, onChange, value }) {
  if (input.type === "boolean") {
    return (
      <Button
        aria-label={input.label}
        aria-pressed={value === true}
        className={
          value === true
            ? "condition-editor__toggle condition-editor__toggle--active"
            : "condition-editor__toggle"
        }
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
              className={
                value === option.value
                  ? "condition-editor__choice condition-editor__choice--active"
                  : "condition-editor__choice"
              }
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
        className="condition-editor__input"
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

export default function SkillConditionEditor({
  context,
  direction,
  onContextChange,
  onDirectionChange,
  skill,
}) {
  const inputs = getVisibleSkillInputs(skill, context);

  return (
    <View aria-label="技能条件" className="condition-editor">
      {inputs.map((input) => (
        <ConditionField
          input={input}
          key={input.key}
          onChange={(value) =>
            onContextChange({ ...context, [input.key]: value })
          }
          value={context[input.key] ?? input.defaultValue}
        />
      ))}
      <View className="condition-editor__manual">
        <View className="condition-editor__field condition-editor__field--number">
          <Text className="condition-editor__label">手动威力</Text>
          <Input
            aria-label="手动威力"
            className="condition-editor__input"
            inputMode="numeric"
            min="0"
            onInput={(event) => {
              const raw = eventValue(event);
              onDirectionChange({
                overrides: {
                  basePower:
                    raw === "" ? undefined : numericValue(event, 0),
                },
              });
            }}
            placeholder="自动"
            type="number"
            value={direction.overrides?.basePower ?? ""}
          />
        </View>
        <View className="condition-editor__field condition-editor__field--number">
          <Text className="condition-editor__label">连击数</Text>
          <Input
            aria-label="连击数"
            className="condition-editor__input"
            inputMode="numeric"
            min="1"
            onInput={(event) =>
              onDirectionChange({
                hitCount: Math.max(
                  1,
                  Math.floor(numericValue(event, 1)),
                ),
              })
            }
            type="number"
            value={direction.hitCount ?? 1}
          />
        </View>
      </View>
    </View>
  );
}
