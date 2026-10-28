import { useCalculatorLocale } from "../i18n/calculator-text.js";
import { SkillUsageSummary, UsageCountActions } from "./SkillUsageSummary.jsx";
import { describeSkillUsage } from "../domain/skill-presentation.js";
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
import { damagePresentation, DamageSegments } from "./damagePresentation.jsx";
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
import { getDefaultHitCount } from "../domain/skill-effects.js";
import { resolveLifestealCapability } from "../domain/baron-greed.js";
import { S5PreviewTraitSummary } from "./S5PreviewTraitSummary.jsx";
import { getS5PreviewTraitPresentation } from "../features/s5-preview/trait-presentation.js";

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
  const { tc, entityName } = useCalculatorLocale();
  const presentation = damagePresentation(result);
  const hasDamage = Number.isFinite(presentation.damage);
  const hasPercent = Number.isFinite(presentation.percent);
  const percent = hasPercent ? presentation.percent.toFixed(1) : null;
  const ariaLabel = selected
    ? tc("{v0}{v1}攻击{v2}：{v3}", {
        v0: label, v1: entityName("skill", selected), v2: tc(opponentName),
        v3: hasPercent
          ? tc("{v0}，{v1}%{v2}", { v0: hasDamage ? tc("{v0}伤害", { v0: presentation.damage }) : tc("不直接造成伤害"), v1: percent, v2: presentation.freezePercent > 0 ? tc("（含冻结斩杀线）") : " HP" })
          : tc(result?.reason ?? "伤害待计算"),
      })
    : tc("{v0}技能{v1}未选择", { v0: label, v1: index + 1 });

  return (
    <output
      aria-label={tc(ariaLabel)}
      className="skill-slot__damage"
      data-status={hasPercent ? "ready" : "pending"}
      data-tone={damageTone(presentation.percent)}
      title={tc(presentation.detail ?? result?.reason)}
    >
      <span className="skill-slot__damage-values">
        <strong>{percent ? tc(`${percent}%`) : tc("—")}</strong>
        <span>{hasDamage ? tc("{v0}伤害", { v0: presentation.damage }) : tc("")}</span>
      </span>
      <span aria-hidden="true" className="skill-slot__damage-bar">
        <DamageSegments presentation={presentation} />
      </span>
    </output>
  );
}

