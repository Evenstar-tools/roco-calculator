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

  return (
    <View aria-label="伤害计算过程" className="result-formula">
      <View className="result-formula__header">
        <Text className="result-formula__title">伤害计算过程</Text>
        <Text className="result-formula__skill">{audit.skillName}</Text>
      </View>

      <FormulaRow title="技能威力" tone="power">
        <FormulaChip
          label={Number.isFinite(Number(power.base)) ? "基础" : "规则值"}
          tone="power"
          value={displayFormulaNumber(
            Number.isFinite(Number(power.base)) ? power.base : power.effective,
          )}
        />
        {Number.isFinite(Number(power.conditional)) &&
        Number(power.conditional) !== Number(power.base) ? (
          <>
            <FormulaOperator>→</FormulaOperator>
            <FormulaChip
              label="条件后"
              tone="power"
              value={displayFormulaNumber(power.conditional)}
            />
          </>
        ) : null}
        {[
          ["技能固定", power.fixed],
          ["印记固定", power.markFixed],
          ["特性固定", power.traitFixed],
        ].map(([label, value]) =>
          Number(value) !== 0 ? (
            <View className="result-formula__term" key={label}>
              <FormulaOperator>{Number(value) > 0 ? "+" : "−"}</FormulaOperator>
              <FormulaChip
                label={label}
                tone="power"
                value={displayFormulaNumber(Math.abs(value))}
              />
            </View>
          ) : null,
        )}
        {power.percentAdds !== 0 ? (
          <>
            <FormulaOperator>×</FormulaOperator>
            <FormulaChip
              label="威力加成"
              tone="power"
              value={displayFormulaNumber(1 + power.percentAdds)}
            />
          </>
        ) : null}
        <FormulaOperator>=</FormulaOperator>
        <FormulaChip
          label="结果"
          tone="result"
          value={displayFormulaNumber(power.effective)}
        />
      </FormulaRow>

      <FormulaRow title="显示威力" tone="display">
        <FormulaChip
          label="技能"
          tone="display"
          value={displayFormulaNumber(power.effective)}
        />
        {audit.formulaPower.factors
          .filter((factor) => Math.abs(Number(factor.value) - 1) > 1e-10)
          .map((factor) => (
            <View className="result-formula__term" key={factor.label}>
              <FormulaOperator>×</FormulaOperator>
              <FormulaChip
                label={factor.label}
                tone="display"
                value={displayFormulaNumber(factor.value)}
              />
            </View>
          ))}
        <FormulaOperator>=</FormulaOperator>
        <FormulaChip
          label="公式值"
          tone="display"
          value={displayFormulaNumber(audit.formulaPower.internal)}
        />
        <FormulaOperator>→</FormulaOperator>
        <FormulaRounding>四舍五入</FormulaRounding>
        <FormulaChip
          label="界面值"
          tone="result"
          value={displayFormulaNumber(audit.formulaPower.displayed)}
        />
      </FormulaRow>

      <FormulaRow title="每段伤害" tone="one-hit">
        <FormulaChip
          label={audit.attackLabel}
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
          label={audit.defenseLabel}
          tone="one-hit"
          value={displayFormulaNumber(oneHit.defense)}
        />
        {Number(oneHit.reduction) !== 1 ? (
          <>
            <FormulaOperator>×</FormulaOperator>
            <FormulaChip
              label="伤害保留"
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
        <FormulaChip
          label="每段"
          tone="total"
          value={displayFormulaNumber(oneHit.afterFloor)}
        />
        {Number(total.finalMultiplier) !== 1 ? (
          <>
            <FormulaOperator>×</FormulaOperator>
            <FormulaChip
              label="最终倍率"
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
            <FormulaChip label="段数" tone="total" value={total.hitCount} />
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
        <FormulaOperator>=</FormulaOperator>
        <FormulaChip
          label="结果"
          tone="result"
          value={displayFormulaNumber(total.value)}
        />
      </FormulaRow>
    </View>
  );
}
