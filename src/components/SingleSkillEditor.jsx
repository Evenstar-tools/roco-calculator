import { Lightning, Shield, Sword } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { getElementToneStyle } from "../domain/element-colors.js";
import { getSkillEffectInputs } from "../domain/skill-effects.js";
import { usesAbsolutePowerRule } from "../domain/skill-rules.js";
import { getSkillStatusEffectInputs } from "../domain/skill-status-effects.js";
import { resolveLifestealCapability } from "../domain/baron-greed.js";
import { HealthInput } from "./HealthInput.jsx";
import { SkillPicker } from "./SkillPicker.jsx";

const CATEGORY_LABELS = {
  defense: "防御",
  dual: "双攻",
  magical: "魔法",
  physical: "物理",
  status: "变化",
};

export function displayedSkillPower(skill, result) {
  if (
    usesAbsolutePowerRule(skill) &&
    Number.isFinite(Number(result?.resolvedPower))
  ) {
    return Number(result.resolvedPower);
  }
  return result?.skillPower ?? result?.effectivePower;
}

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function dynamicInputsForSkill(
  skill,
  { includeStatusEffects = false } = {},
) {
  const inputs = [
    ...getSkillEffectInputs(skill),
    ...(includeStatusEffects ? getSkillStatusEffectInputs(skill) : []),
  ];
  return inputs.filter(
    (input, index) =>
      inputs.findIndex((candidate) => candidate.id === input.id) === index,
  );
}

export function mergeDynamicInputs(...inputGroups) {
  const inputs = inputGroups.flat().filter(Boolean);
  return inputs.filter(
    (input, index) =>
      inputs.findIndex(
        (candidate) =>
          (candidate.id ?? candidate.key) === (input.id ?? input.key),
      ) === index,
  );
}

function dynamicInputId(input) {
  return input.id ?? input.key;
}

function dynamicInputContextKey(input) {
  return input.contextKey ?? input.key;
}

export function clampDynamicInput(input, value) {
  const numeric = toNumber(value);
  return Math.min(
    input.max ?? Number.POSITIVE_INFINITY,
    Math.max(input.min ?? Number.NEGATIVE_INFINITY, numeric),
  );
}

export function dynamicInputValue(input, context = {}) {
  return context[dynamicInputId(input)] ??
    context[dynamicInputContextKey(input)] ??
    input.defaultValue;
}

