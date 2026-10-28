import { useCalculatorLocale } from "../i18n/calculator-text.js";
import { SkillUsageSummary } from "./SkillUsageSummary.jsx";
import {
  Lightning,
  MagicWand,
  Shield,
  Sword,
  WarningCircle,
} from "@phosphor-icons/react";
import { damageTone } from "./damageTone.js";
import { damagePresentation, DamageSegments } from "./damagePresentation.jsx";
import { ElementIcon } from "./ElementIcon.jsx";
import { SkillPicker } from "./SkillPicker.jsx";
import { describeResolution } from "./SingleSkillEditor.jsx";
import { CompactConditionTrigger } from "./CompactConditions.jsx";
import { buildRefractionHint } from "../domain/refraction.js";
import { useLocale } from "../i18n/LocaleContext.jsx";

function CompactDamage({
  label,
  opponentName,
  placeholder = false,
  result,
  selected,
}) {
  const { tc, entityName } = useCalculatorLocale();
  if (placeholder) return null;
  const presentation = damagePresentation(result);
  const hasDamage = Number.isFinite(presentation.damage);
  const hasPercent = Number.isFinite(presentation.percent);
  const percent = hasPercent ? presentation.percent.toFixed(1) : null;
  const ariaLabel = selected
    ? tc("{v0}{v1}攻击{v2}：{v3}", {
        v0: label, v1: entityName("skill", selected), v2: entityName("spirit", { name: opponentName }),
        v3: hasPercent
          ? tc("{v0}，{v1}%{v2}", { v0: hasDamage ? tc("{v0}伤害", { v0: presentation.damage }) : tc("不直接造成伤害"), v1: percent, v2: presentation.freezePercent > 0 ? tc("（含冻结斩杀线）") : " HP" })
          : tc(result?.reason ?? "伤害待计算"),
      })
    : tc("{v0}技能未选择", { v0: label });

  return (
    <output
      aria-label={tc(ariaLabel)}
      className="compact-skill__result"
      data-status={hasPercent ? "ready" : "pending"}
      data-tone={damageTone(presentation.percent)}
      title={tc(presentation.detail ?? result?.reason)}
    >
      {hasPercent ? (
        <>
          <span className="compact-skill__damage">{tc(presentation.damage ?? "—")}</span>
          <strong>{tc(percent)}%</strong>
          <span aria-hidden="true" className="compact-skill__bar">
            <DamageSegments presentation={presentation} />
          </span>
        </>
      ) : (
        <>
          {selected && result?.reason !== "非伤害技能不计算伤害" ? (
            <WarningCircle aria-hidden="true" size={16} weight="fill" />
          ) : null}
          <strong>—</strong>
        </>
      )}
    </output>
  );
}

