import { CaretDown, SlidersHorizontal } from "@phosphor-icons/react";
import { useState } from "react";
import {
  MARK_DEFINITIONS,
  markDefinition,
} from "../domain/marks.js";

function numericValue(value, fallback = 0) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function displayNumber(value, digits = 4) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "—";
  return Number(numeric.toFixed(digits)).toString();
}

function displayDamageCoefficient(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "—";
  const numerator = numeric * 41;
  const roundedNumerator = Math.round(numerator);
  const displayedNumerator =
    Math.abs(numerator - roundedNumerator) < 0.00001
      ? roundedNumerator
      : displayNumber(numerator, 6);
  return `${displayedNumerator}/41`;
}

function stepByLabel(result, label) {
  return result?.formulaSteps?.find((step) => step.label === label);
}

const ATTACK_STAT_LABELS = {
  magicalAttack: "魔攻",
  physicalAttack: "物攻",
};

export function buildFormulaAudit(result) {
  if (!result || result.status !== "exact") return null;

  const attackPanel = stepByLabel(result, "攻击面板");
  const basePower = stepByLabel(result, "基础威力");
  const fixedPower = stepByLabel(result, "固定威力增加");
  const markFixedPower = stepByLabel(result, "印记固定威力");
  const traitFixedPower = stepByLabel(result, "特性固定威力");
  const percentPower = stepByLabel(result, "技能威力百分比");
  const sameType = stepByLabel(result, "本系");
  const type = stepByLabel(result, "属性克制");
  const weather = stepByLabel(result, "天气");
  const levels = stepByLabel(result, "攻防等级");
  const other = stepByLabel(result, "其他威力乘区");
  const displayPower = stepByLabel(result, "显示威力");
  const damage = stepByLabel(result, "等级系数与攻防比");
  const settlement = stepByLabel(result, "减伤、连击与最终倍率");
  const additional = stepByLabel(result, "星陨追加伤害");
  const damageInput = damage?.input ?? {};
  const settlementInput = settlement?.input ?? {};

  const powerFactors = [
    { label: "本系", value: sameType?.input },
    { label: "克制", value: type ? type.after / type.before : 1 },
    {
      label: weather?.input?.weather ?? "天气",
      value: weather?.input?.multiplier,
    },
    { label: "能力等级", value: levels?.input },
    { label: "其他", value: other?.input },
  ].filter((item) => Number.isFinite(Number(item.value)));

  const percentAdds = Array.isArray(percentPower?.input)
    ? percentPower.input.reduce((sum, value) => sum + (Number(value) || 0), 0)
    : 0;
  const hitCount = Math.max(
    1,
    Math.floor(Number(settlementInput.hitCount ?? result.hitCount) || 1),
  );
  const additionalDamage = Number(result.additionalDamage) || 0;
  const traitDamage = Number(result.traitDamage) || 0;

  return {
    skillName: result.skillName,
    attackLabel: ATTACK_STAT_LABELS[attackPanel?.input] ?? "攻击",
    defenseLabel:
      attackPanel?.input === "magicalAttack" ? "魔防" : "物防",
    power: {
      base: basePower?.before ?? basePower?.input,
      conditional: basePower?.after,
      fixed: Number(fixedPower?.input) || 0,
      markFixed: Number(markFixedPower?.input) || 0,
      traitFixed: Number(traitFixedPower?.input) || 0,
      percentAdds,
      effective: sameType?.before ?? displayPower?.before,
    },
    formulaPower: {
      factors: powerFactors,
      internal: damageInput.calculationPower ?? displayPower?.before,
      displayed: damageInput.displayedPower ?? result.effectivePower,
    },
    numerator: {
      attack: damageInput.attackerStat,
      power: damageInput.calculationPower ?? displayPower?.before,
      coefficient: damageInput.coefficient,
      beforeRound: damageInput.unroundedNumerator ?? damage?.before,
      afterRound: damageInput.roundedNumerator,
    },
    oneHit: {
      numerator: damageInput.roundedNumerator,
      defense: damageInput.defenderDefense,
      reduction: damageInput.damageReductionMultiplier ?? 1,
      beforeFloor: damageInput.unroundedOneHit,
      afterFloor: damage?.after,
    },
    total: {
      oneHit: damage?.after,
      finalMultiplier: settlementInput.finalDamageMultiplier ?? 1,
      oneHitAfterFinal:
        settlementInput.oneHitAfterFinal ?? settlement?.before,
      hitCount,
      additionalDamage,
      traitDamage,
      value: result.totalDamage,
    },
    weather:
      weather?.input?.remainingTurns > 0 &&
      Number(weather?.input?.multiplier) !== 1
        ? {
            multiplier: weather.input.multiplier,
            remainingTurns: weather.input.remainingTurns,
          }
        : null,
    additional,
  };
}

function AuditChip({ label, muted = false, tone = "neutral", value }) {
  return (
    <span
      className="formula-audit__chip"
      data-muted={muted ? "true" : undefined}
      data-tone={tone}
    >
      <small>{label}</small>
      {value}
    </span>
  );
}

