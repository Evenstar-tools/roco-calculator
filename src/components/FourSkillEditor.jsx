import {
  clampDynamicInput,
  DraftNumberInput,
  dynamicInputValue,
  dynamicInputsForSkill,
  isDynamicInputVisible,
  TraitInputs,
} from "./SingleSkillEditor.jsx";
import { SkillPicker } from "./SkillPicker.jsx";
import { useEffect, useState } from "react";
import { damageTone } from "./damageTone.js";
import { HealthInput } from "./HealthInput.jsx";

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
  results,
  selectedSkills,
  side,
  skills,
  trait,
  defenseTrait,
  traitContext,
}) {
  const hasSelfHpRule = selectedSkills.some((skill) =>
    dynamicInputsForSkill(skill, { includeStatusEffects: true }).some(
      (input) => input.key === "attackerHpPercent",
    ),
  );
  const hasTargetHpRule = selectedSkills.some((skill) =>
    dynamicInputsForSkill(skill, { includeStatusEffects: true }).some(
      (input) => input.key === "defenderHpPercent",
    ),
  );
  const offensiveTraitInputs =
    trait?.inputs?.filter((input) => input.scope !== "skill") ?? [];
  const defensiveTraitInputs =
    defenseTrait?.inputs?.filter((input) => input.scope !== "skill") ?? [];
  return (
    <section className={`four-skill-side four-skill-side--${side}`}>
      <header>
        <span>{label}</span>
        <strong>{name}</strong>
      </header>
      {offensiveTraitInputs.length > 0 ? (
        <div className="four-skill-trait-controls">
          <span>{trait.name}</span>
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
          <span>{defenseTrait.name}</span>
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
        {Array.from({ length: 4 }, (_, index) => {
          const selected = selectedSkills[index];
          const result = results?.[index];
          const isSelected = active && index === activeSkillIndex;
          const skillInputs = selected
            ? dynamicInputsForSkill(selected, { includeStatusEffects: true })
            : [];
          const traitInputs =
            selected
              ? [
                  ...(trait?.inputs?.filter(
                    (input) => input.scope === "skill",
                  ) ??
                    (trait?.conditionKey
                      ? [{
                          defaultValue: false,
                          key: trait.conditionKey,
                          label: trait.conditionLabel,
                          scope: "skill",
                          type: "boolean",
                        }]
                      : [])),
                  ...(defenseTrait?.inputs?.filter(
                    (input) => input.scope === "skill",
                  ) ?? []),
                ]
              : [];
          const dynamicInputs = [
            ...skillInputs,
            ...traitInputs.filter(
              (traitInput) =>
                !skillInputs.some((input) => input.key === traitInput.key),
            ),
          ];
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
                    ? `${selected.type}·${CATEGORY_LABELS[selected.category]?.slice(0, 1) ?? "—"}`
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
                    selected?.slotPowerOverride ??
                    result?.skillPower ??
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
                    max="20"
                    min="1"
                    onChange={(event) =>
                      onSkillHitCountChange?.(
                        side,
                        index,
                        Math.min(
                          20,
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
              {selected?.description || dynamicInputs.length > 0 ? (
                <div className="skill-slot__context">
                  {selected?.description ? (
                    <p title={selected.description}>{selected.description}</p>
                  ) : null}
                  {dynamicInputs
                    .filter(
                      (input) =>
                        (input.key !== "attackerHpPercent" || !health) &&
                        (input.key !== "defenderHpPercent" || !opponentHealth),
                    )
                    .filter((input) =>
                      isDynamicInputVisible(
                        input,
                        selected?.slotContext,
                      ),
                    )
                    .map((input) =>
                    input.type === "choice" ? (
                      <label key={input.key}>
                        <span className="sr-only">{input.label}</span>
                        <select
                          aria-label={`${label}技能${index + 1}${input.label}`}
                          onChange={(event) =>
                            onSkillContextChange?.(
                              side,
                              index,
                              input.key,
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
                      <label key={input.key}>
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
                              input.key,
                              event.target.checked,
                            )
                          }
                          onFocus={() => onSkillFocus?.(side, index)}
                          type="checkbox"
                        />
                        {input.label}
                      </label>
                    ) : (
                      <label key={input.key}>
                        <span>{input.label}</span>
                        <input
                          aria-label={`${label}技能${index + 1}${input.label}`}
                          max={input.max}
                          min={input.min}
                          onChange={(event) =>
                            onSkillContextChange?.(
                              side,
                              index,
                              input.key,
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
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function FourSkillEditor({
  activeSide = "attacker",
  activeSkillIndex = 0,
  attackerHealth,
  attackerHitCount = 1,
  attackerName,
  attackerResults = [],
  attackerSkillChoices,
  attackerSkills,
  attackerTrait,
  attackerTraitContext = {},
  attackerDefenseTrait,
  defenderHitCount = 1,
  defenderName,
  defenderResults = [],
  defenderSkillChoices,
  defenderSkills,
  defenderTrait,
  defenderTraitContext = {},
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
      trait: attackerTrait,
      defenseTrait: attackerDefenseTrait,
      traitContext: attackerTraitContext,
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
      trait: defenderTrait,
      defenseTrait: defenderDefenseTrait,
      traitContext: defenderTraitContext,
    },
  };

  function renderSide(side) {
    return (
      <SkillSide
        {...sideProps[side]}
        active={activeSide === side}
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
