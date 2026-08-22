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

const BURST_GROUPS = ["特性", "技能", "印记"];

function BurstSourceSelector({ context, inputs, onChange }) {
  const [open, setOpen] = useState(false);
  const selectedCount = inputs.filter((input) =>
    (context[input.contextKey ?? input.key] ?? input.defaultValue) === true
  ).length;
  return (
    <View className="condition-editor__burst-sources">
      <Button
        aria-expanded={open}
        aria-label="选择迸发来源"
        className="condition-editor__burst-summary"
        hoverClass="condition-editor__burst-summary--pressed"
        onClick={() => setOpen((value) => !value)}
      >
        <View className="condition-editor__burst-summary-copy">
          <Text className="condition-editor__burst-title">迸发来源</Text>
          <Text className="condition-editor__burst-count">
            已选 {selectedCount}/{inputs.length}
          </Text>
        </View>
        <Text className="condition-editor__burst-chevron">{open ? "⌃" : "⌄"}</Text>
      </Button>
      {open ? (
        <View aria-label="迸发来源" className="condition-editor__burst-panel">
          {BURST_GROUPS.map((group) => {
            const groupInputs = inputs.filter((input) => input.burstGroup === group);
            if (groupInputs.length === 0) return null;
            return (
              <View className="condition-editor__burst-group" key={group}>
                <Text className="condition-editor__burst-group-title">{group}</Text>
                <View className="condition-editor__burst-list">
                  {groupInputs.map((input) => {
                    const key = input.contextKey ?? input.key;
                    const active = (context[key] ?? input.defaultValue) === true;
                    return (
                      <Button
                        aria-label={input.label}
                        aria-pressed={active}
                        className={active
                          ? "condition-editor__burst-source condition-editor__burst-source--active"
                          : "condition-editor__burst-source"}
                        key={key}
                        onClick={() => onChange({ ...context, [key]: !active })}
                      >
                        <View className="condition-editor__burst-source-copy">
                          <Text className="condition-editor__burst-source-name">
                            {input.label}
                          </Text>
                          <Text className="condition-editor__burst-source-description">
                            {input.burstDescription}
                          </Text>
                        </View>
                        <Text className="condition-editor__burst-source-state">
                          {active ? "✓" : ""}
                        </Text>
                      </Button>
                    );
                  })}
                </View>
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

export default function SkillConditionEditor({
  context,
  direction,
  feedback,
  onApply,
  onContextChange,
  onDirectionChange,
  presentation,
  result,
  skill,
}) {
  const inputs = presentation?.inputs ?? getVisibleSkillInputs(skill, context);
  const burstInputs = inputs.filter((input) => input.burstSource === true);
  const regularInputs = inputs.filter((input) => input.burstSource !== true);
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
      {presentation?.description || presentation?.effectHint ? (
        <View className="condition-editor__skill-note">
          {presentation.description ? (
            <Text className="condition-editor__skill-description">
              {presentation.description}
            </Text>
          ) : null}
          {presentation.effectHint ? (
            <Text className="condition-editor__skill-effect">
              {presentation.effectHint}
            </Text>
          ) : null}
        </View>
      ) : null}
      {regularInputs.map((input, index) => (
        <View key={input.id ?? input.contextKey ?? input.key}>
        <ConditionField
          input={input}
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
          {burstInputs.length > 0 && index === 0 ? (
            <BurstSourceSelector
              context={context}
              inputs={burstInputs}
              onChange={onContextChange}
            />
          ) : null}
        </View>
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