function FormulaRow({ children, title, tone }) {
  return (
    <div className="formula-audit__row" data-tone={tone}>
      <strong>{title}</strong>
      <div className="formula-audit__expression">{children}</div>
    </div>
  );
}

function Operator({ children }) {
  return <span className="formula-audit__operator">{children}</span>;
}

export function FormulaAudit({ result }) {
  const audit = buildFormulaAudit(result);
  if (!audit) {
    return (
      <section className="formula-audit">
        <header>
          <strong>伤害计算过程</strong>
          <span>{result?.reason ?? "选择技能后显示"}</span>
        </header>
      </section>
    );
  }

  const power = audit.power;
  const numerator = audit.numerator;
  const oneHit = audit.oneHit;
  const total = audit.total;

  return (
    <section className="formula-audit">
      <header>
        <strong>伤害计算过程</strong>
        <span>{audit.skillName}</span>
      </header>

      <FormulaRow title="技能威力" tone="power">
        {Number.isFinite(Number(power.base)) ? (
          <AuditChip label="基础" tone="power" value={displayNumber(power.base)} />
        ) : (
          <AuditChip label="规则值" tone="power" value={displayNumber(power.effective)} />
        )}
        {Number.isFinite(Number(power.conditional)) &&
        Number(power.conditional) !== Number(power.base) ? (
          <>
            <Operator>→</Operator>
            <AuditChip label="条件后" tone="power" value={displayNumber(power.conditional)} />
          </>
        ) : null}
        {[
          ["技能固定", power.fixed],
          ["印记固定", power.markFixed],
          ["特性固定", power.traitFixed],
        ].map(([label, value]) =>
          Number(value) !== 0 ? (
            <span className="formula-audit__term" key={label}>
              <Operator>{Number(value) > 0 ? "+" : "−"}</Operator>
              <AuditChip label={label} tone="power" value={displayNumber(Math.abs(value))} />
            </span>
          ) : null,
        )}
        {power.percentAdds !== 0 ? (
          <>
            <Operator>×</Operator>
            <AuditChip
              label="威力加成"
              tone="power"
              value={displayNumber(1 + power.percentAdds)}
            />
          </>
        ) : null}
        <Operator>=</Operator>
        <AuditChip label="结果" tone="result" value={displayNumber(power.effective)} />
      </FormulaRow>

      <FormulaRow title="显示威力" tone="display">
        <AuditChip label="技能" tone="display" value={displayNumber(power.effective)} />
        {audit.formulaPower.factors
          .filter((factor) => Math.abs(Number(factor.value) - 1) > 1e-10)
          .map((factor) => (
            <span className="formula-audit__term" key={factor.label}>
              <Operator>×</Operator>
            <AuditChip
              label={factor.label}
              tone="display"
              value={displayNumber(factor.value)}
            />
            </span>
          ))}
        <Operator>=</Operator>
        <AuditChip label="公式值" tone="display" value={displayNumber(audit.formulaPower.internal)} />
        <Operator>→</Operator>
        <span className="formula-audit__rounding">四舍五入</span>
        <AuditChip label="界面值" tone="result" value={displayNumber(audit.formulaPower.displayed)} />
      </FormulaRow>

      <FormulaRow title="每段伤害" tone="one-hit">
        <AuditChip label={audit.attackLabel} tone="one-hit" value={displayNumber(numerator.attack)} />
        <Operator>×</Operator>
        <AuditChip label="威力" tone="one-hit" value={displayNumber(numerator.power)} />
        <Operator>×</Operator>
        <AuditChip label="等级系数" tone="one-hit" value={displayDamageCoefficient(numerator.coefficient)} />
        <Operator>→</Operator>
        <span className="formula-audit__rounding">四舍五入</span>
        <AuditChip label="伤害分子" tone="one-hit" value={displayNumber(numerator.afterRound)} />
        <Operator>÷</Operator>
        <AuditChip label={audit.defenseLabel} tone="one-hit" value={displayNumber(oneHit.defense)} />
        {Number(oneHit.reduction) !== 1 ? (
          <>
            <Operator>×</Operator>
            <AuditChip label="伤害保留" tone="one-hit" value={displayNumber(oneHit.reduction)} />
          </>
        ) : null}
        <Operator>→</Operator>
        <span className="formula-audit__rounding">向下取整</span>
        <AuditChip label="结果" tone="result" value={displayNumber(oneHit.afterFloor)} />
      </FormulaRow>

      <FormulaRow title="总伤害" tone="total">
        <AuditChip label="每段" tone="total" value={displayNumber(oneHit.afterFloor)} />
        {Number(total.finalMultiplier) !== 1 ? (
          <>
            <Operator>×</Operator>
            <AuditChip label="最终倍率" tone="total" value={displayNumber(total.finalMultiplier)} />
            <Operator>→</Operator>
            <span className="formula-audit__rounding">向下取整</span>
            <AuditChip label="结算后每段" tone="total" value={displayNumber(total.oneHitAfterFinal)} />
          </>
        ) : null}
        {total.hitCount > 1 ? (
          <>
            <Operator>×</Operator>
            <AuditChip label="段数" tone="total" value={total.hitCount} />
          </>
        ) : null}
        {total.additionalDamage > 0 ? (
          <>
            <Operator>+</Operator>
            <AuditChip label="星陨追加" tone="total" value={displayNumber(total.additionalDamage)} />
          </>
        ) : null}
        {total.traitDamage > 0 ? (
          <>
            <Operator>+</Operator>
            <AuditChip
              label="戏耍真伤"
              tone="total"
              value={displayNumber(total.traitDamage)}
            />
          </>
        ) : null}
        <Operator>=</Operator>
        <AuditChip label="结果" tone="result" value={displayNumber(total.value)} />
      </FormulaRow>
    </section>
  );
}

