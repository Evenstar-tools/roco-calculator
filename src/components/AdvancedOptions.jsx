import { gainLabels, gainTermLabel, sourceLabel } from "../domain/gain-provenance.js";
import { CaretDown, SlidersHorizontal } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { StatusHelpButton, StatusReference } from "./StatusReference.jsx";
import {
  MARK_DEFINITIONS,
  markDefinition,
} from "../domain/marks.js";
import {
  BLOODLINE_MAGIC_OPTIONS,
  getBloodlineMagicOption,
} from "../domain/bloodline-magic.js";
import {
  NEGATIVE_STATUS_DEFINITIONS,
  NEGATIVE_STATUS_KEYS,
  normalizeNegativeStatusSide,
} from "../domain/negative-status.js";

function numericValue(value, fallback = 0) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function displayNumber(value, digits = 4) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "—";
  return Number(numeric.toFixed(digits)).toString();
}

function greatestCommonDivisor(left, right) {
  let a = Math.abs(left);
  let b = Math.abs(right);
  while (b !== 0) {
    [a, b] = [b, a % b];
  }
  return a || 1;
}

function displayLevelCoefficient(coefficient, level = 60) {
  const numericCoefficient = Number(coefficient);
  const numericLevel = Number(level);
  if (!Number.isFinite(numericCoefficient)) return "—";
  if (!Number.isInteger(numericLevel)) {
    return displayNumber(numericCoefficient, 6);
  }

  const numerator = numericLevel * 9 + 200;
  const denominator = 820;
  if (Math.abs(numericCoefficient - numerator / denominator) > 0.0000005) {
    return displayNumber(numericCoefficient, 6);
  }

  const divisor = greatestCommonDivisor(numerator, denominator);
  return `${numerator / divisor}/${denominator / divisor}`;
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
  const manualPower = stepByLabel(result, "手动显示威力") ?? stepByLabel(result, "手动静态威力");
  const fixedPower = stepByLabel(result, "固定威力增加");
  const traitFixedPower = stepByLabel(result, "特性固定威力");
  const percentPower = stepByLabel(result, "技能威力百分比") ?? stepByLabel(result, "外部威力加成");
  const sameType = stepByLabel(result, "本系");
  const type = stepByLabel(result, "属性克制");
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
    { label: "克制倍率", value: type?.before ? type.after / type.before : 1 },
    { label: "能力等级", value: levels?.input },
    { label: "其他", value: other?.input },
  ].filter((item) => Number.isFinite(Number(item.value)));

  const primaryPower = basePower ?? manualPower ?? stepByLabel(result, "继承显示威力");
  const primaryIndex = result.formulaSteps?.indexOf(primaryPower) ?? -1;
  const percentIndex = result.formulaSteps?.indexOf(percentPower) ?? -1;
  const fixedSteps = (primaryIndex < 0 ? [] : result.formulaSteps ?? [])
    .slice(primaryIndex + 1, percentIndex < 0 ? undefined : percentIndex)
    .filter((step) => /固定威力|血脉/u.test(step.label) || (
      percentIndex >= 0 && Number.isFinite(Number(step.before)) && Number.isFinite(Number(step.after))
    ))
    .map((step) => ({
      label: step.label,
      amount: Number.isFinite(Number(step.before)) && Number.isFinite(Number(step.after))
        ? Number(step.after) - Number(step.before)
        : Number(step.input) || 0,
    }))
    .filter(({ amount }) => amount !== 0);
  const hasPercentStep = Number.isFinite(Number(percentPower?.before)) &&
    Number.isFinite(Number(percentPower?.after)) && Array.isArray(percentPower?.input);
  const effectivePercentAdds = hasPercentStep
    ? percentPower.input.reduce((sum, value) => sum + (Number(value) || 0), 0)
    : 0;
  const percentRaw = hasPercentStep ? percentPower.before * (1 + effectivePercentAdds) : null;
  const hitCount = Math.max(
    1,
    Math.floor(Number(settlementInput.hitCount ?? result.hitCount) || 1),
  );
  const additionalDamage = Number(result.additionalDamage) || 0;
  const reassemblyDamage = Number(result.reassemblyDamage) || 0;
  const traitDamage = Number(result.traitDamage) || 0;

  return {
    skillName: result.skillName,
    attackLabel: ATTACK_STAT_LABELS[attackPanel?.input] ?? "攻击",
    defenseLabel:
      attackPanel?.input === "magicalAttack" ? "魔防" : "物防",
    power: {
      manual: stepByLabel(result, "手动静态威力")?.label,
      manualPanel: stepByLabel(result, "手动显示威力")?.label,
      staticIsSummary: Boolean(stepByLabel(result, "手动显示威力") && !basePower),
      base: primaryPower?.before ?? primaryPower?.input,
      conditional: primaryPower?.after,
      fixed: Number(fixedPower?.input) || 0,
      inheritedBurstFixed:
        Number(result.staticPowerSourceAdds?.inheritedBurst) || 0,
      markFixed: Number(result.staticPowerSourceAdds?.mark) || 0,
      traitFixed: Number(traitFixedPower?.input) || 0,
      static: result.staticPower ?? sameType?.before ?? displayPower?.before ?? manualPower?.after,
      effective: sameType?.before ?? displayPower?.before ?? manualPower?.after,
      fixedSteps: stepByLabel(result, "手动显示威力") ? [] : fixedSteps,
      percentBefore: percentPower?.before,
      percentAfter: percentPower?.after,
      percentInputs: percentPower?.input ?? [],
      percentAdds: effectivePercentAdds,
      percentRaw: hasPercentStep && Math.floor(percentRaw) === Number(percentPower.after) ? percentRaw : null,
      hasPercentStep,
      hasPrimary: primaryIndex >= 0,
    },
    formulaPower: {
      factors: powerFactors,
      internal: displayPower?.before ?? manualPower?.after ?? damageInput.calculationPower,
      displayed: damageInput.displayedPower ?? displayPower?.after ?? result.displayPower ?? result.effectivePower,
    },
    numerator: {
      attack: damageInput.attackerStat,
      power: damageInput.calculationPower ?? displayPower?.before,
      coefficient: damageInput.coefficient,
      level: damageInput.level,
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
      reassemblyDamage,
      traitDamage,
      value: result.totalDamage,
    },
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

function powerPercentExpression(power, sources = []) {
  const namedTotal = sources.reduce((sum, source) => sum + Number(source.amount), 0);
  const terms = Math.abs(namedTotal - power.percentAdds) < 1e-8
    ? sources
    : power.percentInputs.map((amount) => ({ amount: Number(amount), name: "" }));
  return `（1${terms.filter((source) => source.amount !== 0).map((source) =>
    ` ${source.amount < 0 ? "−" : "+"} ${displayNumber(Math.abs(source.amount) * 100)}%${source.name ? `（${sourceLabel(source)}）` : ""}`
  ).join("")}）`;
}

function fixedPowerLabel(step, gains) {
  const sources = step.label === "固定威力增加" ? gains.fixed
    : step.label === "特性固定威力" ? gains.traitFixed : null;
  if (sources?.length && Math.abs(sources.reduce((sum, source) => sum + source.amount, 0) - step.amount) < 1e-8) {
    return gainLabels(sources);
  }
  return step.label;
}

export function FormulaAudit({ result }) {
  if (result?.sourceKind === "bloodline") {
    const healingStep = result.formulaSteps?.find(
      (step) => step.label === "血脉魔法回复",
    );
    const endTurnStep = result.formulaSteps?.find(
      (step) => step.label === "血脉魔法后续回复",
    );
    const traitStep = result.formulaSteps?.find(
      (step) => step.label === "戏耍特性伤害",
    );
    const endTurnTicks =
      Number(endTurnStep?.input?.ticks) ||
      (Number(endTurnStep?.before) > 0
        ? Math.round(Number(endTurnStep.after) / Number(endTurnStep.before))
        : 3);
    const actualHealing = Number(traitStep?.input?.actualHealing) || 0;
    const requestedHealing = Number(traitStep?.input?.requestedHealing) || 0;

    return (
      <section className="formula-audit">
        <header>
          <strong>伤害计算过程</strong>
          <span>{result.skillName}</span>
        </header>
        <FormulaRow title="光合治愈" tone="power">
          <AuditChip
            label="最大生命 × 15%（立即）"
            tone="power"
            value={displayNumber(healingStep?.after ?? requestedHealing)}
          />
          <Operator>→</Operator>
          <AuditChip
            label="实际回复"
            tone="result"
            value={displayNumber(actualHealing)}
          />
        </FormulaRow>
        {endTurnStep ? (
          <FormulaRow title="后续回复" tone="power">
            <AuditChip
              label="每回合结束回复"
              tone="power"
              value={displayNumber(endTurnStep.before)}
            />
            <Operator>×</Operator>
            <AuditChip
              label="回合数"
              tone="power"
              value={displayNumber(endTurnTicks)}
            />
            <Operator>=</Operator>
            <AuditChip
              label="名义合计（未扣溢出）"
              tone="result"
              value={displayNumber(endTurnStep.after)}
            />
          </FormulaRow>
        ) : null}
        <FormulaRow title="戏耍真伤" tone="total">
          <AuditChip label="实际回复" tone="total" value={displayNumber(actualHealing)} />
          <Operator>=</Operator>
          <AuditChip label="结果" tone="result" value={displayNumber(result.totalDamage)} />
        </FormulaRow>
      </section>
    );
  }

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
  const gains = result.gainSources ?? {};
  const percentSources = [...(power.manual ? [] : gains.staticPercent ?? []), ...(gains.powerPercent ?? [])];
  const factors = audit.formulaPower.factors.filter((factor) => Math.abs(Number(factor.value) - 1) > 1e-10);
  const expandPower = !power.manualPanel && (Number.isFinite(Number(power.conditional)) && Number(power.conditional) !== Number(power.base) || power.fixedSteps.length > 0 || (
    power.hasPercentStep && (power.percentAdds !== 0 || Number(power.percentBefore) !== Number(power.percentAfter))
  ));
  const simpleDisplay = power.manualPanel || (!expandPower && factors.length === 0 &&
    Number(power.effective) === Number(audit.formulaPower.displayed));
  const simpleTotal = Number(total.finalMultiplier) === 1 && total.hitCount === 1 &&
    total.additionalDamage === 0 && total.reassemblyDamage === 0 && total.traitDamage === 0;
  const recordedPower = Number(power.conditional ?? power.base ?? power.percentBefore) +
    power.fixedSteps.reduce((sum, step) => sum + step.amount, 0);
  const powerChainMatches = Math.abs(recordedPower - Number(power.hasPercentStep ? power.percentBefore : power.effective)) < 1e-8;
  const expandedPowerIsFinal = expandPower && factors.length === 0 &&
    Number(power.hasPercentStep ? power.percentAfter : power.effective) === Number(audit.formulaPower.displayed) &&
    Number(audit.formulaPower.internal) === Number(audit.formulaPower.displayed);

  return (
    <section className="formula-audit">
      <header>
        <strong>伤害计算过程</strong>
        <span>{audit.skillName}</span>
      </header>

      <FormulaRow title="静态威力" tone="power">
        <AuditChip label={power.manual ? "手动" : "技能"} tone="power" value={displayNumber(power.static)} />
      </FormulaRow>

      <FormulaRow title="显示威力" tone="display">
        {simpleDisplay ? (
          <AuditChip label={power.manualPanel ? "手动" : "自动"} tone="result" value={displayNumber(audit.formulaPower.displayed)} />
        ) : <>
        {expandPower ? <>
          <AuditChip label={power.manual ? "手动静态" : power.hasPrimary ? "基础" : "加成基数"} tone="display" value={displayNumber(power.base ?? power.percentBefore)} />
          {Number.isFinite(Number(power.conditional)) && Number(power.conditional) !== Number(power.base) ? <>
            <Operator>→</Operator>
            <AuditChip label={gainTermLabel("条件后", gains.condition)} tone="display" value={displayNumber(power.conditional)} />
          </> : null}
          {power.fixedSteps.map((step, index) => <span className="formula-audit__term" key={`${step.label}-${index}`}>
            <Operator>{step.amount < 0 ? "−" : "+"}</Operator>
            <AuditChip label={fixedPowerLabel(step, gains)} tone="display" value={displayNumber(Math.abs(step.amount))} />
          </span>)}
          {power.hasPercentStep && power.percentAdds !== 0 ? <>
            {power.fixedSteps.length || !powerChainMatches ? <>
              <Operator>{powerChainMatches ? "=" : "→"}</Operator>
              <AuditChip label="加成基数" tone="display" value={displayNumber(power.percentBefore)} />
            </> : null}
            <Operator>×</Operator>
            <AuditChip label="同区加成" tone="display" value={powerPercentExpression(power, percentSources)} />
          </> : null}
          {power.percentRaw !== null && Number(power.percentRaw) !== Number(power.percentAfter) ? <>
            <Operator>=</Operator>
            <AuditChip label="未取整" tone="display" value={displayNumber(power.percentRaw)} />
          </> : null}
          {power.hasPercentStep ? <>
            <Operator>→</Operator>
            <span className="formula-audit__rounding">向下取整</span>
            <AuditChip label={expandedPowerIsFinal ? "显示威力" : "加成后威力"} tone={expandedPowerIsFinal ? "result" : "display"} value={displayNumber(power.percentAfter)} />
          </> : <>
            <Operator>{powerChainMatches ? "=" : "→"}</Operator>
            <AuditChip label={expandedPowerIsFinal ? "显示威力" : "加成后威力"} tone={expandedPowerIsFinal ? "result" : "display"} value={displayNumber(power.effective)} />
          </>}
        </> : <AuditChip label="加成后威力" tone="display" value={displayNumber(power.effective)} />}
        {factors.map((factor) => (
            <span className="formula-audit__term" key={factor.label}>
              <Operator>×</Operator>
            <AuditChip
              label={factor.label}
              tone="display"
              value={displayNumber(factor.value)}
            />
            </span>
          ))}
        {!expandedPowerIsFinal && <>
        {Number(audit.formulaPower.internal) !== Number(audit.formulaPower.displayed) ? <>
          <Operator>=</Operator>
          <AuditChip label="未取整" tone="display" value={displayNumber(audit.formulaPower.internal)} />
          <Operator>→</Operator>
          <span className="formula-audit__rounding">向下取整</span>
        </> : <Operator>=</Operator>}
        <AuditChip label="显示威力" tone="result" value={displayNumber(audit.formulaPower.displayed)} />
        </>}
        </>}
      </FormulaRow>

      <FormulaRow title="每段伤害" tone="one-hit">
        <AuditChip label={gainTermLabel(audit.attackLabel, gains.attack, "层")} tone="one-hit" value={displayNumber(numerator.attack)} />
        <Operator>×</Operator>
        <AuditChip label="威力" tone="one-hit" value={displayNumber(numerator.power)} />
        <Operator>×</Operator>
        <AuditChip
          label="等级系数"
          tone="one-hit"
          value={displayLevelCoefficient(numerator.coefficient, numerator.level)}
        />
        <Operator>→</Operator>
        <span className="formula-audit__rounding">四舍五入</span>
        <AuditChip label="伤害分子" tone="one-hit" value={displayNumber(numerator.afterRound)} />
        <Operator>÷</Operator>
        <AuditChip label={gainTermLabel(audit.defenseLabel, gains.defense, "层")} tone="one-hit" value={displayNumber(oneHit.defense)} />
        {Number(oneHit.reduction) !== 1 ? (
          <>
            <Operator>×</Operator>
            <AuditChip label={gainLabels(gains.reduction) || "伤害保留"} tone="one-hit" value={displayNumber(oneHit.reduction)} />
          </>
        ) : null}
        <Operator>→</Operator>
        <span className="formula-audit__rounding">向下取整</span>
        <AuditChip label="结果" tone="result" value={displayNumber(oneHit.afterFloor)} />
      </FormulaRow>

      <FormulaRow title="总伤害" tone="total">
        {simpleTotal ? <AuditChip label="1段" tone="result" value={displayNumber(total.value)} /> : <>
        <AuditChip label="每段" tone="total" value={displayNumber(oneHit.afterFloor)} />
        {Number(total.finalMultiplier) !== 1 ? (
          <>
            <Operator>×</Operator>
            <AuditChip label={gainLabels(gains.final) || "最终倍率"} tone="total" value={displayNumber(total.finalMultiplier)} />
            <Operator>→</Operator>
            <span className="formula-audit__rounding">向下取整</span>
            <AuditChip label="结算后每段" tone="total" value={displayNumber(total.oneHitAfterFinal)} />
          </>
        ) : null}
        {total.hitCount > 1 ? (
          <>
            <Operator>×</Operator>
            <AuditChip label={gainTermLabel(gainTermLabel("段数", gains.hits), (gains.hitPercent ?? []).map((source) => ({ ...source, amount: source.amount * 100 })), "%")} tone="total" value={total.hitCount} />
          </>
        ) : null}
        {total.additionalDamage > 0 ? (
          <>
            <Operator>+</Operator>
            <AuditChip label="星陨追加" tone="total" value={displayNumber(total.additionalDamage)} />
          </>
        ) : null}
        {total.reassemblyDamage > 0 ? (
          <>
            <Operator>+</Operator>
            <AuditChip
              label="重组追加"
              tone="total"
              value={displayNumber(total.reassemblyDamage)}
            />
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
        </>}
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
  const dragonBite = selected?.id === "dragon-bite";
  const triggerCount = Math.min(99, Math.max(0, Math.floor(Number(value?.triggerCount) || 0)));
  const changeTriggers = (count) => onChange({
    ...value,
    triggerCount: Math.min(99, Math.max(0, Math.floor(numericValue(count)))),
  });
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
              ...value,
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
      {dragonBite ? (
        <div className="mark-slot__triggers">
          <label htmlFor={`${sideLabel}-dragon-bite-triggers`}>已触发次数</label>
          <div className="mark-trigger-stepper">
            <button type="button" aria-label={`${sideLabel}减少龙噬触发次数`}
              disabled={stacks === 0 || triggerCount === 0} onClick={() => changeTriggers(triggerCount - 1)}>−</button>
            <input id={`${sideLabel}-dragon-bite-triggers`} aria-label={`${sideLabel}龙噬触发次数`}
              type="number" min="0" max="99" step="1" value={triggerCount} disabled={stacks === 0}
              onChange={(event) => changeTriggers(event.target.value)} />
            <button type="button" aria-label={`${sideLabel}增加龙噬触发次数`}
              disabled={stacks === 0 || triggerCount === 99} onClick={() => changeTriggers(triggerCount + 1)}>+</button>
          </div>
          <span>双攻 +{stacks > 0 ? triggerCount * 40 : 0}%</span>
        </div>
      ) : null}
      <small>{selected?.summary ?? "未设置"}</small>
    </div>
  );
}

function SideMarks({ label, marks, onChange, onHelp, side, tone }) {
  return (
    <fieldset
      aria-label={`${label}印记`}
      className="mark-side"
      data-tone={tone}
    >
      <legend>{label}印记<StatusHelpButton label={`查看${label}印记说明`} onClick={onHelp} /></legend>
      <div className="mark-side__fields">
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
      </div>
    </fieldset>
  );
}

function NegativeStatusSide({ label, onChange, side, value }) {
  const normalized = normalizeNegativeStatusSide(value);
  return (
    <fieldset className="negative-status-side">
      <legend>{label}</legend>
      <div className="negative-status-side__grid">
        {NEGATIVE_STATUS_KEYS.map((key) => (
          <label key={key}>
            <span>{NEGATIVE_STATUS_DEFINITIONS[key].label}</span>
            <span className="negative-status-stepper">
              <button
                aria-label={`${label}${NEGATIVE_STATUS_DEFINITIONS[key].label}减一层`}
                disabled={normalized[key] <= 0}
                onClick={() => onChange(side, key, normalized[key] - 1)}
                type="button"
              >
                −
              </button>
              <input
                aria-label={`${label}${NEGATIVE_STATUS_DEFINITIONS[key].label}层数`}
                max={key === "electrified" ? "2" : "99"}
                min="0"
                onChange={(event) => onChange(side, key, event.target.value)}
                type="number"
                value={normalized[key]}
              />
              <button
                aria-label={`${label}${NEGATIVE_STATUS_DEFINITIONS[key].label}加一层`}
                disabled={normalized[key] >= (key === "electrified" ? 2 : 99)}
                onClick={() => onChange(side, key, normalized[key] + 1)}
                type="button"
              >
                +
              </button>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function AdvancedOptions({
  bloodlineMagicId = "none",
  bloodlineMagicTriggered = false,
  finalMultiplier,
  marks,
  negativeStatusEnabled = false,
  negativeStatuses,
  locateAdvancedTopRequest = null,
  onBloodlineMagicChange = () => {},
  onAdvancedTopLocated = () => {},
  onFinalMultiplierChange,
  onMarkChange,
  onNegativeStatusChange = () => {},
  onOpenChange,
  onWeatherChange = () => {},
  onReductionChange,
  rainTurns,
  reductionPercent,
  result,
  weather = rainTurns > 0 ? "rain" : "none",
  open: controlledOpen,
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [referenceGroup, setReferenceGroup] = useState(null);
  const advancedOptionsRef = useRef(null);
  const advancedToggleRef = useRef(null);
  const consumedAdvancedTopRequestRef = useRef(null);
  const open = controlledOpen ?? internalOpen;
  const bloodlineMagic = getBloodlineMagicOption(bloodlineMagicId);
  const conditions = [];
  const weatherLabel = { rain: "雨天", thunder: "雷鸣", sandstorm: "沙暴", blizzard: "暴风雪" }[weather];
  if (weatherLabel) conditions.push(weatherLabel);
  if (reductionPercent > 0) conditions.push(`减伤 ${reductionPercent}%`);
  if (finalMultiplier != null && Number(finalMultiplier) !== 1) conditions.push(`伤害 ×${finalMultiplier}`);
  if (bloodlineMagic.id !== "none") conditions.push(`${bloodlineMagic.name}${bloodlineMagicTriggered ? "" : "（未使用）"}`);
  for (const [side, label] of [["attacker", "进攻"], ["defender", "防御"]]) {
    for (const value of Object.values(marks?.[side] ?? {})) {
      const mark = markDefinition(value?.id);
      if (mark && value.stacks > 0) conditions.push(`${label}${mark.name} ${value.stacks}层`);
    }
    if (negativeStatusEnabled) {
      const statuses = normalizeNegativeStatusSide(negativeStatuses?.[side]);
      for (const key of NEGATIVE_STATUS_KEYS) {
        if (statuses[key] > 0) conditions.push(`${label}${NEGATIVE_STATUS_DEFINITIONS[key].label} ${statuses[key]}层`);
      }
    }
  }
  const conditionSummary = conditions.slice(0, 2).join(" · ") + (conditions.length > 2 ? ` +${conditions.length - 2}` : "");

  function setOpen(value) {
    if (controlledOpen === undefined) setInternalOpen(value);
    onOpenChange?.(value);
  }

  useEffect(() => {
    if (
      !open ||
      locateAdvancedTopRequest === null ||
      locateAdvancedTopRequest === consumedAdvancedTopRequestRef.current
    ) return;
    consumedAdvancedTopRequestRef.current = locateAdvancedTopRequest;
    advancedOptionsRef.current?.scrollIntoView?.({ block: "start" });
    advancedToggleRef.current?.focus();
    onAdvancedTopLocated(locateAdvancedTopRequest);
  }, [locateAdvancedTopRequest, onAdvancedTopLocated, open]);

  return (
    <section
      className={`advanced-options${open ? " is-open" : ""}`}
      ref={advancedOptionsRef}
    >
      <button
        aria-expanded={open}
        aria-label="高级选项"
        aria-description={!open && conditions.length ? `已配置：${conditions.join("、")}；是否生效以计算结果为准` : undefined}
        className="advanced-options__toggle"
        onClick={() => setOpen(!open)}
        ref={advancedToggleRef}
        type="button"
      >
        <span>
          <SlidersHorizontal aria-hidden="true" size={19} />
          高级选项
          {!open && conditionSummary ? (
            <small className="advanced-options__summary" title={`已配置：${conditions.join("、")}；是否生效以计算结果为准`}>
              {conditionSummary}
            </small>
          ) : null}
        </span>
        <CaretDown aria-hidden="true" size={16} weight="bold" />
      </button>

      {open ? (
        <div className="advanced-options__content">
          <div className="advanced-options__common">
            <label className="field-group">
              <span>天气</span>
              <select
                aria-label="天气"
                onChange={(event) => onWeatherChange(event.target.value)}
                value={weather}
              >
                <option value="none">无天气</option>
                <option value="rain">雨天 · 水系威力 +75%</option>
                <option value="thunder">雷鸣 · 回合末引电 +1</option>
                <option value="sandstorm">沙暴 · 联动相关特性</option>
                <option value="blizzard">暴风雪 · 联动技能与特性</option>
              </select>
            </label>
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
            <fieldset className="bloodline-magic-field">
              <legend>
                血脉魔法 <small>给进攻方使用</small>
              </legend>
              <div className="bloodline-magic-field__controls">
                <select
                  aria-label="血脉魔法"
                  onChange={(event) =>
                    onBloodlineMagicChange(event.target.value, false)
                  }
                  value={bloodlineMagic.id}
                >
                  {BLOODLINE_MAGIC_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                    </option>
                  ))}
                </select>
                <label className="bloodline-magic-field__trigger">
                  <input
                    aria-label={`使用${bloodlineMagic.name}`}
                    checked={bloodlineMagicTriggered && bloodlineMagic.id !== "none"}
                    disabled={bloodlineMagic.id === "none"}
                    onChange={(event) =>
                      onBloodlineMagicChange(
                        bloodlineMagic.id,
                        event.target.checked,
                      )
                    }
                    type="checkbox"
                  />
                  使用
                </label>
              </div>
              <small>
                {bloodlineMagic.implemented
                  ? bloodlineMagic.note
                  : bloodlineMagic.id === "none"
                    ? "未使用血脉魔法"
                    : "暂不参与伤害计算"}
              </small>
            </fieldset>
          </div>
          <div className="mark-config">
            <SideMarks
              label="进攻方"
              marks={marks?.attacker}
              onChange={onMarkChange}
              onHelp={() => setReferenceGroup("negative")}
              side="attacker"
              tone="attack"
            />
            <SideMarks
              label="防御方"
              marks={marks?.defender}
              onChange={onMarkChange}
              onHelp={() => setReferenceGroup("negative")}
              side="defender"
              tone="defense"
            />
          </div>
          {negativeStatusEnabled ? (
            <section aria-label="负面状态层数" className="negative-status-config">
              <header>
                <strong>负面状态<StatusHelpButton label="查看负面状态说明" onClick={() => setReferenceGroup("status")} /></strong>
                <small>行动前已有层数；攻击自动预览，状态技能需使用。</small>
              </header>
              <div>
                <NegativeStatusSide
                  label="进攻方"
                  onChange={onNegativeStatusChange}
                  side="attacker"
                  value={negativeStatuses?.attacker}
                />
                <NegativeStatusSide
                  label="防御方"
                  onChange={onNegativeStatusChange}
                  side="defender"
                  value={negativeStatuses?.defender}
                />
              </div>
            </section>
          ) : null}
          <FormulaAudit result={result} />
        </div>
      ) : null}
      {referenceGroup && <StatusReference initialGroup={referenceGroup} onClose={() => setReferenceGroup(null)} />}
    </section>
  );
}