function CompactSkillSide({
  headerAction,
  active,
  activeDamageSource,
  activeSkillIndex,
  label,
  name,
  onSkillActivate,
  canSkillActivate,
  skillActivationLabel,
  onSkillFocus,
  onSkillSelect,
  onTraitDamageFocus,
  onTraitDamageHitCountChange,
  opponentName,
  placeholder,
  results,
  selectedSkills = [],
  side,
  skills,
  sproutStacks,
  traitDamage,
  traitEditor,
  conditions = [],
  onOpenConditions,
  openConditionKey,
}) {
  const { tc, typeLabel, entityName } = useCalculatorLocale();
  const { t } = useLocale();
  const SideIcon = side === "attacker" ? Sword : Shield;

  return (
    <section className={`compact-skill-side compact-skill-side--${side}`}>
      <header>
        <SideIcon aria-hidden="true" size={18} weight="fill" />
        <strong>{entityName("spirit", { name })}</strong>
        {tc(headerAction)}
      </header>
      {tc(!placeholder && traitEditor)}
      <div className="compact-skill__list">
        {!placeholder && traitDamage ? (
          <div
            aria-label={tc("{v0}特性伤害{v1}{v2}", { v0: label, v1: traitDamage.name, v2: active && activeDamageSource === "trait" ? "，当前选中" : "" })}
            className={`compact-skill__row compact-skill__row--trait${
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
            <span className="compact-skill__number compact-skill__number--trait">{tc("特")}</span>
            <span className="compact-skill__trait-skill" title={tc("固定特性伤害")}>
              <strong>{tc(traitDamage.name)}</strong>
              <small>{tc("威力 ")}{tc(traitDamage.basePower)}</small>
            </span>
            <span className="compact-skill__element compact-skill__element--trait">{tc("无 ")}</span>
            <label className="compact-skill__trait-hits">
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
            <CompactDamage
              label={label}
              opponentName={opponentName}
              result={traitDamage.result}
              selected={{ name: traitDamage.name }}
            />
          </div>
        ) : null}
        {Array.from({ length: Math.max(4, selectedSkills.length) }, (_, index) => {
          const selected = selectedSkills[index];
          const result = results?.[index];
          const conditionModel = conditions[index];
          const effectiveCost = result?.skillCost ?? selected?.cost;
          const effectiveType = result?.typeLabel ?? selected?.type;
          const isSelected =
            active && activeDamageSource !== "trait" && index === activeSkillIndex;
          const refractionHint = placeholder ? null : buildRefractionHint({
            carriedSkills: selectedSkills,
            selectedSkill: selected,
            sproutStacks,
          });
          const powerResolutionHint = !placeholder && selected
            ? describeResolution(result)
            : null;
          return (
            <div
              aria-label={t(isSelected ? "{label}技能{index}，当前选中" : "{label}技能{index}", { label, index: index + 1 })}
              className={`compact-skill__row${isSelected ? " is-selected" : ""}${conditionModel ? " has-conditions" : ""}`}
              key={`${side}-${index}`}
              onClick={(event) => {
                onSkillFocus?.(side, index);
                if (
                  !placeholder && ["status", "defense"].includes(selected?.category) &&
                  event.target instanceof Element &&
                  !event.target.closest("button, input, [role='combobox'], [role='option']")
                ) {
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
              <span className="compact-skill__number">{tc(index + 1)}</span>
              <SkillPicker
                ariaLabel={t("{label}技能{index}", { label, index: index + 1 })}
                className="skill-picker--compact"
                onFocus={() => onSkillFocus?.(side, index)}
                onSelect={(skillId) => {
                  onSkillFocus?.(side, index);
                  onSkillSelect(side, index, skillId);
                }}
                selected={selected}
                skills={skills}
                placeholder={tc(placeholder)}
              />
              {!placeholder && <CompactConditionTrigger model={conditionModel} onOpen={onOpenConditions} expanded={openConditionKey === conditionModel?.key} />}
              {!placeholder && <><span
                className="compact-skill__element"
                title={effectiveType ? typeLabel(effectiveType) : tc("未选择属性")}
              >
                <ElementIcon size={19} type={effectiveType} />
              </span>
              <span
                className="compact-skill__cost"
                title={selected ? tc("能耗 {v0}", { v0: effectiveCost ?? "—" }) : tc("能耗")}
              >
                <Lightning aria-hidden="true" size={14} weight="fill" />
                {tc(effectiveCost ?? "—")}
              </span></>}
              <CompactDamage
                label={label}
                opponentName={opponentName}
                placeholder={tc(placeholder)}
                result={result}
                selected={selected}
              />
              {!placeholder && <SkillUsageSummary result={result} nextHint={refractionHint} />}
              {!placeholder && canSkillActivate?.(side, index) ? <button type="button" className="skill-follow-up"
                aria-label={tc("{v0}技能{v1}{v2}", { v0: label, v1: index + 1, v2: skillActivationLabel?.(side, index) ?? "使用技能" })}
                onClick={() => onSkillActivate?.(side, index)}>
                {tc(skillActivationLabel?.(side, index) ?? "使用技能")}
              </button> : null}
              {powerResolutionHint ? (
                <small
                  className="compact-skill__power-note"
                  title={tc(powerResolutionHint)}
                >
                  {tc(powerResolutionHint)}
                </small>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function CompactFourSkillEditor({
  headerActions = {},
  placeholder = false,
  canSkillActivate,
  skillActivationLabel,
  traitEditors = {},
  conditionModels = {},
  onOpenConditions,
  openConditionKey,
  activeDamageSource = "skill",
  activeSide = "attacker",
  activeSkillIndex = 0,
  attackerName,
  attackerResults,
  attackerSkillChoices,
  attackerSkills,
  attackerSproutStacks = 0,
  attackerTraitDamage,
  defenderName,
  defenderResults,
  defenderSkillChoices,
  defenderSkills,
  defenderSproutStacks = 0,
  defenderTraitDamage,
  onSkillFocus,
  onSkillActivate,
  onSkillSelect,
  onTraitDamageFocus,
  onTraitDamageHitCountChange,
}) {
  const { tc } = useCalculatorLocale();
  const { t } = useLocale();
  return (
    <div className="compact-four-skill">
      <CompactSkillSide
        headerAction={headerActions.attacker}
        active={activeSide === "attacker"}
        activeDamageSource={activeDamageSource}
        activeSkillIndex={activeSkillIndex}
        label={t("攻击方")}
        name={attackerName}
        onSkillFocus={onSkillFocus}
        onSkillActivate={onSkillActivate}
        canSkillActivate={canSkillActivate}
        skillActivationLabel={skillActivationLabel}
        onSkillSelect={onSkillSelect}
        onTraitDamageFocus={onTraitDamageFocus}
        onTraitDamageHitCountChange={onTraitDamageHitCountChange}
        opponentName={defenderName}
        placeholder={tc(placeholder)}
        results={attackerResults}
        selectedSkills={attackerSkills}
        side="attacker"
        skills={attackerSkillChoices}
        sproutStacks={attackerSproutStacks}
        traitDamage={attackerTraitDamage}
        conditions={conditionModels.attacker}
        onOpenConditions={onOpenConditions}
        openConditionKey={openConditionKey}
        traitEditor={traitEditors.attacker}
      />
      <CompactSkillSide
        headerAction={headerActions.defender}
        active={activeSide === "defender"}
        activeDamageSource={activeDamageSource}
        activeSkillIndex={activeSkillIndex}
        label={t("防御方")}
        name={defenderName}
        onSkillFocus={onSkillFocus}
        onSkillActivate={onSkillActivate}
        canSkillActivate={canSkillActivate}
        skillActivationLabel={skillActivationLabel}
        onSkillSelect={onSkillSelect}
        onTraitDamageFocus={onTraitDamageFocus}
        onTraitDamageHitCountChange={onTraitDamageHitCountChange}
        opponentName={attackerName}
        placeholder={tc(placeholder)}
        results={defenderResults}
        selectedSkills={defenderSkills}
        side="defender"
        skills={defenderSkillChoices}
        sproutStacks={defenderSproutStacks}
        traitDamage={defenderTraitDamage}
        conditions={conditionModels.defender}
        onOpenConditions={onOpenConditions}
        openConditionKey={openConditionKey}
        traitEditor={traitEditors.defender}
      />
    </div>
  );
}

export function CompactSingleSkillEditor({
  placeholder = false,
  canActivateSkill = false,
  skillActivationLabel = "使用技能",
  onSkillActivate,
  attackName,
  defenseName,
  onSkillSelect,
  result,
  selectedSkill,
  skills,
  conditionModel,
  onOpenConditions,
  openConditionKey,
}) {
  const { tc, typeLabel, entityDescription } = useCalculatorLocale();
  const { t } = useLocale();
  const effectiveCost = result?.skillCost ?? selectedSkill?.cost;
  const effectiveType = result?.typeLabel ?? selectedSkill?.type;
  const powerResolutionHint = !placeholder && selectedSkill
    ? describeResolution(result)
    : null;
  return (
    <div className="compact-single-skill">
      <SkillPicker
        ariaLabel={t("{name}当前技能", { name: attackName })}
        onSelect={onSkillSelect}
        selected={selectedSkill}
        skills={skills}
        placeholder={tc(placeholder)}
      />
      <div className="compact-single-skill__meta">
        {!placeholder && <CompactConditionTrigger model={conditionModel} onOpen={onOpenConditions} expanded={openConditionKey === conditionModel?.key} />}
        {!placeholder && <><span title={effectiveType ? typeLabel(effectiveType) : tc("未选择属性")}>
          <ElementIcon size={20} type={effectiveType} />
        </span>
        <span title={tc(selectedSkill?.category ?? "技能类型")}>
          {selectedSkill?.category == null ? "—" : selectedSkill.category === "magical" ? (
            <MagicWand aria-hidden="true" size={18} weight="fill" />
          ) : (
            <Sword aria-hidden="true" size={18} weight="fill" />
          )}
        </span>
        <span title={tc("能耗 {v0}", { v0: effectiveCost ?? "—" })}>
          <Lightning aria-hidden="true" size={16} weight="fill" />
          {tc(effectiveCost ?? "—")}
        </span></>}
        <CompactDamage
          label=""
          opponentName={defenseName}
          placeholder={tc(placeholder)}
          result={result}
          selected={selectedSkill}
        />
      </div>
      {selectedSkill?.description ? (
        <p className="compact-single-skill__effect">
          {entityDescription("skill", selectedSkill)}
        </p>
      ) : null}
      {!placeholder && <SkillUsageSummary result={result} />}
      {!placeholder && canActivateSkill ? <button type="button" className="skill-follow-up" onClick={onSkillActivate}>
        {tc(skillActivationLabel)}
      </button> : null}
      {powerResolutionHint ? (
        <small
          className="compact-single-skill__power-note"
          title={tc(powerResolutionHint)}
        >
          {tc(powerResolutionHint)}
        </small>
      ) : null}
    </div>
  );
}
