import {
  BurstSourceControls,
  clampDynamicInput,
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
import { PowerDraftInput } from "./PowerDraftInput.jsx";
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
import { resolveLifestealCapability } from "../domain/baron-greed.js";

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
  lifestealPercent,
  label,
  name,
  opponentHealth,
  opponentLabel,
  opponentName,
  opponentSide,
  powerDisplayMode,
  negativeStatusEnabled,
  onSkillActivate,
  onSkillContextChange,
  onSkillFocus,
  onSkillHitCountChange,
  onSkillPowerClear,
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
  traits = [],
  defenseTrait,
  traitContext,
  traitDamage,
}) {
  const hasSelfHpRule =
    selectedSkills.some((skill) =>
      dynamicInputsForSkill(skill, {
        includeNegativeStatusEffects: negativeStatusEnabled,
        includeStatusEffects: true,
      }).some(
        (input) => (input.contextKey ?? input.key) === "attackerHpPercent",
      ),
    ) ||
    trait?.inputs?.some(
      (input) => (input.contextKey ?? input.key) === "attackerHpPercent",
    );
  const hasTargetHpRule = selectedSkills.some((skill) =>
    dynamicInputsForSkill(skill, {
      includeNegativeStatusEffects: negativeStatusEnabled,
      includeStatusEffects: true,
    }).some(
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
  const effectiveTraits = traits.length > 0
    ? traits
    : trait
      ? [trait]
      : [];
  const choiceTraitName = effectiveTraits
    .map((candidate) => candidate?.displayName ?? candidate?.name)
    .find(supportsChoiceTrait) ?? null;
  const wingTraitName = effectiveTraits
    .map((candidate) => candidate?.displayName ?? candidate?.name)
    .find((name) => name === "展翅") ?? null;
  const lifesteal = resolveLifestealCapability({
    persistentLifestealPercent: lifestealPercent,
    traits: effectiveTraits,
  });
  const showsLifestealCapability =
    lifesteal.percent > 0 || effectiveTraits.some((candidate) =>
      ["戏耍", "贪得无厌"].includes(
        candidate?.displayName ?? candidate?.name,
      )
    );
  return (
    <section className={`four-skill-side four-skill-side--${side}`}>
      <header>
        <span>{label}</span>
        <strong>{name}</strong>
      </header>
      {offensiveTraitInputs.length > 0 ||
      trait?.skillPowerBonuses?.length > 0 ||
      showsLifestealCapability ? (
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
          {showsLifestealCapability ? (
            <small className="trait-capability-note">
              吸血 {lifesteal.levels}层 · {lifesteal.percent}%
            </small>
          ) : null}
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
          <span className="skill-slot__head-power">
            {powerDisplayMode === "panel" ? "显示威力" : "静态威力"}
          </span>
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
              <span className="skill-slot__number skill-slot__number--trait">特</span>
              <span className="skill-slot__trait-skill" title="固定特性伤害">
                {traitDamage.name}
              </span>
              <span className="skill-slot__kind">{traitDamage.typeLabel}</span>
              <span>—</span>
              <strong className="skill-slot__trait-power">
                {traitDamage.basePower}
              </strong>
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
            selected && choiceTraitName
              ? getChoiceTraitInput(selected)
              : null;
          const galeTurbineInput = getGaleTurbineCompanionInput({
            currentIndex: index,
            selectedSkills,
            traitName: wingTraitName,
          });
          const skillInputs = selected
            ? [
                ...dynamicInputsForSkill(selected, {
                  includeNegativeStatusEffects: negativeStatusEnabled,
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
          const skillDynamicInputs = mergeDynamicInputs(
            skillInputs,
            result?.inputs ?? [],
          ).map((input) =>
            selected?.name === "雷暴" &&
            (input.contextKey ?? input.key) === "burstTriggered"
              ? { ...input, label: "雷暴迸发" }
              : input,
          );
          const traitDynamicInputs = mergeDynamicInputs(traitInputs).map(
            (input) =>
              (input.contextKey ?? input.key) === "burstTriggered"
                ? {
                    ...input,
                    controlGroup: "trait",
                    label: trait?.name
                      ? `触发${trait.name}`
                      : "触发特性迸发",
                  }
                : { ...input, controlGroup: "trait" },
          );
          const dynamicInputs = [
            ...skillDynamicInputs,
            ...traitDynamicInputs,
          ];
          const visibleInputs = (inputs) =>
            inputs
              .filter(
                (input) =>
                  ((input.contextKey ?? input.key) !== "attackerHpPercent" ||
                    !health) &&
                  ((input.contextKey ?? input.key) !== "defenderHpPercent" ||
                    !opponentHealth),
              )
              .filter((input) =>
                isDynamicInputVisible(input, selected?.slotContext),
              )
              .filter((input) => !input.burstSource);
          const visibleSkillInputs = visibleInputs(skillDynamicInputs);
          const visibleTraitInputs = visibleInputs(traitDynamicInputs);
          const visibleDynamicInputs = [
            ...visibleSkillInputs,
            ...visibleTraitInputs,
          ];
          const hasBurstSources = skillDynamicInputs.some(
            (input) => input.burstSource,
          );
          const refractionHint = buildRefractionHint({
            carriedSkills: selectedSkills,
            selectedSkill: selected,
            sproutStacks,
          });
          const counterReflectionHint =
            result?.reflectedSourceSkillName &&
            Number.isFinite(result?.reflectedPower)
              ? `反弹「${result.reflectedSourceSkillName}」· 继承显示威力 ${result.reflectedPower}`
              : null;
          const powerResolutionHint = selected
            ? describeResolution(result)
            : null;
          const powerSourceHint = null;
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
                <span className="skill-slot__cost">
                  {result?.skillCost ?? selected?.cost ?? "—"}
                </span>
                <PowerDraftInput
                  ariaLabel={`${label}技能${index + 1}${
                    powerDisplayMode === "panel" ? "显示威力" : "静态威力"
                  }`}
                  className="skill-slot__power-input"
                  disabled={!selected}
                  isManual={Boolean(selected?.slotPowerOverride)}
                  mode={powerDisplayMode === "panel" ? "panel" : "static"}
                  onClear={() => onSkillPowerClear?.(side, index)}
                  onCommit={(value) =>
                    onSkillPowerChange?.(side, index, {
                      mode: powerDisplayMode === "panel" ? "panel" : "static",
                      value,
                    })
                  }
                  value={
                    selected
                      ? powerDisplayMode === "panel"
                        ? result?.panelPower ?? result?.effectivePower ?? selected.basePower
                        : result?.staticPower ?? displayedSkillPower(selected, result) ?? selected.basePower
                      : ""
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
              powerSourceHint ||
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
                  {powerSourceHint ? (
                    <small className="skill-slot__power-source">
                      {powerSourceHint}
                    </small>
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
                  <div
                    className={`skill-slot__control-row${
                      hasBurstSources ? " has-burst-sources" : ""
                    }`}
                  >
                    <BurstSourceControls
                      ariaPrefix={`${label}技能${index + 1}`}
                      context={selected?.slotContext}
                      inputs={skillDynamicInputs}
                      onChange={(key, value) =>
                        onSkillContextChange?.(side, index, key, value)
                      }
                      onFocus={() => onSkillFocus?.(side, index)}
                    />
                    <div className="skill-slot__controls">
                      {visibleDynamicInputs.map((input) =>
                        input.type === "choice" ? (
                          <label
                            className={
                              input.controlGroup === "trait"
                                ? "skill-slot__control--trait"
                                : undefined
                            }
                            key={input.id ?? input.key}
                          >
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
                          <label
                            className={
                              input.controlGroup === "trait"
                                ? "skill-slot__control--trait"
                                : undefined
                            }
                            key={input.id ?? input.key}
                          >
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
                          <label
                            className={
                              input.controlGroup === "trait"
                                ? "skill-slot__control--trait"
                                : undefined
                            }
                            key={input.id ?? input.key}
                          >
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
                              onFocus={(event) => {
                                onSkillFocus?.(side, index);
                                if ((input.contextKey ?? input.key) === "energy") {
                                  event.currentTarget.select();
                                }
                              }}
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
  attackerLifestealPercent = 0,
  attackerHitCount = 1,
  attackerName,
  attackerResults = [],
  attackerSkillChoices,
  attackerSkills,
  attackerSproutStacks = 0,
  attackerTrait,
  attackerTraits = [],
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
  defenderTraits = [],
  defenderTraitContext = {},
  defenderTraitDamage,
  defenderDefenseTrait,
  defenderHealth,
  defenderLifestealPercent = 0,
  onHealthChange,
  onHealthPercentChange,
  onSkillActivate,
  onSkillContextChange,
  onSkillFocus,
  onSkillHitCountChange,
  onSkillPowerClear,
  onSkillPowerChange,
  onSkillSelect,
  onTraitContextChange,
  onTraitDamageFocus,
  onTraitDamageHitCountChange,
  negativeStatusEnabled = false,
  powerDisplayMode = "static",
  skills,
}) {
  const isMobile = useMediaQuery("(max-width: 620px)");
  const [visibleSide, setVisibleSide] = useState("attacker");
  const sideProps = {
    attacker: {
      hitCount: attackerHitCount,
      health: attackerHealth,
      lifestealPercent: attackerLifestealPercent,
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
      traits: attackerTraits,
      defenseTrait: attackerDefenseTrait,
      traitContext: attackerTraitContext,
      traitDamage: attackerTraitDamage,
    },
    defender: {
      hitCount: defenderHitCount,
      health: defenderHealth,
      lifestealPercent: defenderLifestealPercent,
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
      traits: defenderTraits,
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
        onSkillPowerClear={onSkillPowerClear}
        onSkillPowerChange={onSkillPowerChange}
        onSkillSelect={onSkillSelect}
        negativeStatusEnabled={negativeStatusEnabled}
        powerDisplayMode={powerDisplayMode}
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
