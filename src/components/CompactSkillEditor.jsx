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
import { CompactConditionTrigger, CompactSkillState } from "./CompactConditions.jsx";
import { useLocale } from "../i18n/LocaleContext.jsx";

function CompactDamage({
  label,
  opponentName,
  placeholder = false,
  result,
  selected,
}) {
  if (placeholder) return null;
  const presentation = damagePresentation(result);
  const hasDamage = Number.isFinite(presentation.damage);
  const hasPercent = Number.isFinite(presentation.percent);
  const percent = hasPercent ? presentation.percent.toFixed(1) : null;
  const ariaLabel = selected
    ? hasPercent
      ? `${label}${selected.name}攻击${opponentName}：${hasDamage ? `${presentation.damage}伤害` : "不直接造成伤害"}，${percent}%${presentation.freezePercent > 0 ? "（含冻结斩杀线）" : " HP"}`
      : `${label}${selected.name}攻击${opponentName}：${result?.reason ?? "伤害待计算"}`
    : `${label}技能未选择`;

  return (
    <output
      aria-label={ariaLabel}
      className="compact-skill__result"
      data-status={hasPercent ? "ready" : "pending"}
      data-tone={damageTone(presentation.percent)}
      title={presentation.detail ?? result?.reason}
    >
      {hasPercent ? (
        <>
          <span className="compact-skill__damage">{presentation.damage ?? "—"}</span>
          <strong>{percent}%</strong>
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
  traitDamage,
  traitEditor,
  conditions = [],
  onOpenConditions,
  openConditionKey,
}) {
  const { t } = useLocale();
  const SideIcon = side === "attacker" ? Sword : Shield;

  return (
    <section className={`compact-skill-side compact-skill-side--${side}`}>
      <header>
        <SideIcon aria-hidden="true" size={18} weight="fill" />
        <strong>{name}</strong>
        {headerAction}
      </header>
      {!placeholder && traitEditor}
      <div className="compact-skill__list">
        {!placeholder && traitDamage ? (
          <div
            aria-label={`${label}特性伤害${traitDamage.name}${
              active && activeDamageSource === "trait" ? "，当前选中" : ""
            }`}
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
            <span className="compact-skill__number compact-skill__number--trait">特</span>
            <span className="compact-skill__trait-skill" title="固定特性伤害">
              <strong>{traitDamage.name}</strong>
              <small>威力 {traitDamage.basePower}</small>
            </span>
            <span className="compact-skill__element compact-skill__element--trait">
              无
            </span>
            <label className="compact-skill__trait-hits">
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
          return (
            <div
              aria-label={t(isSelected ? "{label}技能{index}，当前选中" : "{label}技能{index}", { label, index: index + 1 })}
              className={`compact-skill__row${isSelected ? " is-selected" : ""}${conditionModel ? " has-conditions" : ""}`}
              key={`${side}-${index}`}
              onClick={() => {
                onSkillFocus?.(side, index);
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
              <span className="compact-skill__number">{index + 1}</span>
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
                placeholder={placeholder}
              />
              {!placeholder && <CompactConditionTrigger model={conditionModel} onOpen={onOpenConditions} expanded={openConditionKey === conditionModel?.key} />}
              {!placeholder && <><span
                className="compact-skill__element"
                title={effectiveType ?? "未选择属性"}
              >
                <ElementIcon size={19} type={effectiveType} />
              </span>
              <span
                className="compact-skill__cost"
                title={selected ? `能耗 ${effectiveCost ?? "—"}` : "能耗"}
              >
                <Lightning aria-hidden="true" size={14} weight="fill" />
                {effectiveCost ?? "—"}
              </span></>}
              <CompactDamage
                label={label}
                opponentName={opponentName}
                placeholder={placeholder}
                result={result}
                selected={selected}
              />
              {!placeholder && <CompactSkillState result={result} />}
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
  attackerTraitDamage,
  defenderName,
  defenderResults,
  defenderSkillChoices,
  defenderSkills,
  defenderTraitDamage,
  onSkillFocus,
  onSkillSelect,
  onTraitDamageFocus,
  onTraitDamageHitCountChange,
}) {
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
        onSkillSelect={onSkillSelect}
        onTraitDamageFocus={onTraitDamageFocus}
        onTraitDamageHitCountChange={onTraitDamageHitCountChange}
        opponentName={defenderName}
        placeholder={placeholder}
        results={attackerResults}
        selectedSkills={attackerSkills}
        side="attacker"
        skills={attackerSkillChoices}
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
        onSkillSelect={onSkillSelect}
        onTraitDamageFocus={onTraitDamageFocus}
        onTraitDamageHitCountChange={onTraitDamageHitCountChange}
        opponentName={attackerName}
        placeholder={placeholder}
        results={defenderResults}
        selectedSkills={defenderSkills}
        side="defender"
        skills={defenderSkillChoices}
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
  const { t } = useLocale();
  const effectiveCost = result?.skillCost ?? selectedSkill?.cost;
  const effectiveType = result?.typeLabel ?? selectedSkill?.type;
  return (
    <div className="compact-single-skill">
      <SkillPicker
        ariaLabel={t("{name}当前技能", { name: attackName })}
        onSelect={onSkillSelect}
        selected={selectedSkill}
        skills={skills}
        placeholder={placeholder}
      />
      <div className="compact-single-skill__meta">
        {!placeholder && <CompactConditionTrigger model={conditionModel} onOpen={onOpenConditions} expanded={openConditionKey === conditionModel?.key} />}
        {!placeholder && <><span title={effectiveType ?? "未选择属性"}>
          <ElementIcon size={20} type={effectiveType} />
        </span>
        <span title={selectedSkill?.category ?? "技能类型"}>
          {selectedSkill?.category == null ? "—" : selectedSkill.category === "magical" ? (
            <MagicWand aria-hidden="true" size={18} weight="fill" />
          ) : (
            <Sword aria-hidden="true" size={18} weight="fill" />
          )}
        </span>
        <span title={`能耗 ${effectiveCost ?? "—"}`}>
          <Lightning aria-hidden="true" size={16} weight="fill" />
          {effectiveCost ?? "—"}
        </span></>}
        <CompactDamage
          label=""
          opponentName={defenseName}
          placeholder={placeholder}
          result={result}
          selected={selectedSkill}
        />
      </div>
      {placeholder && selectedSkill?.description ? <p className="compact-single-skill__effect">{selectedSkill.description}</p> : null}
      {!placeholder && <CompactSkillState result={result} />}
    </div>
  );
}
