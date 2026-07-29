import { Lightning, Shield, Sword } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { getElementToneStyle } from "../domain/element-colors.js";
import { getSkillEffectInputs } from "../domain/skill-effects.js";
import { SkillPicker } from "./SkillPicker.jsx";

const CATEGORY_LABELS = {
  defense: "防御",
  dual: "双攻",
  magical: "魔法",
  physical: "物理",
  status: "变化",
};

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function dynamicInputsForSkill(skill) {
  return getSkillEffectInputs(skill);
}

export function clampDynamicInput(input, value) {
  const numeric = toNumber(value);
  return Math.min(
    input.max ?? Number.POSITIVE_INFINITY,
    Math.max(input.min ?? Number.NEGATIVE_INFINITY, numeric),
  );
}

export function dynamicInputValue(input, context = {}) {
  return context[input.key] ?? input.defaultValue;
}

export function DraftNumberInput({
  ariaLabel,
  className,
  disabled = false,
  max,
  min = 0,
  onCommit,
  value,
}) {
  const [draft, setDraft] = useState(String(value ?? ""));

  useEffect(() => {
    setDraft(String(value ?? ""));
  }, [value]);

  return (
    <input
      aria-label={ariaLabel}
      className={className}
      disabled={disabled}
      max={max}
      min={min}
      onBlur={() => {
        if (draft === "") setDraft(String(value ?? ""));
      }}
      onChange={(event) => {
        setDraft(event.target.value);
        if (event.target.value !== "") {
          const normalized = Math.min(
            max ?? Number.POSITIVE_INFINITY,
            Math.max(min, toNumber(event.target.value)),
          );
          onCommit?.(normalized);
        }
      }}
      type="number"
      value={draft}
    />
  );
}

export function TraitInputs({
  context = {},
  inputs = [],
  onChange,
  scope,
}) {
  return inputs
    .filter((input) => !scope || input.scope === scope)
    .map((input) =>
      input.type === "boolean" ? (
        <label className="trait-condition" key={input.key}>
          <input
            checked={Boolean(dynamicInputValue(input, context))}
            onChange={(event) => onChange?.(input.key, event.target.checked)}
            type="checkbox"
          />
          <span>{input.label}</span>
        </label>
      ) : (
        <label className="trait-number" key={input.key}>
          <span>{input.label}</span>
          <DraftNumberInput
            ariaLabel={input.label}
            max={input.max}
            min={input.min}
            onCommit={(value) => onChange?.(input.key, value)}
            value={dynamicInputValue(input, context)}
          />
          {input.suffix ? <small>{input.suffix}</small> : null}
        </label>
      ),
    );
}

export function isDynamicInputVisible(input, context = {}) {
  if (!input.when) return true;
  const controllingValue =
    context[input.when.key] ??
    input.when.defaultValue;
  return controllingValue === input.when.equals;
}

export function describeResolution(result) {
  const steps = result?.formulaSteps ?? [];
  const basePowerIndex = steps.findIndex(
    ({ label }) => label === "基础威力",
  );
  const skillRuleSteps =
    basePowerIndex >= 0 ? steps.slice(0, basePowerIndex) : steps;
  const step = skillRuleSteps.find(
    ({ before, after, source }) =>
      String(source).startsWith("reviewed-rule:") &&
      Number.isFinite(Number(before)) &&
      Number.isFinite(Number(after)) &&
      Number(before) !== Number(after),
  );
  if (!step) {
    const unchangedBranch = skillRuleSteps.find(
      ({ label, source }) =>
        String(source).startsWith("reviewed-rule:") &&
        String(label).includes("伤害不变"),
    );
    return unchangedBranch?.label ?? null;
  }

  const before = Number(step.before);
  const after = Number(step.after);
  const source = String(step.source);
  if (
    source.includes("speed-defense-difference") &&
    Number.isFinite(Number(step.input?.attacker)) &&
    Number.isFinite(Number(step.input?.defender))
  ) {
    const metric = String(step.label).startsWith("物防") ? "物防" : "速度";
    return `${metric} ${Number(step.input.attacker)} − ${Number(step.input.defender)} = ${before} → 威力 ${after}`;
  }
  if (source.includes("hit-count")) {
    return `${before} 连击 → ${after} 连击`;
  }
  if (
    source.includes("multiplier") ||
    source.includes("exponential")
  ) {
    const multiplier = before === 0 ? 0 : after / before;
    return `${before} × ${Number(multiplier.toFixed(2))} = ${after}`;
  }
  const difference = after - before;
  return `${before} ${difference >= 0 ? "+" : "−"} ${Math.abs(difference)} = ${after}`;
}

