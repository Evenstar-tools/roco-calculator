import {
  clampDynamicInput,
  DraftNumberInput,
  describeResolution,
  dynamicInputValue,
  dynamicInputsForSkill,
  mergeDynamicInputs,
  displayedSkillPower,
  isDynamicInputVisible,
  TraitAutomaticStack,
  TraitInputs,
} from "./SingleSkillEditor.jsx";
import { SkillPicker } from "./SkillPicker.jsx";
import { useEffect, useState } from "react";
import { damageTone } from "./damageTone.js";
import { HealthInput } from "./HealthInput.jsx";
import {
  TraitHint,
  TraitSkillPowerBonuses,
} from "./TraitHint.jsx";
import {
  getChoiceTraitInput,
  supportsChoiceTrait,
} from "../domain/choice-skill-sequence.js";
import { buildRefractionHint } from "../domain/refraction.js";
import { getGaleTurbineCompanionInput } from "../domain/wing-extension.js";

const CATEGORY_LABELS = {
  defense: "防御",
  dual: "双攻",
  magical: "魔法",
  physical: "物理",
  status: "变化",
};

function useMediaQuery(query) {
  const [matches, setMatches] = useState(
    () => globalThis.matchMedia?.(query)?.matches ?? false,
  );

  useEffect(() => {
    const media = globalThis.matchMedia?.(query);
    if (!media) return undefined;
    const update = (event) => setMatches(event.matches);
    setMatches(media.matches);
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, [query]);

  return matches;
}

function isInteractiveSkillTarget(target) {
  return target instanceof Element &&
    Boolean(
      target.closest(
        "button, input, label, select, textarea, [role='combobox'], [role='option']",
      ),
    );
}

function SkillDamagePreview({
  index,
  label,
  opponentName,
  result,
  selected,
}) {
  const hasDamage = Number.isFinite(result?.totalDamage);
  const hasPercent = Number.isFinite(result?.hpPercent);
  const percent = hasPercent ? result.hpPercent.toFixed(1) : null;
  const ariaLabel = selected
    ? hasDamage
      ? `${label}${selected.name}攻击${opponentName}：${result.totalDamage}伤害${
          percent ? `，${percent}% HP` : ""
        }`
      : `${label}${selected.name}攻击${opponentName}：${result?.reason ?? "伤害待计算"}`
    : `${label}技能${index + 1}未选择`;

  return (
    <output
      aria-label={ariaLabel}
      className="skill-slot__damage"
      data-status={hasDamage ? "ready" : "pending"}
      data-tone={damageTone(result?.hpPercent)}
      title={result?.reason}
    >
      <span className="skill-slot__damage-values">
        <strong>{percent ? `${percent}%` : "—"}</strong>
        <span>{hasDamage ? `${result.totalDamage}伤害` : ""}</span>
      </span>
      <span aria-hidden="true" className="skill-slot__damage-bar">
        <span
          style={{
            width: `${Math.min(100, Math.max(0, result?.hpPercent ?? 0))}%`,
          }}
        />
      </span>
    </output>
  );
}

function SkillSide({
  active,
  activeDamageSource,
  activeSkillIndex,
  hitCount,
  health,
  label,
  name,
  opponentHealth,
  opponentLabel,
  opponentName,
  opponentSide,
  onSkillActivate,
  onSkillContextChange,
  onSkillFocus,
  onSkillHitCountChange,
  onSkillPowerChange,
  onSkillSelect,
  onHealthChange,
  onHealthPercentChange,
  onTraitContextChange,
  onTraitDamageFocus,
  onTraitDamageHitCountChange,
  results,
  selectedSkills,
  side,
  skills,
  sproutStacks,
  trait,
  defenseTrait,
  traitContext,
  traitDamage,
}) {
  const hasSelfHpRule =
    selectedSkills.some((skill) =>
      dynamicInputsForSkill(skill, { includeStatusEffects: true }).some(
        (input) => (input.contextKey ?? input.key) === "attackerHpPercent",
      ),
    ) ||
    trait?.inputs?.some(
      (input) => (input.contextKey ?? input.key) === "attackerHpPercent",
    );
  const hasTargetHpRule = selectedSkills.some((skill) =>
    dynamicInputsForSkill(skill, { includeStatusEffects: true }).some(
      (input) => (input.contextKey ?? input.key) === "defenderHpPercent",
    ),
  );
  const offensiveTraitInputs =
    trait?.inputs?.filter(
      (input) =>
        input.scope !== "slot" &&
        ((input.contextKey ?? input.key) !== "attackerHpPercent" || !health),
    ) ?? [];
  const defensiveTraitInputs =
    defenseTrait?.inputs?.filter((input) => input.scope !== "slot") ?? [];
  return (
    <section className={`four-skill-side four-skill-side--${side}`}>
      <header>
        <span>{label}</span>
        <strong>{name}</strong>
      </header>
      {offensiveTraitInputs.length > 0 ||
      trait?.skillPowerBonuses?.length > 0 ? (
        <div className="four-skill-trait-controls">
          <TraitHint description={trait.description} name={trait.name} />
          <TraitSkillPowerBonuses
            ariaLabel={`${trait.name}技能加成`}
            bonuses={trait.skillPowerBonuses}
          />
          <TraitAutomaticStack
            automaticStack={trait.automaticStack}
            skills={selectedSkills}
          />
          <TraitInputs
            context={traitContext}
            inputs={offensiveTraitInputs}
            onChange={(key, value) =>
              onTraitContextChange?.(side, key, value)
            }
          />
        </div>
      ) : null}
      {defensiveTraitInputs.length > 0 ? (
        <div className="four-skill-trait-controls four-skill-trait-controls--defense">
          <TraitHint
            description={defenseTrait.description}
            name={`${opponentName} · ${defenseTrait.name}`}
          />
          <TraitInputs
            context={traitContext}
            inputs={defensiveTraitInputs}
            onChange={(key, value) =>
              onTraitContextChange?.(side, key, value)
            }
          />
        </div>
      ) : null}
      {hasSelfHpRule && health ? (
        <div className="four-skill-health">
          <span>自身生命</span>
          <HealthInput
            currentHp={health.currentHp}
            defaultMode="percent"
            label={label}
            maxHp={health.maxHp}
            onCurrentHpChange={(value) => onHealthChange?.(side, value)}
            onPercentChange={(value) =>
              onHealthPercentChange?.(side, value)
            }
            percentValue={health.percent}
          />
        </div>
      ) : null}
      {hasTargetHpRule && opponentHealth ? (
        <div className="four-skill-health">
          <span>对方生命</span>
          <HealthInput
            currentHp={opponentHealth.currentHp}
            defaultMode="percent"
            label={opponentLabel}
            maxHp={opponentHealth.maxHp}
            onCurrentHpChange={(value) =>
              onHealthChange?.(opponentSide, value)
            }
            onPercentChange={(value) =>
              onHealthPercentChange?.(opponentSide, value)
            }
            percentValue={opponentHealth.percent}
          />
        </div>
      ) : null}
      <div className="skill-slot-list">
        <div aria-hidden="true" className="skill-slot skill-slot--head">
          <span />
          <span className="skill-slot__head-skill">技能</span>
          <span className="skill-slot__head-kind">属性</span>
          <span className="skill-slot__head-cost">耗</span>
          <span className="skill-slot__head-power">威力</span>
          <span className="skill-slot__head-hits">连击</span>
          <span className="skill-slot__head-result">伤害占比</span>
        </div>
        {traitDamage ? (
          <div
            aria-label={`${label}特性伤害${traitDamage.name}${
              active && activeDamageSource === "trait" ? "，当前选中" : ""
            }`}
            className={`skill-slot-group skill-slot-group--trait${
              active && activeDamageSource === "trait" ? " is-selected" : ""
            }`}
            onClick={() => onTraitDamageFocus?.(side)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onTraitDamageFocus?.(side);
              }
            }}
            role="group"
            tabIndex="0"
          >
            <div className="skill-slot skill-slot--trait">
              <span className="skill-slot__number">特</span>
              <strong className="skill-slot__trait-name">{traitDamage.name}</strong>
              <span className="skill-slot__kind">{traitDamage.typeLabel}</span>
              <span>—</span>
              <strong>{traitDamage.basePower}</strong>
              <label className="skill-slot__hits">
                <span className="sr-only">{label}{traitDamage.name}连击次数</span>
                <input
                  aria-label={`${label}${traitDamage.name}连击次数`}
                  max="99"
                  min="1"
                  onChange={(event) =>
                    onTraitDamageHitCountChange?.(
                      side,
                      Math.min(99, Math.max(1, Number(event.target.value) || 1)),
                    )
                  }
                  onFocus={() => onTraitDamageFocus?.(side)}
                  type="number"
                  value={traitDamage.hitCount}
                />
              </label>
              <SkillDamagePreview
                index={-1}
                label={label}
                opponentName={opponentName}
                result={traitDamage.result}
                selected={{ name: traitDamage.name }}
              />
            </div>
          </div>
        ) : null}
        {Array.from({ length: Math.max(4, selectedSkills.length) }, (_, index) => {
          const selected = selectedSkills[index];
          const result = results?.[index];
          const isSelected =
            active && activeDamageSource !== "trait" && index === activeSkillIndex;
          const choiceTraitInput =
            selected && supportsChoiceTrait(trait?.name)
              ? getChoiceTraitInput(selected)
              : null;
          const galeTurbineInput = getGaleTurbineCompanionInput({
            currentIndex: index,
            selectedSkills,
            traitName: trait?.name,
          });
          const skillInputs = selected
            ? [
                ...dynamicInputsForSkill(selected, {
                  includeStatusEffects: true,
                }),
                ...(choiceTraitInput ? [choiceTraitInput] : []),
                ...(galeTurbineInput ? [galeTurbineInput] : []),
              ]
            : [];
          const traitInputs =
            selected
              ? [
                  ...(trait?.inputs?.filter(
                    (input) => input.scope === "slot",
                  ) ??
                    (trait?.conditionKey
                      ? [{
                          defaultValue: false,
                          key: trait.conditionKey,
                          label: trait.conditionLabel,
                          id: trait.conditionKey,
                          scope: "slot",
                          type: "boolean",
                        }]
                      : [])),
                  ...(defenseTrait?.inputs?.filter(
                    (input) => input.scope === "slot",
                  ) ?? []),
                ]
              : [];
          const dynamicInputs = mergeDynamicInputs(
            skillInputs,
            traitInputs,
            result?.inputs ?? [],
          );
          const refractionHint = buildRefractionHint({
            carriedSkills: selectedSkills,
            selectedSkill: selected,
            sproutStacks,
          });
          const counterReflectionHint =
            result?.reflectedSourceSkillName &&
            Number.isFinite(result?.reflectedPower)
              ? `反弹「${result.reflectedSourceSkillName}」· 威力 ${result.reflectedPower}`
              : null;
          const powerResolutionHint = selected
            ? describeResolution(result)
            : null;
          return (
            <div
              aria-label={`${label}技能${index + 1}${isSelected ? "，当前选中" : ""}`}
              className={`skill-slot-group${isSelected ? " is-selected" : ""}`}
              key={`${side}-${index}`}
              onClick={(event) => {
                onSkillFocus?.(side, index);
                if (selected && !isInteractiveSkillTarget(event.target)) {
                  onSkillActivate?.(side, index);
                }
              }}
              onKeyDown={(event) => {
                if (
                  event.target === event.currentTarget &&
                  (event.key === "Enter" || event.key === " ")
                ) {
                  event.preventDefault();
                  onSkillFocus?.(side, index);
                }
              }}
              role="group"
              tabIndex="0"
            >
              <div className="skill-slot">
                <span className="skill-slot__number">{index + 1}</span>
                <SkillPicker
                  ariaLabel={`${label}技能${index + 1}`}
                  className="skill-picker--compact"
                  onFocus={() => onSkillFocus?.(side, index)}
                  onSelect={(skillId) => {
                    onSkillFocus?.(side, index);
                    onSkillSelect(side, index, skillId);
                  }}
                  selected={selected}
                  skills={skills}
                />
                <span className="skill-slot__kind">
                  {selected
                    ? `${result?.typeLabel ?? selected.type}·${CATEGORY_LABELS[selected.category]?.slice(0, 1) ?? "—"}`
                    : "—"}
                </span>
                <span className="skill-slot__cost">{selected?.cost ?? "—"}</span>
                <DraftNumberInput
                  ariaLabel={`${label}技能${index + 1}威力`}
                  className="skill-slot__power-input"
                  disabled={!selected}
                  min={0}
                  onCommit={(power) =>
                    onSkillPowerChange?.(side, index, power)
                  }
                  value={
                    displayedSkillPower(selected, result) ??
                    selected?.slotPowerOverride ??
                    selected?.basePower ??
                    ""
                  }
                />
                <label className="skill-slot__hits">
                  <span className="sr-only">
                    {label}技能{index + 1}连击次数
                  </span>
                  <input
                    aria-label={`${label}技能${index + 1}连击次数`}
                    disabled={!selected}
                    max="99"
                    min="1"
                    onChange={(event) =>
                      onSkillHitCountChange?.(
                        side,
                        index,
                        Math.min(
                          99,
                          Math.max(1, Number(event.target.value) || 1),
                        ),
                      )
                    }
                    onFocus={() => onSkillFocus?.(side, index)}
                    type="number"
                    value={
                      result?.hitCount ?? selected?.slotHitCount ?? hitCount
                    }
                  />
                </label>
                <SkillDamagePreview
                  index={index}
                  label={label}
                  opponentName={opponentName}
                  result={result}
                  selected={selected}
                />
              </div>
              {selected?.description ||
              refractionHint ||
              counterReflectionHint ||
              powerResolutionHint ||
              dynamicInputs.length > 0 ? (
                <div className="skill-slot__context">
                  {selected?.description ? (
                    <p
                      className="skill-slot__description"
                      title={selected.description}
                    >
                      {selected.description}
                    </p>
                  ) : null}
                  {powerResolutionHint ? (
                    <p
                      className="skill-slot__power-note"
                      title={powerResolutionHint}
                    >
                      {powerResolutionHint}
                    </p>
                  ) : null}
                  {refractionHint ? (
                    <p className="skill-slot__effect-hint" title={refractionHint}>
                      {refractionHint}
                    </p>
                  ) : null}
                  {counterReflectionHint ? (
                    <p
                      className="skill-slot__effect-hint"
                      title={counterReflectionHint}
                    >
                      {counterReflectionHint}
                    </p>
                  ) : null}
                  <div className="skill-slot__controls">
                    {dynamicInputs
                    .filter(
                      (input) =>
                        ((input.contextKey ?? input.key) !== "attackerHpPercent" || !health) &&
                        ((input.contextKey ?? input.key) !== "defenderHpPercent" || !opponentHealth),
                    )
                    .filter((input) =>
                      isDynamicInputVisible(
                        input,
                        selected?.slotContext,
                      ),
                    )
                    .map((input) =>
                    input.type === "choice" ? (
                      <label key={input.id ?? input.key}>
                        <span className="sr-only">{input.label}</span>
                        <select
                          aria-label={`${label}技能${index + 1}${input.label}`}
                          onChange={(event) =>
                            onSkillContextChange?.(
                              side,
                              index,
                              input.id ?? input.key,
                              event.target.value,
                            )
                          }
                          onFocus={() => onSkillFocus?.(side, index)}
                          value={dynamicInputValue(
                            input,
                            selected?.slotContext,
                          )}
                        >
                          {input.options.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : input.type === "boolean" ? (
                      <label key={input.id ?? input.key}>
                        <input
                          aria-label={`${label}技能${index + 1}${input.label}`}
                          checked={Boolean(
                            dynamicInputValue(
                              input,
                              selected?.slotContext,
                            ),
                          )}
                          onChange={(event) =>
                            onSkillContextChange?.(
                              side,
                              index,
                              input.id ?? input.key,
                              event.target.checked,
                            )
                          }
                          onFocus={() => onSkillFocus?.(side, index)}
                          type="checkbox"
                        />
                        {input.label}
                      </label>
                    ) : (
                      <label key={input.id ?? input.key}>
                        <span>{input.label}</span>
                        <input
                          aria-label={`${label}技能${index + 1}${input.label}`}
                          max={input.max}
                          min={input.min}
                          onChange={(event) =>
                            onSkillContextChange?.(
                              side,
                              index,
                              input.id ?? input.key,
                              clampDynamicInput(input, event.target.value),
                            )
                          }
                          onFocus={() => onSkillFocus?.(side, index)}
                          type="number"
                          value={
                            dynamicInputValue(
                              input,
                              selected?.slotContext,
                            ) ?? ""
                          }
                        />
                      </label>
                    ),
                  )}
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function FourSkillEditor({
  activeDamageSource = "skill",
  activeSide = "attacker",
  activeSkillIndex = 0,
  attackerHealth,
  attackerHitCount = 1,
  attackerName,
  attackerResults = [],
  attackerSkillChoices,
  attackerSkills,
  attackerSproutStacks = 0,
  attackerTrait,
  attackerTraitContext = {},
  attackerTraitDamage,
  attackerDefenseTrait,
  defenderHitCount = 1,
  defenderName,
  defenderResults = [],
  defenderSkillChoices,
  defenderSkills,
  defenderSproutStacks = 0,
  defenderTrait,
  defenderTraitContext = {},
  defenderTraitDamage,
  defenderDefenseTrait,
  defenderHealth,
  onHealthChange,
  onHealthPercentChange,
  onSkillActivate,
  onSkillContextChange,
  onSkillFocus,
  onSkillHitCountChange,
  onSkillPowerChange,
  onSkillSelect,
  onTraitContextChange,
  onTraitDamageFocus,
  onTraitDamageHitCountChange,
  skills,
}) {
  const isMobile = useMediaQuery("(max-width: 620px)");
  const [visibleSide, setVisibleSide] = useState("attacker");
  const sideProps = {
    attacker: {
      hitCount: attackerHitCount,
      health: attackerHealth,
      label: "攻击方",
      name: attackerName,
      opponentHealth: defenderHealth,
      opponentLabel: "防御方",
      opponentName: defenderName,
      opponentSide: "defender",
      results: attackerResults,
      selectedSkills: attackerSkills,
      side: "attacker",
      skills: attackerSkillChoices ?? skills,
      sproutStacks: attackerSproutStacks,
      trait: attackerTrait,
      defenseTrait: attackerDefenseTrait,
      traitContext: attackerTraitContext,
      traitDamage: attackerTraitDamage,
    },
    defender: {
      hitCount: defenderHitCount,
      health: defenderHealth,
      label: "防御方",
      name: defenderName,
      opponentHealth: attackerHealth,
      opponentLabel: "攻击方",
      opponentName: attackerName,
      opponentSide: "attacker",
      results: defenderResults,
      selectedSkills: defenderSkills,
      side: "defender",
      skills: defenderSkillChoices ?? skills,
      sproutStacks: defenderSproutStacks,
      trait: defenderTrait,
      defenseTrait: defenderDefenseTrait,
      traitContext: defenderTraitContext,
      traitDamage: defenderTraitDamage,
    },
  };

  function renderSide(side) {
    return (
      <SkillSide
        {...sideProps[side]}
        active={activeSide === side}
        activeDamageSource={activeDamageSource}
        activeSkillIndex={activeSkillIndex}
        key={side}
        onSkillActivate={onSkillActivate}
        onSkillContextChange={onSkillContextChange}
        onHealthChange={onHealthChange}
        onHealthPercentChange={onHealthPercentChange}
        onSkillFocus={onSkillFocus}
        onSkillHitCountChange={onSkillHitCountChange}
        onSkillPowerChange={onSkillPowerChange}
        onSkillSelect={onSkillSelect}
        onTraitContextChange={onTraitContextChange}
        onTraitDamageFocus={onTraitDamageFocus}
        onTraitDamageHitCountChange={onTraitDamageHitCountChange}
      />
    );
  }

  return (
    <div className="four-skill-editor">
      {isMobile ? (
        <>
          <div
            aria-label="四技能角色"
            className="four-skill-side-switch"
            role="group"
          >
            <button
              aria-pressed={visibleSide === "attacker"}
              onClick={() => {
                setVisibleSide("attacker");
                onSkillFocus?.("attacker", 0);
              }}
              type="button"
            >
              攻击
            </button>
            <button
              aria-pressed={visibleSide === "defender"}
              onClick={() => {
                setVisibleSide("defender");
                onSkillFocus?.("defender", 0);
              }}
              type="button"
            >
              防御
            </button>
          </div>
          {renderSide(visibleSide)}
        </>
      ) : (
        <>
          {renderSide("attacker")}
          {renderSide("defender")}
        </>
      )}
    </div>
  );
}