function MarkSlot({
  label,
  onChange,
  polarity,
  sideLabel,
  value,
}) {
  const selected = markDefinition(value?.id);
  const stacks = selected ? Math.max(0, Number(value?.stacks) || 0) : 0;
  const stackLabel = selected
    ? `${sideLabel}${selected.name}层数`
    : `${sideLabel}${label}层数`;

  return (
    <div className="mark-slot">
      <label>
        <span>{label}</span>
        <select
          aria-label={`${sideLabel}${label}印记`}
          onChange={(event) =>
            onChange({
              id: event.target.value || null,
              stacks: event.target.value ? Math.max(1, stacks) : 0,
            })
          }
          value={value?.id ?? ""}
        >
          <option value="">无</option>
          {MARK_DEFINITIONS[polarity].map((mark) => (
            <option key={mark.id} value={mark.id}>
              {mark.name}
            </option>
          ))}
        </select>
      </label>
      <label className="mark-slot__stacks">
        <span>层</span>
        <input
          aria-label={stackLabel}
          disabled={!selected}
          max="99"
          min="0"
          onChange={(event) =>
            onChange({
              id: value?.id ?? null,
              stacks: Math.min(
                99,
                Math.max(0, Math.floor(numericValue(event.target.value))),
              ),
            })
          }
          step="1"
          type="number"
          value={stacks}
        />
      </label>
      <small>{selected?.summary ?? "未设置"}</small>
    </div>
  );
}

function SideMarks({ label, marks, onChange, side, tone }) {
  return (
    <fieldset
      aria-label={`${label}印记`}
      className="mark-side"
      data-tone={tone}
    >
      <legend>{label}印记</legend>
      <MarkSlot
        label="正面"
        onChange={(value) => onChange(side, "positive", value)}
        polarity="positive"
        sideLabel={label}
        value={marks?.positive}
      />
      <MarkSlot
        label="负面"
        onChange={(value) => onChange(side, "negative", value)}
        polarity="negative"
        sideLabel={label}
        value={marks?.negative}
      />
    </fieldset>
  );
}

export function AdvancedOptions({
  finalMultiplier,
  marks,
  onFinalMultiplierChange,
  onMarkChange,
  onRainTurnsChange,
  onReductionChange,
  rainTurns,
  reductionPercent,
  result,
}) {
  const [open, setOpen] = useState(false);

  return (
    <section className={`advanced-options${open ? " is-open" : ""}`}>
      <button
        aria-expanded={open}
        className="advanced-options__toggle"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <span>
          <SlidersHorizontal aria-hidden="true" size={19} />
          高级选项
        </span>
        <CaretDown aria-hidden="true" size={16} weight="bold" />
      </button>

      {open ? (
        <div className="advanced-options__content">
          <label className="field-group">
            <span>防御技能减伤</span>
            <span className="input-with-unit">
              <input
                aria-label="防御技能减伤"
                max="100"
                min="0"
                onChange={(event) => onReductionChange(numericValue(event.target.value))}
                type="number"
                value={reductionPercent}
              />
              <span>%</span>
            </span>
          </label>
          <div className="mark-config">
            <SideMarks
              label="进攻方"
              marks={marks?.attacker}
              onChange={onMarkChange}
              side="attacker"
              tone="attack"
            />
            <SideMarks
              label="防御方"
              marks={marks?.defender}
              onChange={onMarkChange}
              side="defender"
              tone="defense"
            />
          </div>
          <label className="field-group">
            <span>天气</span>
            <span className="weather-toggle">
              <input
                aria-label="雨天"
                checked={rainTurns > 0}
                onChange={(event) =>
                  onRainTurnsChange(event.target.checked ? 8 : 0)
                }
                type="checkbox"
              />
              <span>雨天</span>
              <small>水系 ×1.75</small>
            </span>
          </label>
          <label className="field-group">
            <span>最终伤害倍率</span>
            <input
              aria-label="最终伤害倍率"
              min="0"
              onChange={(event) => onFinalMultiplierChange(numericValue(event.target.value, 1))}
              step="0.05"
              type="number"
              value={finalMultiplier}
            />
          </label>
          <FormulaAudit result={result} />
        </div>
      ) : null}
    </section>
  );
}
