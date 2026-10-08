import { gainLabels, gainTermLabel } from "../shared/domain/gain-provenance.js";
import { Text, View } from "@tarojs/components";
import {
  buildResultFormulaAudit,
  displayDamageCoefficient,
  displayFormulaNumber,
  displayLevelCoefficient,
} from "../view-models/formula-audit.js";

function FormulaChip({ label, tone = "neutral", value }) {
  return (
    <View className={`result-formula__chip result-formula__chip--${tone}`}>
      <Text className="result-formula__chip-label">{label}</Text>
      <Text className="result-formula__chip-value">{value}</Text>
    </View>
  );
}

function FormulaOperator({ children }) {
  return <Text className="result-formula__operator">{children}</Text>;
}

function FormulaRow({ children, title, tone }) {
  return (
    <View className={`result-formula__row result-formula__row--${tone}`}>
      <Text className="result-formula__row-title">{title}</Text>
      <View className="result-formula__expression">{children}</View>
    </View>
  );
}

function FormulaRounding({ children }) {
  return <Text className="result-formula__rounding">{children}</Text>;
}

function percentExpression(power, gains) {
  const sources = [...(power.manual ? [] : gains.staticPercent ?? []), ...(gains.powerPercent ?? [])]
    .filter(({ amount }) => Number.isFinite(Number(amount)) && Number(amount) !== 0);
  const recordedTotal = sources.reduce((sum, { amount }) => sum + Number(amount), 0);
  const terms = Math.abs(recordedTotal - power.percentAdds) < 1e-8
    ? sources
    : power.percentValues.map((amount) => ({ amount }));
  return `(1${terms.filter(({ amount }) => Number(amount) !== 0).map(({ amount, name }) =>
    ` ${Number(amount) > 0 ? "+" : "−"} ${name ?? ""}${displayFormulaNumber(Math.abs(Number(amount)) * 100)}%`
  ).join("")})`;
}

function fixedStepLabel(step, gains) {
  if (step.label === "固定威力增加") {
    const sources = gains.fixed ?? [];
    const recordedTotal = sources.reduce((sum, { amount }) => sum + Number(amount), 0);
    return Math.abs(recordedTotal - step.amount) < 1e-8 ? gainLabels(sources) || "技能固定" : "技能固定";
  }
  if (step.label === "印记固定威力") return "印记固定";
  if (step.label === "特性固定威力") {
    const sources = gains.traitFixed ?? [];
    const recordedTotal = sources.reduce((sum, { amount }) => sum + Number(amount), 0);
    return Math.abs(recordedTotal - step.amount) < 1e-8 ? gainLabels(sources) || "特性固定" : "特性固定";
  }
  return step.label;
}

function BloodlineFormulaAudit({ audit }) {
  const bloodline = audit.bloodline;
  return (
    <View aria-label="伤害计算过程" className="result-formula">
      <View className="result-formula__header">
        <Text className="result-formula__title">伤害计算过程</Text>
        <Text className="result-formula__skill">{audit.skillName}</Text>
      </View>
      <FormulaRow title="立即回复" tone="power">
        <FormulaChip
          label="最大生命 × 15%"
          tone="power"
          value={displayFormulaNumber(bloodline.immediateHealing)}
        />
        <FormulaOperator>→</FormulaOperator>
        <FormulaChip
          label="实际回复"
          tone="result"
          value={displayFormulaNumber(bloodline.actualHealing)}
        />
      </FormulaRow>
      <FormulaRow title="后续回复" tone="power">
        <FormulaChip
          label="每回合结束回复"
          tone="power"
          value={displayFormulaNumber(bloodline.perTurnHealing)}
        />
        <FormulaOperator>×</FormulaOperator>
        <FormulaChip
          label="回合数"
          tone="power"
          value={displayFormulaNumber(bloodline.endTurnTicks)}
        />
        <FormulaOperator>=</FormulaOperator>
        <FormulaChip
          label="名义合计（未扣溢出）"
          tone="result"
          value={displayFormulaNumber(bloodline.nominalEndTurnTotal)}
        />
      </FormulaRow>
      <FormulaRow title="戏耍真伤" tone="total">
        <FormulaChip
          label="实际立即回复"
          tone="total"
          value={displayFormulaNumber(bloodline.actualHealing)}
        />
        <FormulaOperator>=</FormulaOperator>
        <FormulaChip
          label="真伤"
          tone="result"
          value={displayFormulaNumber(bloodline.damage)}
        />
      </FormulaRow>
    </View>
  );
}

