import { useEffect, useState } from "react";
import { Button, Input, Text, View } from "@tarojs/components";
import { ConditionField } from "./ConditionField.jsx";
import {
  getStatusSkillTriggerPreview,
  hasStatusHitCountCoefficient,
  isPureStatusSkill,
} from "../shared/domain/skill-status-effects.js";
import {
  getDefaultHitCount,
  getEditableHitCountInput,
} from "../shared/domain/skill-effects.js";
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

function StatusCountField({
  decreaseLabel,
  increaseLabel,
  inputLabel,
  label,
  onChange,
  status,
  value,
}) {
  const safeValue = Math.min(99, Math.max(1, Math.floor(Number(value) || 1)));
  return (
    <View className="condition-editor__field condition-editor__field--number">
      <View className="condition-editor__field-heading">
        <Text className="condition-editor__label">{label}</Text>
        <Text className="condition-editor__power-status">{status}</Text>
      </View>
      <View className="condition-editor__number-stepper">
        <Button
          aria-label={decreaseLabel}
          className={safeValue <= 1
            ? "condition-editor__step-button condition-editor__step-button--disabled"
            : "condition-editor__step-button"}
          disabled={safeValue <= 1}
          onClick={() => onChange(safeValue - 1)}
        >
          −
        </Button>
        <Input
          aria-label={inputLabel}
          className="condition-editor__input"
          inputMode="numeric"
          min="1"
          max="99"
          onInput={(event) => onChange(Math.min(
            99,
            Math.max(1, Math.floor(numericValue(event, 1, 99))),
          ))}
          type="number"
          value={safeValue}
        />
        <Button
          aria-label={increaseLabel}
          className="condition-editor__step-button"
          disabled={safeValue >= 99}
          onClick={() => onChange(safeValue + 1)}
        >
          +
        </Button>
      </View>
    </View>
  );
}

const BURST_GROUPS = ["特性", "技能", "印记"];

