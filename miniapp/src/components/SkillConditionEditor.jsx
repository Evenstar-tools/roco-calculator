import { Button, Input, Text, View } from "@tarojs/components";
import { ConditionField } from "./ConditionField.jsx";
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

export default function SkillConditionEditor({
  context,
  direction,
  feedback,
  onApply,
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
          key={input.id ?? input.contextKey ?? input.key}
          onChange={(value) =>
            onContextChange({
              ...context,
              [input.contextKey ?? input.key ?? input.id]: value,
            })
          }
          value={
            context[input.contextKey ?? input.key ?? input.id] ??
            input.defaultValue
          }
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
      {onApply ? (
        <View className="condition-editor__activation">
          <Button
            aria-label="应用当前技能状态"
            className="condition-editor__apply"
            hoverClass="button-hover"
            onClick={onApply}
          >
            应用技能
          </Button>
          {feedback ? (
            <Text aria-live="polite" className="condition-editor__feedback">
              {feedback}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