function SkillSide({
  headerAction,
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
  canSkillActivate,
  skillActivationLabel,
  onSkillActivate,
  onSkillContextChange,
  onSkillFocus,
  onSkillHitCountChange,
  onSkillPowerClear,
  onSkillPowerChange,
  onSkillSelect,
  onHealthChange,
  onHealthPercentChange,
  onHealthInputModeChange,
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
  traitEditor,
}) {
  const { tc, locale, typeLabel, entityName, entityDescription } = useCalculatorLocale();
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
  const offensePresentation = getS5PreviewTraitPresentation(trait, "attacker");
  const defensePresentation = getS5PreviewTraitPresentation(defenseTrait, "defender");
  const offensiveTraitInputs =
    (offensePresentation?.inputs ?? trait?.inputs)?.filter(
      (input) =>
        input.scope !== "slot" &&
        ((input.contextKey ?? input.key) !== "attackerHpPercent" || !health),
    ) ?? [];
  const defensiveTraitInputs =
    (defensePresentation?.inputs ?? defenseTrait?.inputs)?.filter((input) => input.scope !== "slot" &&
      input.contextKey !== "defenderTraitS5BattleLevel") ?? [];
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
        <span>{tc(label)}</span>
        <strong>{tc(name)}</strong>
        {tc(headerAction)}
      </header>
      <div className="four-skill-side__conditions">
        {tc(traitEditor)}
        {offensiveTraitInputs.length > 0 ||
        offensePresentation?.visible ||
        trait?.skillPowerBonuses?.length > 0 ||
        showsLifestealCapability ? (
          <div className="four-skill-trait-controls">
            <TraitHint trait={trait} description={trait.description} name={trait.name} />
            <S5PreviewTraitSummary trait={trait} role="attacker" context={traitContext} />
            <TraitSkillPowerBonuses
              ariaLabel={tc("{v0}技能加成", { v0: trait.name })}
              bonuses={trait.skillPowerBonuses}
            />
            <TraitAutomaticStack
              automaticStack={trait.automaticStack}
              skills={selectedSkills}
            />
            {showsLifestealCapability ? (
              <small className="trait-capability-note">{tc("吸血 ")}{tc(lifesteal.levels)}{tc("层 · ")}{tc(lifesteal.percent)}%
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
        {defensiveTraitInputs.length > 0 || defensePresentation?.visible ? (
          <div className="four-skill-trait-controls four-skill-trait-controls--defense">
            <TraitHint
              description={entityDescription("trait", defenseTrait)}
              name={`${tc(opponentName)} · ${entityName("trait", defenseTrait)}`}
            />
            <S5PreviewTraitSummary trait={defenseTrait} role="defender" context={traitContext} />
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
            <span>{tc("自身生命")}</span>
            <HealthInput
              currentHp={health.currentHp}
              defaultMode="percent"
              label={label}
              maxHp={health.maxHp}
              onCurrentHpChange={(value) => onHealthChange?.(side, value)}
              onInputModeChange={(mode) => onHealthInputModeChange?.(side, mode)}
              onPercentChange={(value) =>
                onHealthPercentChange?.(side, value)
              }
              percentValue={health.percent}
            />
          </div>
        ) : null}
        {hasTargetHpRule && opponentHealth ? (
          <div className="four-skill-health">
            <span>{tc("对方生命")}</span>
            <HealthInput
              currentHp={opponentHealth.currentHp}
              onInputModeChange={(mode) => onHealthInputModeChange?.(opponentSide, mode)}
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
      </div>
      <div className="skill-slot-list">
        <div aria-hidden="true" className="skill-slot skill-slot--head">
          <span />
          <span className="skill-slot__head-skill">{tc("技能")}</span>
          <span className="skill-slot__head-kind">{tc("属性")}</span>
          <span className="skill-slot__head-cost">{tc("耗")}</span>
          <span className="skill-slot__head-power">
            {powerDisplayMode === "panel" ? tc("显示威力") : tc("静态威力")}
          </span>
          <span className="skill-slot__head-hits">{tc("连击")}</span>
          <span className="skill-slot__head-result">{tc("伤害占比")}</span>
        </div>
        {traitDamage ? (
          <div
            aria-label={tc("{v0}特性伤害{v1}{v2}", { v0: label, v1: traitDamage.name, v2: active && activeDamageSource === "trait" ? "，当前选中" : "" })}
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
              <span className="skill-slot__number skill-slot__number--trait">{tc("特")}</span>
              <span className="skill-slot__trait-skill" title={tc("固定特性伤害")}>
                {tc(traitDamage.name)}
              </span>
              <span className="skill-slot__kind">{tc(traitDamage.typeLabel)}</span>
              <span>—</span>
              <strong className="skill-slot__trait-power">
                {tc(traitDamage.basePower)}
              </strong>
              <label className="skill-slot__hits">
                <span className="sr-only">{tc(label)}{tc(traitDamage.name)}{tc("连击次数")}</span>
                <input
                  aria-label={tc("{v0}{v1}连击次数", { v0: label, v1: traitDamage.name })}
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
          const editableHitCountInput = skillDynamicInputs.find(
            (input) => input.drivesHitCount === true,
          );
          const hitCountMaximum = editableHitCountInput
            ? editableHitCountInput.max ?? Number.POSITIVE_INFINITY
            : 99;
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
              aria-label={tc("{v0}技能{v1}{v2}", { v0: label, v1: index + 1, v2: isSelected ? "，当前选中" : "" })}
              className={`skill-slot-group${isSelected ? " is-selected" : ""}`}
              key={`${side}-${index}`}
              onClick={(event) => {
                onSkillFocus?.(side, index);
                if (["status", "defense"].includes(selected?.category) && !isInteractiveSkillTarget(event.target)) {
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
                <span className="skill-slot__number">{tc(index + 1)}</span>
                <SkillPicker
                  ariaLabel={tc("{v0}技能{v1}", { v0: label, v1: index + 1 })}
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
                  {selected ? locale === "zh-CN"
                    ? `${result?.typeLabel ?? selected.type ?? "—"}·${CATEGORY_LABELS[selected.category]?.slice(0, 1) ?? "—"}`
                    : <><span>{typeLabel(result?.typeLabel ?? selected.type ?? "—")}</span><span>{tc(CATEGORY_LABELS[selected.category] ?? "—")}</span></>
                    : "—"}
                </span>
                <span className="skill-slot__cost">
                  {tc(result?.skillCost ?? selected?.cost ?? "—")}
                </span>
                <PowerDraftInput
                  key={`${selected?.id}-${powerDisplayMode}`}
                  ariaLabel={tc("{v0}技能{v1}{v2}", { v0: label, v1: index + 1, v2: powerDisplayMode === "panel" ? "显示威力" : "静态威力" })}
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
                    {tc(label)}{tc("技能")}{tc(index + 1)}{tc("连击次数 ")}</span>
                  <input
                    aria-label={tc("{v0}技能{v1}连击次数", { v0: label, v1: index + 1 })}
                    disabled={!selected}
                    max={Number.isFinite(hitCountMaximum) ? hitCountMaximum : undefined}
                    min="1"
                    onChange={(event) =>
                      onSkillHitCountChange?.(
                        side,
                        index,
                        Math.min(
                          hitCountMaximum,
                          Math.max(1, Number(event.target.value) || 1),
                        ),
                      )
                    }
                    onFocus={() => onSkillFocus?.(side, index)}
                    type="number"
                    value={
                      result?.hitCount ?? selected?.slotHitCount ??
                      (selected?.calculationStatus === "pending-skill-data" ? getDefaultHitCount(selected) : hitCount)
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
              describeSkillUsage(result) ||
              refractionHint ||
              counterReflectionHint ||
              powerResolutionHint ||
              powerSourceHint ||
              canSkillActivate?.(side, index) ||
              dynamicInputs.length > 0 ? (
                <div className="skill-slot__context">
                  {selected?.description ? (
                    <p
                      className="skill-slot__description"
                      title={entityDescription("skill", selected)}
                    >
                      {entityDescription("skill", selected)}
                    </p>
                  ) : null}
                  {powerResolutionHint && !result?.usageSummary ? (
                    <p
                      className="skill-slot__power-note"
                      title={tc(powerResolutionHint)}
                    >
                      {tc(powerResolutionHint)}
                    </p>
                  ) : null}
                  {powerSourceHint ? (
                    <small className="skill-slot__power-source">
                      {tc(powerSourceHint)}
                    </small>
                  ) : null}
                  {counterReflectionHint ? (
                    <p
                      className="skill-slot__effect-hint"
                      title={tc(counterReflectionHint)}
                    >
                      {tc(counterReflectionHint)}
                    </p>
                  ) : null}
                  {hasBurstSources || visibleDynamicInputs.length > 0 ? <div
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
                            <span className="sr-only">{tc(input.label)}</span>
                            <select
                              aria-label={tc("{v0}技能{v1}{v2}", { v0: label, v1: index + 1, v2: input.label })}
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
                                  {tc(option.label)}
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
                              aria-label={tc("{v0}技能{v1}{v2}", { v0: label, v1: index + 1, v2: input.label })}
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
                            {tc(input.label)}
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
                            <span>{tc(input.label)}</span>
                            <input
                              aria-label={tc("{v0}技能{v1}{v2}", { v0: label, v1: index + 1, v2: input.label })}
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
                                ((input.contextKey ?? input.key) === "actualSkillCost" ? result?.effectiveCostInput : undefined) ?? dynamicInputValue(
                                  input,
                                  selected?.slotContext,
                                ) ?? ((input.contextKey ?? input.key) === "skillPosition" ? index + 1 : "")
                              }
                            />
                            <UsageCountActions input={input} value={dynamicInputValue(input, selected?.slotContext)} onChange={(value) => onSkillContextChange?.(side, index, input.id ?? input.key, value)} />
                          </label>
                        ),
                      )}
                    </div>
                  </div> : null}
                  <SkillUsageSummary result={result} nextHint={refractionHint} />
                  {canSkillActivate?.(side, index) ? (
                    <button className="skill-follow-up" type="button"
                      aria-label={tc("{v0}技能{v1}{v2}", { v0: label, v1: index + 1, v2: skillActivationLabel?.(side, index) ?? "使用技能" })}
                      onClick={() => onSkillActivate?.(side, index)}>
                      {tc(skillActivationLabel?.(side, index) ?? "使用技能")}
                    </button>
                  ) : null}
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
  headerActions = {},
  canSkillActivate,
  skillActivationLabel,
  traitEditors = {},
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
  onHealthInputModeChange,
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
  const { tc } = useCalculatorLocale();
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
        headerAction={headerActions[side]}
        traitEditor={traitEditors[side]}
        active={activeSide === side}
        activeDamageSource={activeDamageSource}
        activeSkillIndex={activeSkillIndex}
        key={side}
        onSkillActivate={onSkillActivate}
        canSkillActivate={canSkillActivate}
        skillActivationLabel={skillActivationLabel}
        onSkillContextChange={onSkillContextChange}
        onHealthChange={onHealthChange}
        onHealthPercentChange={onHealthPercentChange}
        onHealthInputModeChange={onHealthInputModeChange}
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
            aria-label={tc("四技能角色")}
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
            >{tc("攻击 ")}</button>
            <button
              aria-pressed={visibleSide === "defender"}
              onClick={() => {
                setVisibleSide("defender");
                onSkillFocus?.("defender", 0);
              }}
              type="button"
            >{tc("防御 ")}</button>
          </div>
          {tc(renderSide(visibleSide))}
        </>
      ) : (
        <>
          {tc(renderSide("attacker"))}
          {tc(renderSide("defender"))}
        </>
      )}
    </div>
  );
}