export function DraftNumberInput({
  ariaLabel,
  className,
  disabled = false,
  inputMode,
  max,
  min = 0,
  onCommit,
  step,
  value,
}) {
  const [draft, setDraft] = useState(String(value ?? ""));
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    if (!isEditing) setDraft(String(value ?? ""));
  }, [isEditing, value]);

  return (
    <input
      aria-label={ariaLabel}
      className={className}
      disabled={disabled}
      inputMode={inputMode}
      max={max}
      min={min}
      onBlur={() => {
        setIsEditing(false);
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
      onKeyDown={(event) => {
        if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
        event.preventDefault();
        const current = toNumber(draft, toNumber(value));
        const normalized = Math.min(
          max ?? Number.POSITIVE_INFINITY,
          Math.max(min, current + (event.key === "ArrowUp" ? 1 : -1)),
        );
        setDraft(String(normalized));
        onCommit?.(normalized);
      }}
      onFocus={() => setIsEditing(true)}
      step={step}
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
    .filter((input) => isDynamicInputVisible(input, context))
    .map((input) =>
      input.type === "choice" ? (
        <label className="trait-choice" key={dynamicInputId(input)}>
          <span>{input.label}</span>
          <select
            aria-label={input.label}
            onChange={(event) =>
              onChange?.(dynamicInputId(input), event.target.value)
            }
            value={dynamicInputValue(input, context) ?? ""}
          >
            {input.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      ) : input.type === "boolean" ? (
        <label className="trait-condition" key={dynamicInputId(input)}>
          <input
            checked={Boolean(dynamicInputValue(input, context))}
            onChange={(event) =>
              onChange?.(dynamicInputId(input), event.target.checked)
            }
            type="checkbox"
          />
          <span>{input.label}</span>
        </label>
      ) : (
        <label className="trait-number" key={dynamicInputId(input)}>
          <span>{input.label}</span>
          <DraftNumberInput
            ariaLabel={input.label}
            inputMode="numeric"
            max={input.max}
            min={input.min}
            onCommit={(value) => onChange?.(dynamicInputId(input), value)}
            step={input.step ?? 1}
            value={dynamicInputValue(input, context)}
          />
          {input.suffix ? <small>{input.suffix}</small> : null}
        </label>
      ),
    );
}

export function TraitAutomaticStack({ automaticStack, skills = [] }) {
  if (!automaticStack) return null;
  const matchingTypes = new Set(automaticStack.skillTypes ?? []);
  const value = skills.filter((skill) => matchingTypes.has(skill?.type)).length;
  return (
    <span className="trait-number trait-number--automatic">
      <span>{automaticStack.label}</span>
      <output aria-label={`${automaticStack.label}（自动读取）`}>{value}</output>
    </span>
  );
}

export function isDynamicInputVisible(input, context = {}) {
  const condition = input.visibleWhen ?? input.when;
  if (!condition) return true;
  const controllingValue =
    context[condition.id ?? condition.key] ??
    context[condition.contextKey ?? condition.key] ??
    condition.defaultValue;
  return controllingValue === condition.equals;
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
  if (
    source.includes("adjacent-displayed-power") &&
    step.input?.left &&
    step.input?.right
  ) {
    return `左 ${step.input.left.name} ${Number(step.input.left.power)}｜右 ${step.input.right.name} ${Number(step.input.right.power)} → 威力 ${after}`;
  }
  if (source.includes("mana-burst")) {
    return `${Number(step.input)} 能量 → 威力 ${after}`;
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
  attackerHealth,
  attackerLifestealPercent = 0,
  attackerTrait,
  carriedSkills = [],
  defenderHealth,
  defenderTrait,
  hitCount,
  manualPower,
  onHitCountChange,
  onAttackerHealthChange,
  onAttackerHealthPercentChange,
  onDefenderHealthChange,
  onDefenderHealthPercentChange,
  onManualPowerChange,
  onPowerModeChange,
  onSkillSelect,
  onTraitContextChange,
  result,
  selectedSkill,
  skills,
  powerDisplayMode = "skill",
  powerMode = "base",
  traitContext = {},
}) {
  const [powerDraft, setPowerDraft] = useState(String(manualPower));
  const [hitDraft, setHitDraft] = useState(String(hitCount));
  const dynamicInputs = mergeDynamicInputs(
    dynamicInputsForSkill(selectedSkill),
    result?.inputs ?? [],
  );
  const attackerTraitInputs = attackerTrait?.inputs ??
    (attackerTrait?.conditionKey
      ? [{
          defaultValue: false,
          key: attackerTrait.conditionKey,
          label: attackerTrait.conditionLabel,
          type: "boolean",
        }]
      : []);
  const defenderTraitInputs = defenderTrait?.inputs ??
    (defenderTrait?.conditionKey
      ? [{
          defaultValue: false,
          key: defenderTrait.conditionKey,
          label: defenderTrait.conditionLabel,
          type: "boolean",
        }]
      : []);
  const hasAttackerHpRule =
    dynamicInputs.some(
      (input) => dynamicInputContextKey(input) === "attackerHpPercent",
    ) ||
    attackerTraitInputs.some(
      (input) => dynamicInputContextKey(input) === "attackerHpPercent",
    );
  const hasDefenderHpRule =
    dynamicInputs.some(
      (input) => dynamicInputContextKey(input) === "defenderHpPercent",
    ) ||
    defenderTraitInputs.some(
      (input) => dynamicInputContextKey(input) === "defenderHpPercent",
    );
  const resolutionSummary = describeResolution(result);
  const lifesteal = resolveLifestealCapability({
    persistentLifestealPercent: attackerLifestealPercent,
    traits: attackerTrait ? [attackerTrait] : [],
  });
  const showsLifestealCapability =
    lifesteal.percent > 0 ||
    ["戏耍", "贪得无厌"].includes(attackerTrait?.name);
  const effectiveType = result?.typeLabel ?? selectedSkill.type;

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
            className={`type-chip type-chip--${effectiveType}`}
            style={getElementToneStyle(effectiveType)}
          >
            {effectiveType}
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
        {powerMode !== "displayed" &&
        (dynamicInputs.length > 0 || hasAttackerHpRule || hasDefenderHpRule) ? (
          <div aria-label="动态技能条件" className="skill-effect-card__conditions">
            {hasAttackerHpRule && attackerHealth ? (
              <HealthInput
                currentHp={attackerHealth.currentHp}
                defaultMode="percent"
                label="攻击方"
                maxHp={attackerHealth.maxHp}
                onCurrentHpChange={onAttackerHealthChange}
                onPercentChange={onAttackerHealthPercentChange}
                percentValue={attackerHealth.percent}
              />
            ) : null}
            {hasDefenderHpRule && defenderHealth ? (
              <HealthInput
                currentHp={defenderHealth.currentHp}
                defaultMode="percent"
                label="防御方"
                maxHp={defenderHealth.maxHp}
                onCurrentHpChange={onDefenderHealthChange}
                onPercentChange={onDefenderHealthPercentChange}
                percentValue={defenderHealth.percent}
              />
            ) : null}
            {dynamicInputs
              .filter(
                (input) =>
                  (dynamicInputContextKey(input) !== "attackerHpPercent" || !attackerHealth) &&
                  (dynamicInputContextKey(input) !== "defenderHpPercent" || !defenderHealth),
              )
              .filter((input) =>
                isDynamicInputVisible(input, traitContext),
              )
              .map((input) =>
              input.type === "choice" ? (
                <div
                  aria-label={input.label}
                  className="skill-condition-choice"
                  key={dynamicInputId(input)}
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
                        onTraitContextChange?.(dynamicInputId(input), option.value)
                      }
                      type="button"
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              ) : input.type === "boolean" ? (
                <label className="skill-condition-toggle" key={dynamicInputId(input)}>
                  <input
                    checked={Boolean(
                      dynamicInputValue(input, traitContext),
                    )}
                    onChange={(event) =>
                      onTraitContextChange?.(dynamicInputId(input), event.target.checked)
                    }
                    type="checkbox"
                  />
                  <span>{input.label}</span>
                </label>
              ) : (
                <label className="skill-condition-number" key={dynamicInputId(input)}>
                  <span>{input.label}</span>
                  <input
                    aria-label={input.label}
                    max={input.max}
                    min={input.min}
                    onChange={(event) => {
                      if (event.target.value !== "") {
                        onTraitContextChange?.(
                          dynamicInputId(input),
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
          <strong
            aria-label={powerDisplayMode === "panel" ? "面板威力" : undefined}
          >
            <small>{powerDisplayMode === "panel" ? "面板" : "实际"}</small>
            {powerDisplayMode === "panel"
              ? result?.displayedPower ?? "待输入"
              : displayedSkillPower(selectedSkill, result) ?? "待输入"}
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
              max="99"
              min="1"
              onChange={(event) => {
                setHitDraft(event.target.value);
                if (event.target.value !== "") {
                  onHitCountChange(
                    Math.min(
                      99,
                      Math.max(1, Math.floor(toNumber(event.target.value, 1))),
                    ),
                  );
                }
              }}
              onBlur={() => {
                const normalized = Math.min(
                  99,
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
                {showsLifestealCapability ? (
                  <small className="trait-capability-note">
                    吸血 {lifesteal.levels}层 · {lifesteal.percent}%
                  </small>
                ) : null}
                <TraitAutomaticStack
                  automaticStack={attackerTrait.automaticStack}
                  skills={carriedSkills}
                />
                <TraitInputs
                  context={traitContext}
                  inputs={attackerTraitInputs.filter(
                    (input) =>
                      dynamicInputContextKey(input) !== "attackerHpPercent" ||
                      !attackerHealth,
                  )}
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
                  inputs={defenderTraitInputs.filter(
                    (input) =>
                      dynamicInputContextKey(input) !== "defenderHpPercent" ||
                      !defenderHealth,
                  )}
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