function BurstSourceSelector({ context, inputs, onChange }) {
  const [open, setOpen] = useState(false);
  const [activeGroup, setActiveGroup] = useState(BURST_GROUPS[0]);
  const selectedCount = inputs.filter((input) =>
    (context[input.contextKey ?? input.key] ?? input.defaultValue) === true
  ).length;
  const groups = BURST_GROUPS.map((group) => ({
    inputs: inputs.filter((input) => input.burstGroup === group),
    label: group,
  })).filter((group) => group.inputs.length > 0);
  const visibleGroup = groups.find((group) => group.label === activeGroup)
    ?? groups[0];
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
          <View aria-label="迸发来源分类" className="condition-editor__burst-tabs">
            {groups.map((group) => {
              const groupSelectedCount = group.inputs.filter((input) =>
                (context[input.contextKey ?? input.key] ?? input.defaultValue) === true
              ).length;
              const active = visibleGroup?.label === group.label;
              return (
                <Button
                  aria-label={`查看${group.label}迸发来源`}
                  aria-pressed={active}
                  className={active
                    ? "condition-editor__burst-tab condition-editor__burst-tab--active"
                    : "condition-editor__burst-tab"}
                  key={group.label}
                  onClick={() => setActiveGroup(group.label)}
                >
                  <Text>{group.label}</Text>
                  {groupSelectedCount > 0 ? <Text>{groupSelectedCount}</Text> : null}
                </Button>
              );
            })}
          </View>
          {visibleGroup ? (
            <View className="condition-editor__burst-group" key={visibleGroup.label}>
              <View className="condition-editor__burst-list">
                  {visibleGroup.inputs.map((input) => {
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
          ) : null}
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
  statusActivation,
}) {
  const inputs = presentation?.inputs ?? getVisibleSkillInputs(skill, context);
  const burstInputs = inputs.filter((input) => input.burstSource === true);
  const regularInputs = inputs.filter((input) => input.burstSource !== true);
  const pureStatusSkill = isPureStatusSkill(skill);
  const pendingSkillData = skill?.calculationStatus === "pending-skill-data";
  const savedMode = direction.overrides?.powerOverride?.mode;
  const [powerMode, setPowerMode] = useState(
    savedMode === "panel" ? "panel" : "static",
  );

  useEffect(() => {
    setPowerMode(!pendingSkillData && savedMode === "panel" ? "panel" : "static");
  }, [pendingSkillData, savedMode, skill?.id]);

  const powerOverride = direction.overrides?.powerOverride;
  const manualPower = powerOverride?.mode === powerMode
    ? powerOverride.value
    : null;
  const automaticPower = powerMode === "panel"
    ? result?.panelPower ?? result?.effectivePower
    : result?.staticPower ?? result?.skillPower ?? skill?.basePower;
  const powerValue = manualPower ?? automaticPower ?? "";
  const powerLabel = powerMode === "panel" ? "显示威力" : "静态威力";
  const basePower = skill?.basePower === null || skill?.basePower === undefined
    ? null
    : Math.max(0, Number(skill.basePower) || 0);
  const editableHitCountInput = getEditableHitCountInput(skill);
  const resolvedHitCountMaximum = editableHitCountInput
    ? editableHitCountInput.max ?? Number.POSITIVE_INFINITY
    : 99;
  const resolvedHitCount = Math.min(
    resolvedHitCountMaximum,
    Math.max(
      1,
      Math.floor(
        Number(result?.hitCount ?? getDefaultHitCount(skill)) || 1,
      ),
    ),
  );
  const configuredHitCount = Number(direction?.hitCount);
  const hitCount = editableHitCountInput
    ? resolvedHitCount
    : Number.isFinite(configuredHitCount) && configuredHitCount >= 1
      ? Math.min(99, Math.floor(configuredHitCount))
      : resolvedHitCount;
  const statusHitCountConfigurable = hasStatusHitCountCoefficient(skill);
  const storedStatusTriggerCount = Number(direction?.statusTriggerCount);
  const statusTriggerCount = Number.isFinite(storedStatusTriggerCount) &&
      storedStatusTriggerCount >= 1
    ? Math.min(99, Math.floor(storedStatusTriggerCount))
    : statusHitCountConfigurable
      ? 1
      : hitCount;
  const statusPreview = pureStatusSkill
    ? getStatusSkillTriggerPreview(skill, {
        context,
        hitCount,
        triggerCount: statusTriggerCount,
      })
    : null;
  const updateStatusTriggerCount = (count) => {
    if (statusActivation?.onTriggerCountChange) {
      statusActivation.onTriggerCountChange(count);
      return;
    }
    onDirectionChange({ statusTriggerCount: count });
  };
  const updateStatusHitCount = (count) => {
    if (statusActivation?.onHitCountChange) {
      statusActivation.onHitCountChange(count);
      return;
    }
    onDirectionChange({ hitCount: count });
  };
  const updateDamageHitCount = (count) => {
    const normalized = Math.max(1, Math.floor(Number(count) || 1));
    if (!editableHitCountInput) {
      onDirectionChange({ hitCount: normalized });
      return;
    }
    const automaticHitCountAdd = Math.floor(
      Number(result?.automaticHitCountAdd) || 0,
    );
    const baseHitCount = Math.max(
      editableHitCountInput.min ?? 1,
      normalized - automaticHitCountAdd,
    );
    onContextChange({
      ...context,
      [editableHitCountInput.contextKey]: baseHitCount,
    });
  };

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
      {pureStatusSkill ? (
        <View aria-label="状态触发与效果预览" className="condition-editor__status-trigger">
          <View className="condition-editor__status-heading">
            <View className="condition-editor__status-copy">
              <Text className="condition-editor__label">状态效果</Text>
              <Text className="condition-editor__status-help">
                状态技能不直接参与伤害威力计算
              </Text>
            </View>
            {statusActivation?.available ? (
              <Button
                aria-label={statusActivation.active ? "取消状态触发" : "触发状态技能"}
                aria-pressed={statusActivation.active === true}
                className={statusActivation.active
                  ? "condition-editor__status-toggle condition-editor__status-toggle--active"
                  : "condition-editor__status-toggle"}
                onClick={statusActivation.onToggle}
              >
                {statusActivation.active ? "已触发" : "触发"}
              </Button>
            ) : null}
          </View>
          {statusPreview?.repeatable ? (
            <View aria-label="状态触发次数与累计效果" className="condition-editor__manual-fields">
              <StatusCountField
                decreaseLabel="减少状态触发次数"
                increaseLabel="增加状态触发次数"
                inputLabel="状态触发次数"
                label="触发次数"
                onChange={updateStatusTriggerCount}
                status="默认 1 次"
                value={statusTriggerCount}
              />
              {statusPreview.hitCountConfigurable ? (
                <StatusCountField
                  decreaseLabel="减少每次连击数"
                  increaseLabel="增加每次连击数"
                  inputLabel="每次连击数"
                  label="每次连击数"
                  onChange={updateStatusHitCount}
                  status={`默认 ${statusPreview.defaultHitCount} 连击`}
                  value={hitCount}
                />
              ) : null}
              <View className={statusPreview.hitCountConfigurable
                ? "condition-editor__field condition-editor__field--preview condition-editor__field--cumulative"
                : "condition-editor__field condition-editor__field--preview"}
              >
                <View className="condition-editor__field-heading">
                  <Text className="condition-editor__label">累计效果</Text>
                  <Text className="condition-editor__power-status">
                    {statusPreview.hitCountConfigurable
                      ? `${statusTriggerCount} 次 × ${hitCount} 连击`
                      : `${statusTriggerCount} 次`}
                  </Text>
                </View>
                <View className="condition-editor__status-preview">
                  <Text>{statusPreview.cumulativeEffect}</Text>
                </View>
              </View>
            </View>
          ) : (
            <View className="condition-editor__status-preview condition-editor__status-preview--single">
              <Text className="condition-editor__label">触发效果</Text>
              <Text>{statusPreview?.cumulativeEffect ?? "当前规则暂未收录可结算效果"}</Text>
            </View>
          )}
          {statusPreview?.repeatable ? (
            <Text className="condition-editor__status-unit-effect">
              每次触发{statusPreview.hitCountConfigurable
                ? `（${hitCount} 连击）`
                : ""}：{statusPreview.unitEffect}
            </Text>
          ) : null}
        </View>
      ) : (
      <View className="condition-editor__manual">
        <View aria-label="威力口径" className="condition-editor__power-modes">
          {(pendingSkillData
            ? [["static", "静态威力"]]
            : [["static", "静态威力"], ["panel", "显示威力"]]
          ).map(([mode, label]) => (
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
        <View aria-label="基础技能参数" className="condition-editor__base-reference">
          <Text>基础威力 {basePower ?? "待补"}</Text>
          <Text>{resolvedHitCount > 1
            ? `技能默认 ${resolvedHitCount} 连击`
            : "单段伤害"}</Text>
        </View>
        <View aria-label="威力与连击参数" className="condition-editor__manual-fields">
          <View className="condition-editor__field condition-editor__field--number">
            <View className="condition-editor__field-heading condition-editor__power-heading">
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
          <View className="condition-editor__field condition-editor__field--number">
            <View className="condition-editor__field-heading">
              <Text className="condition-editor__label">伤害连击数</Text>
              <Text className="condition-editor__power-status">
                {hitCount} 段伤害
              </Text>
            </View>
            <Input
              aria-label="连击数"
              className="condition-editor__input"
              inputMode="numeric"
              min="1"
              onInput={(event) => updateDamageHitCount(numericValue(event, 1))}
              type="number"
              value={hitCount}
            />
          </View>
        </View>
      </View>
      )}
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