export function SingleSkillEditor({
  attackerTrait,
  defenderTrait,
  hitCount,
  manualPower,
  onHitCountChange,
  onManualPowerChange,
  onPowerModeChange,
  onSkillSelect,
  onTraitContextChange,
  result,
  selectedSkill,
  skills,
  powerMode = "base",
  traitContext = {},
}) {
  const [powerDraft, setPowerDraft] = useState(String(manualPower));
  const [hitDraft, setHitDraft] = useState(String(hitCount));
  const dynamicInputs = dynamicInputsForSkill(selectedSkill);
  const resolutionSummary = describeResolution(result);

  useEffect(() => {
    setPowerDraft(String(manualPower));
  }, [manualPower]);

  useEffect(() => {
    setHitDraft(String(hitCount));
  }, [hitCount]);

  return (
    <div className="single-skill-editor">
      <div className="skill-parameter-row">
        <div className="field-group field-group--skill">
          <SkillPicker
            ariaLabel="选择技能"
            onSelect={onSkillSelect}
            selected={selectedSkill}
            skills={skills}
          />
        </div>

        <div className="skill-facts" aria-label="技能属性">
          <span className="skill-fact">
            <Sword aria-hidden="true" size={17} weight="fill" />
            {CATEGORY_LABELS[selectedSkill.category] ?? selectedSkill.category}
          </span>
          <span
            className={`type-chip type-chip--${selectedSkill.type}`}
            style={getElementToneStyle(selectedSkill.type)}
          >
            {selectedSkill.type}
          </span>
          <span className="skill-fact">
            <Lightning aria-hidden="true" size={17} weight="fill" />
            能耗 {selectedSkill.cost}
          </span>
        </div>
      </div>

      <div aria-label="技能效果与实时解算" className="skill-effect-card">
        <div className="skill-effect-card__copy">
          <Lightning aria-hidden="true" size={16} weight="fill" />
          <p>{selectedSkill.description || "无额外效果。"}</p>
        </div>
        {powerMode !== "displayed" && dynamicInputs.length > 0 ? (
          <div aria-label="动态技能条件" className="skill-effect-card__conditions">
            {dynamicInputs
              .filter((input) =>
                isDynamicInputVisible(input, traitContext),
              )
              .map((input) =>
              input.type === "choice" ? (
                <div
                  aria-label={input.label}
                  className="skill-condition-choice"
                  key={input.key}
                  role="group"
                >
                  {input.options.map((option) => (
                    <button
                      aria-pressed={
                        dynamicInputValue(input, traitContext) ===
                        option.value
                      }
                      key={option.value}
                      onClick={() =>
                        onTraitContextChange?.(input.key, option.value)
                      }
                      type="button"
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              ) : input.type === "boolean" ? (
                <label className="skill-condition-toggle" key={input.key}>
                  <input
                    checked={Boolean(
                      dynamicInputValue(input, traitContext),
                    )}
                    onChange={(event) =>
                      onTraitContextChange?.(input.key, event.target.checked)
                    }
                    type="checkbox"
                  />
                  <span>{input.label}</span>
                </label>
              ) : (
                <label className="skill-condition-number" key={input.key}>
                  <span>{input.label}</span>
                  <input
                    aria-label={input.label}
                    max={input.max}
                    min={input.min}
                    onChange={(event) => {
                      if (event.target.value !== "") {
                        onTraitContextChange?.(
                          input.key,
                          clampDynamicInput(input, event.target.value),
                        );
                      }
                    }}
                    type="number"
                    value={
                      dynamicInputValue(input, traitContext) ?? ""
                    }
                  />
                </label>
              ),
            )}
          </div>
        ) : null}
        <div className="skill-effect-card__power" aria-label="技能威力">
          <label className="skill-effect-card__base">
            <small>基础</small>
            <DraftNumberInput
              ariaLabel={
                powerMode === "displayed"
                  ? "游戏内显示威力"
                  : "基础技能威力"
              }
              min={0}
              onCommit={onManualPowerChange}
              value={manualPower}
            />
          </label>
          <strong>
            <small>实际</small>
            {result?.skillPower ?? result?.effectivePower ?? "待输入"}
          </strong>
          {resolutionSummary ? (
            <span className="skill-effect-card__formula">
              {resolutionSummary}
            </span>
          ) : dynamicInputs.length > 0 && result?.status === "exact" ? (
            <span className="skill-effect-card__formula">
              当前条件未触发加成
            </span>
          ) : null}
        </div>
      </div>

      <details className="manual-skill-settings">
        <summary>手动调整</summary>
        <div className="manual-parameter-grid">
          <div
            aria-label="威力口径"
            className="power-mode-switch"
            role="group"
          >
            <button
              aria-pressed={powerMode === "base"}
              onClick={() => onPowerModeChange?.("base")}
              type="button"
            >
              基础威力
            </button>
            <button
              aria-pressed={powerMode === "displayed"}
              onClick={() => onPowerModeChange?.("displayed")}
              type="button"
            >
              游戏内威力
            </button>
          </div>
          <label className="field-group">
            <span>{powerMode === "displayed" ? "游戏内威力" : "手动威力"}</span>
            <input
              aria-label={
                "手动威力"
              }
              min="0"
              onChange={(event) => {
                setPowerDraft(event.target.value);
                if (event.target.value !== "") {
                  onManualPowerChange(
                    Math.max(0, toNumber(event.target.value)),
                  );
                }
              }}
              onBlur={() => {
                if (powerDraft === "") setPowerDraft(String(manualPower));
              }}
              type="number"
              value={powerDraft}
            />
            {powerMode === "displayed" ? (
              <small>已含特性/克制/等级</small>
            ) : null}
          </label>
          <label className="field-group">
            <span>连击次数</span>
            <input
              aria-label="连击次数"
              max="20"
              min="1"
              onChange={(event) => {
                setHitDraft(event.target.value);
                if (event.target.value !== "") {
                  onHitCountChange(
                    Math.min(
                      20,
                      Math.max(1, Math.floor(toNumber(event.target.value, 1))),
                    ),
                  );
                }
              }}
              onBlur={() => {
                const normalized = Math.min(
                  20,
                  Math.max(1, Math.floor(toNumber(hitDraft, hitCount))),
                );
                setHitDraft(String(normalized));
                onHitCountChange(normalized);
              }}
              type="number"
              value={hitDraft}
            />
          </label>
        </div>
      </details>

      {powerMode !== "displayed" && (attackerTrait || defenderTrait) ? (
        <div className="trait-grid">
          {attackerTrait ? (
            <article className="trait-card trait-card--attack">
              <header>
                <Sword aria-hidden="true" size={17} weight="fill" />
                攻击特性
              </header>
              <strong>{attackerTrait.name}</strong>
              <p>{attackerTrait.description}</p>
              <div className="trait-inputs">
                <TraitInputs
                  context={traitContext}
                  inputs={
                    attackerTrait.inputs ??
                    (attackerTrait.conditionKey
                      ? [{
                          defaultValue: false,
                          key: attackerTrait.conditionKey,
                          label: attackerTrait.conditionLabel,
                          type: "boolean",
                        }]
                      : [])
                  }
                  onChange={onTraitContextChange}
                />
              </div>
            </article>
          ) : null}
          {defenderTrait ? (
            <article className="trait-card trait-card--defense">
              <header>
                <Shield aria-hidden="true" size={17} weight="fill" />
                防御特性
              </header>
              <strong>{defenderTrait.name}</strong>
              <p>{defenderTrait.description}</p>
              <div className="trait-inputs">
                <TraitInputs
                  context={traitContext}
                  inputs={
                    defenderTrait.inputs ??
                    (defenderTrait.conditionKey
                      ? [{
                          defaultValue: false,
                          key: defenderTrait.conditionKey,
                          label: defenderTrait.conditionLabel,
                          type: "boolean",
                        }]
                      : [])
                  }
                  onChange={onTraitContextChange}
                />
              </div>
            </article>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
