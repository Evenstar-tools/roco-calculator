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
  activeSkillIndex,
  label,
  name,
  onSkillFocus,
  onSkillSelect,
  opponentName,
  results,
  selectedSkills,
  side,
  skills,
}) {
  const SideIcon = side === "attacker" ? Sword : Shield;

  return (
    <section className={`compact-skill-side compact-skill-side--${side}`}>
      <header>
        <SideIcon aria-hidden="true" size={18} weight="fill" />
        <strong>{name}</strong>
      </header>
      <div className="compact-skill__list">
        {Array.from({ length: 4 }, (_, index) => {
          const selected = selectedSkills[index];
          const isSelected = active && index === activeSkillIndex;
          return (
            <div
              aria-label={`${label}技能${index + 1}${isSelected ? "，当前选中" : ""}`}
              className={`compact-skill__row${isSelected ? " is-selected" : ""}`}
              key={`${side}-${index}`}
              onClick={() => onSkillFocus?.(side, index)}
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
                title={selected?.type ?? "未选择属性"}
              >
                <ElementIcon size={19} type={selected?.type} />
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
                result={results?.[index]}
                selected={selected}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function CompactFourSkillEditor({
  activeSide = "attacker",
  activeSkillIndex = 0,
  attackerName,
  attackerResults,
  attackerSkillChoices,
  attackerSkills,
  defenderName,
  defenderResults,
  defenderSkillChoices,
  defenderSkills,
  onSkillFocus,
  onSkillSelect,
}) {
  return (
    <div className="compact-four-skill">
      <CompactSkillSide
        active={activeSide === "attacker"}
        activeSkillIndex={activeSkillIndex}
        label="攻击方"
        name={attackerName}
        onSkillFocus={onSkillFocus}
        onSkillSelect={onSkillSelect}
        opponentName={defenderName}
        results={attackerResults}
        selectedSkills={attackerSkills}
        side="attacker"
        skills={attackerSkillChoices}
      />
      <CompactSkillSide
        active={activeSide === "defender"}
        activeSkillIndex={activeSkillIndex}
        label="防御方"
        name={defenderName}
        onSkillFocus={onSkillFocus}
        onSkillSelect={onSkillSelect}
        opponentName={attackerName}
        results={defenderResults}
        selectedSkills={defenderSkills}
        side="defender"
        skills={defenderSkillChoices}
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
  return (
    <div className="compact-single-skill">
      <SkillPicker
        ariaLabel={`${attackName}当前技能`}
        onSelect={onSkillSelect}
        selected={selectedSkill}
        skills={skills}
      />
      <div className="compact-single-skill__meta">
        <span title={selectedSkill?.type ?? "未选择属性"}>
          <ElementIcon size={20} type={selectedSkill?.type} />
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
