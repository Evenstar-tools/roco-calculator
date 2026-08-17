import { useEffect, useState } from "react";
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
  result,
  skill,
}) {
  const inputs = getVisibleSkillInputs(skill, context);
  const savedMode = direction.overrides?.powerOverride?.mode;
  const [powerMode, setPowerMode] = useState(
    savedMode === "panel" ? "panel" : "static",
  );

  useEffect(() => {
    setPowerMode(savedMode === "panel" ? "panel" : "static");
  }, [savedMode, skill?.id]);

  const powerOverride = direction.overrides?.powerOverride;
  const manualPower = powerOverride?.mode === powerMode
    ? powerOverride.value
    : null;
  const automaticPower = powerMode === "panel"
    ? result?.panelPower ?? result?.effectivePower
    : result?.staticPower ?? result?.skillPower ?? skill?.basePower;
  const powerValue = manualPower ?? automaticPower ?? "";
  const powerLabel = powerMode === "panel" ? "面板威力" : "静态威力";

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
        <View className="condition-editor__power">
          <View aria-label="威力口径" className="condition-editor__power-modes">
            {[
              ["static", "静态威力"],
              ["panel", "面板威力"],
            ].map(([mode, label]) => (
              <Button
                aria-pressed={powerMode === mode}
                className={powerMode === mode
                  ? "condition-editor__power-mode condition-editor__power-mode--active"
                  : "condition-editor__power-mode"}
                key={mode}
                onClick={() => setPowerMode(mode)}
              >
                {label}
              </Button>
            ))}
          </View>
          <View className="condition-editor__field condition-editor__field--number">
            <View className="condition-editor__power-heading">
              <Text className="condition-editor__label">{powerLabel}</Text>
              {powerOverride ? (
                <Button
                  aria-label="恢复自动威力"
                  className="condition-editor__power-reset"
                  onClick={() => onDirectionChange({
                    overrides: {
                      basePower: undefined,
                      powerOverride: null,
                    },
                  })}
                >
                  恢复自动
                </Button>
              ) : (
                <Text className="condition-editor__power-status">自动</Text>
              )}
            </View>
            <Input
              aria-label={powerLabel}
              className="condition-editor__input"
              inputMode="numeric"
              min="0"
              max="9999"
              onInput={(event) => {
                const raw = eventValue(event);
                onDirectionChange({
                  overrides: {
                    basePower: undefined,
                    powerOverride: raw === ""
                      ? null
                      : {
                          mode: powerMode,
                          value: Math.round(numericValue(event, 0, 9999)),
                        },
                  },
                });
              }}
              type="number"
              value={powerValue}
            />
          </View>
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
