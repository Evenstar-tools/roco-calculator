import {
  Lightning,
  MagicWand,
  Shield,
  Sword,
  WarningCircle,
} from "@phosphor-icons/react";
import { damageTone } from "./damageTone.js";
import { ElementIcon } from "./ElementIcon.jsx";
import { SkillPicker } from "./SkillPicker.jsx";
import { buildRefractionHint } from "../domain/refraction.js";

function CompactDamage({
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
      ? `${label}${selected.name}攻击${opponentName}：${result.totalDamage}伤害，${percent}% HP`
      : `${label}${selected.name}攻击${opponentName}：${result?.reason ?? "伤害待计算"}`
    : `${label}技能未选择`;

  return (
    <output
      aria-label={ariaLabel}
      className="compact-skill__result"
      data-status={hasDamage ? "ready" : "pending"}
      data-tone={damageTone(result?.hpPercent)}
      title={result?.reason}
    >
      {hasDamage ? (
        <>
          <span className="compact-skill__damage">{result.totalDamage}</span>
          <strong>{percent}%</strong>
          <span aria-hidden="true" className="compact-skill__bar">
            <span
              style={{
                width: `${Math.min(100, Math.max(0, result.hpPercent))}%`,
              }}
            />
          </span>
        </>
      ) : (
        <>
          {selected ? (
            <WarningCircle aria-hidden="true" size={16} weight="fill" />
          ) : null}
          <strong>—</strong>
        </>
      )}
    </output>
  );
}

function CompactSkillSide({
  active,
  activeDamageSource,
  activeSkillIndex,
  label,
  name,
  onSkillActivate,
  onSkillFocus,
  onSkillSelect,
  onTraitDamageFocus,
  onTraitDamageHitCountChange,
  opponentName,
  results,
  selectedSkills,
  side,
  skills,
  traitDamage,
}) {
  const SideIcon = side === "attacker" ? Sword : Shield;

  return (
    <section className={`compact-skill-side compact-skill-side--${side}`}>
      <header>
        <SideIcon aria-hidden="true" size={18} weight="fill" />
        <strong>{name}</strong>
      </header>
      <div className="compact-skill__list">
        {traitDamage ? (
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
            <span className="compact-skill__number">特</span>
            <span className="compact-skill__trait-name">
              <strong>{traitDamage.name}</strong>
              <small>{traitDamage.typeLabel} · 威 {traitDamage.basePower}</small>
            </span>
            <span className="compact-skill__element">无</span>
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
          const effectiveType = result?.typeLabel ?? selected?.type;
          const isSelected =
            active && activeDamageSource !== "trait" && index === activeSkillIndex;
          const refractionHint = buildRefractionHint({
            carriedSkills: selectedSkills,
            selectedSkill: selected,
          });
          return (
            <div
              aria-label={`${label}技能${index + 1}${isSelected ? "，当前选中" : ""}`}
              className={`compact-skill__row${isSelected ? " is-selected" : ""}`}
              key={`${side}-${index}`}
              onClick={(event) => {
                onSkillFocus?.(side, index);
                if (
                  selected &&
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
              <span className="compact-skill__number">{index + 1}</span>
              <SkillPicker
                ariaLabel={`${label}技能${index + 1}`}
                className="skill-picker--compact"
                onFocus={() => onSkillFocus(side, index)}
                onSelect={(skillId) => {
                  onSkillFocus(side, index);
                  onSkillSelect(side, index, skillId);
                }}
                selected={selected}
                skills={skills}
              />
              <span
                className="compact-skill__element"
                title={effectiveType ?? "未选择属性"}
              >
                <ElementIcon size={19} type={effectiveType} />
              </span>
              <span
                className="compact-skill__cost"
                title={selected ? `能耗 ${selected.cost ?? "—"}` : "能耗"}
              >
                <Lightning aria-hidden="true" size={14} weight="fill" />
                {selected?.cost ?? "—"}
              </span>
              <CompactDamage
                label={label}
                opponentName={opponentName}
                result={result}
                selected={selected}
              />
              {refractionHint ? (
                <small
                  className="compact-skill__effect-hint"
                  title={refractionHint}
                >
                  {refractionHint}
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
  onSkillActivate,
  onSkillSelect,
  onTraitDamageFocus,
  onTraitDamageHitCountChange,
}) {
  return (
    <div className="compact-four-skill">
      <CompactSkillSide
        active={activeSide === "attacker"}
        activeDamageSource={activeDamageSource}
        activeSkillIndex={activeSkillIndex}
        label="攻击方"
        name={attackerName}
        onSkillFocus={onSkillFocus}
        onSkillActivate={onSkillActivate}
        onSkillSelect={onSkillSelect}
        onTraitDamageFocus={onTraitDamageFocus}
        onTraitDamageHitCountChange={onTraitDamageHitCountChange}
        opponentName={defenderName}
        results={attackerResults}
        selectedSkills={attackerSkills}
        side="attacker"
        skills={attackerSkillChoices}
        traitDamage={attackerTraitDamage}
      />
      <CompactSkillSide
        active={activeSide === "defender"}
        activeDamageSource={activeDamageSource}
        activeSkillIndex={activeSkillIndex}
        label="防御方"
        name={defenderName}
        onSkillFocus={onSkillFocus}
        onSkillActivate={onSkillActivate}
        onSkillSelect={onSkillSelect}
        onTraitDamageFocus={onTraitDamageFocus}
        onTraitDamageHitCountChange={onTraitDamageHitCountChange}
        opponentName={attackerName}
        results={defenderResults}
        selectedSkills={defenderSkills}
        side="defender"
        skills={defenderSkillChoices}
        traitDamage={defenderTraitDamage}
      />
    </div>
  );
}

export function CompactSingleSkillEditor({
  attackName,
  defenseName,
  onSkillSelect,
  result,
  selectedSkill,
  skills,
}) {
  const effectiveType = result?.typeLabel ?? selectedSkill?.type;
  return (
    <div className="compact-single-skill">
      <SkillPicker
        ariaLabel={`${attackName}当前技能`}
        onSelect={onSkillSelect}
        selected={selectedSkill}
        skills={skills}
      />
      <div className="compact-single-skill__meta">
        <span title={effectiveType ?? "未选择属性"}>
          <ElementIcon size={20} type={effectiveType} />
        </span>
        <span title={selectedSkill?.category ?? "技能类型"}>
          {selectedSkill?.category === "magical" ? (
            <MagicWand aria-hidden="true" size={18} weight="fill" />
          ) : (
            <Sword aria-hidden="true" size={18} weight="fill" />
          )}
        </span>
        <span title={`能耗 ${selectedSkill?.cost ?? "—"}`}>
          <Lightning aria-hidden="true" size={16} weight="fill" />
          {selectedSkill?.cost ?? "—"}
        </span>
        <CompactDamage
          label=""
          opponentName={defenseName}
          result={result}
          selected={selectedSkill}
        />
      </div>
      {selectedSkill?.description ? (
        <p className="compact-single-skill__effect">
          {selectedSkill.description}
        </p>
      ) : null}
    </div>
  );
}