export default function ResultFormulaAudit({ result }) {
  const audit = buildResultFormulaAudit(result);
  if (!audit) return null;
  if (audit.kind === "bloodline") {
    return <BloodlineFormulaAudit audit={audit} />;
  }

  const power = audit.power;
  const numerator = audit.numerator;
  const oneHit = audit.oneHit;
  const total = audit.total;
  const gains = result.gainSources ?? {};
  const factors = audit.formulaPower.factors.filter((factor) => Math.abs(Number(factor.value) - 1) > 1e-10);
  const hasCondition = Number.isFinite(Number(power.conditional)) && Number(power.conditional) !== Number(power.base);
  const hasPercent = power.hasPercentStep && (power.percentValues.some((value) => Number(value) !== 0) ||
    power.percentRaw !== null && Number(power.percentRaw) !== Number(power.percentAfter));
  const hasPowerStages = !power.manualPanel && (hasCondition || power.fixedSteps.length > 0 || hasPercent);
  const displayNeedsRounding = Number(audit.formulaPower.internal) !== Number(audit.formulaPower.displayed);
  const simpleTotal = total.hitCount === 1 && Number(total.finalMultiplier) === 1 &&
    total.additionalDamage === 0 && total.reassemblyDamage === 0 && total.traitDamage === 0;
  const recordedPower = Number(power.conditional ?? power.base ?? power.percentBefore) +
    power.fixedSteps.reduce((sum, step) => sum + step.amount, 0);
  const powerChainMatches = Math.abs(recordedPower - Number(power.hasPercentStep ? power.percentBefore : power.effective)) < 1e-8;
  const showBeforeFactors = hasPowerStages && !hasPercent && (factors.length > 0 || displayNeedsRounding);

  return (
    <View aria-label="伤害计算过程" className="result-formula">
      <View className="result-formula__header">
        <Text className="result-formula__title">伤害计算过程</Text>
        <Text className="result-formula__skill">{audit.skillName}</Text>
      </View>

      <FormulaRow title="静态威力" tone="power">
        <FormulaChip
          label={power.manual && !power.manualPanel ? "手动" : "规则值"}
          tone="power"
          value={displayFormulaNumber(power.staticValue ?? power.base ?? power.effective)}
        />
      </FormulaRow>

      <FormulaRow title="显示威力" tone="display">
        <FormulaChip
          label={power.manualPanel || (hasPowerStages ? power.manual ? "手动静态" : power.hasPrimary ? "基础" : "加成基数" : factors.length || displayNeedsRounding ? "加成后威力" : "显示威力")}
          tone={hasPowerStages || factors.length || displayNeedsRounding ? "display" : "result"}
          value={displayFormulaNumber(power.manualPanel ? power.effective : hasPowerStages ? power.base ?? power.percentBefore : factors.length || displayNeedsRounding ? power.effective : audit.formulaPower.displayed)}
        />
        {hasPowerStages && hasCondition ? (
          <>
            <FormulaOperator>→</FormulaOperator>
            <FormulaChip
              label={gainTermLabel("条件后", gains.condition)}
              tone="power"
              value={displayFormulaNumber(power.conditional)}
            />
          </>
        ) : null}
        {hasPowerStages && power.fixedSteps.map((step, index) => (
            <View className="result-formula__term" key={`${step.label}-${index}`}>
              <FormulaOperator>{step.amount > 0 ? "+" : "−"}</FormulaOperator>
              <FormulaChip
                label={fixedStepLabel(step, gains)}
                tone="power"
                value={displayFormulaNumber(Math.abs(step.amount))}
              />
            </View>
        ))}
        {hasPowerStages && (power.fixedSteps.length > 0 || !powerChainMatches) && power.hasPercentStep ? (
          <>
            <FormulaOperator>{powerChainMatches ? "=" : "→"}</FormulaOperator>
            <FormulaChip label="加成基数" tone="display" value={displayFormulaNumber(power.percentBefore)} />
          </>
        ) : null}
        {hasPercent ? (
          <>
            <FormulaOperator>×</FormulaOperator>
            <FormulaChip
              label="同区加成"
              tone="power"
              value={percentExpression(power, gains)}
            />
            {power.percentRaw !== null && Number(power.percentRaw) !== Number(power.percentAfter) ? (
              <>
                <FormulaOperator>=</FormulaOperator>
                <FormulaChip label="未取整" tone="display" value={displayFormulaNumber(power.percentRaw)} />
                <FormulaOperator>→</FormulaOperator>
                <FormulaRounding>向下取整</FormulaRounding>
              </>
            ) : power.percentRaw === null ? <>
              <FormulaOperator>→</FormulaOperator>
              <FormulaRounding>规则结算</FormulaRounding>
            </> : <FormulaOperator>=</FormulaOperator>}
            <FormulaChip label={factors.length || displayNeedsRounding ? "加成后威力" : "显示威力"} tone={factors.length || displayNeedsRounding ? "display" : "result"} value={displayFormulaNumber(power.percentAfter)} />
          </>
        ) : null}
        {showBeforeFactors ? (
          <>
            <FormulaOperator>{powerChainMatches ? "=" : "→"}</FormulaOperator>
            <FormulaChip label="加成后威力" tone="display" value={displayFormulaNumber(power.effective)} />
          </>
        ) : null}
        {factors.map((factor) => (
            <View className="result-formula__term" key={factor.label}>
              <FormulaOperator>×</FormulaOperator>
              <FormulaChip
                label={factor.label === "克制" ? "克制倍率" : factor.label}
                tone="display"
                value={displayFormulaNumber(factor.value)}
              />
            </View>
          ))}
        {displayNeedsRounding ? (
          <>
            {!(showBeforeFactors && factors.length === 0) ? <>
            <FormulaOperator>=</FormulaOperator>
            <FormulaChip label="未取整" tone="display" value={displayFormulaNumber(audit.formulaPower.internal)} />
            </> : null}
            <FormulaOperator>→</FormulaOperator>
            <FormulaRounding>向下取整</FormulaRounding>
          </>
        ) : null}
        {(hasPowerStages && !hasPercent || factors.length > 0 || displayNeedsRounding) && !power.manualPanel ? (
          <>
            {!displayNeedsRounding ? <FormulaOperator>{hasPowerStages && !hasPercent && factors.length === 0 && !powerChainMatches ? "→" : "="}</FormulaOperator> : null}
            <FormulaChip label="显示威力" tone="result" value={displayFormulaNumber(audit.formulaPower.displayed)} />
          </>
        ) : null}
      </FormulaRow>

      <FormulaRow title="每段伤害" tone="one-hit">
        <FormulaChip
          label={gainTermLabel(audit.attackLabel, gains.attack, "层")}
          tone="one-hit"
          value={displayFormulaNumber(numerator.attack)}
        />
        <FormulaOperator>×</FormulaOperator>
        <FormulaChip
          label="威力"
          tone="one-hit"
          value={displayFormulaNumber(numerator.power)}
        />
        <FormulaOperator>×</FormulaOperator>
        <FormulaChip
          label="等级系数"
          tone="one-hit"
          value={displayLevelCoefficient(numerator.coefficient, numerator.level)}
        />
        <FormulaOperator>→</FormulaOperator>
        <FormulaRounding>四舍五入</FormulaRounding>
        <FormulaChip
          label="伤害分子"
          tone="one-hit"
          value={displayFormulaNumber(numerator.afterRound)}
        />
        <FormulaOperator>÷</FormulaOperator>
        <FormulaChip
          label={gainTermLabel(audit.defenseLabel, gains.defense, "层")}
          tone="one-hit"
          value={displayFormulaNumber(oneHit.defense)}
        />
        {Number(oneHit.reduction) !== 1 ? (
          <>
            <FormulaOperator>×</FormulaOperator>
            <FormulaChip
              label={gainLabels(gains.reduction) || "伤害保留"}
              tone="one-hit"
              value={displayFormulaNumber(oneHit.reduction)}
            />
          </>
        ) : null}
        <FormulaOperator>→</FormulaOperator>
        <FormulaRounding>向下取整</FormulaRounding>
        <FormulaChip
          label="结果"
          tone="result"
          value={displayFormulaNumber(oneHit.afterFloor)}
        />
      </FormulaRow>

      <FormulaRow title="总伤害" tone="total">
        {simpleTotal ? <FormulaChip label="1段" tone="result" value={displayFormulaNumber(total.value)} /> : <>
        <FormulaChip
          label="每段"
          tone="total"
          value={displayFormulaNumber(oneHit.afterFloor)}
        />
        {Number(total.finalMultiplier) !== 1 ? (
          <>
            <FormulaOperator>×</FormulaOperator>
            <FormulaChip
              label={gainLabels(gains.final) || "最终倍率"}
              tone="total"
              value={displayFormulaNumber(total.finalMultiplier)}
            />
            <FormulaOperator>→</FormulaOperator>
            <FormulaRounding>向下取整</FormulaRounding>
            <FormulaChip
              label="结算后每段"
              tone="total"
              value={displayFormulaNumber(total.oneHitAfterFinal)}
            />
          </>
        ) : null}
        {total.hitCount > 1 ? (
          <>
            <FormulaOperator>×</FormulaOperator>
            <FormulaChip label={gainTermLabel("段数", gains.hits)} tone="total" value={total.hitCount} />
          </>
        ) : null}
        {total.additionalDamage > 0 ? (
          <>
            <FormulaOperator>+</FormulaOperator>
            <FormulaChip
              label="星陨追加"
              tone="total"
              value={displayFormulaNumber(total.additionalDamage)}
            />
          </>
        ) : null}
        {total.reassemblyDamage > 0 ? (
          <>
            <FormulaOperator>+</FormulaOperator>
            <FormulaChip
              label="重组追加"
              tone="total"
              value={displayFormulaNumber(total.reassemblyDamage)}
            />
          </>
        ) : null}
        {total.traitDamage > 0 ? (
          <>
            <FormulaOperator>+</FormulaOperator>
            <FormulaChip label="特性追加" tone="total" value={displayFormulaNumber(total.traitDamage)} />
          </>
        ) : null}
        <FormulaOperator>=</FormulaOperator>
        <FormulaChip
          label="结果"
          tone="result"
          value={displayFormulaNumber(total.value)}
        />
        </>}
      </FormulaRow>
    </View>
  );
}
