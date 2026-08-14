import { ArrowsLeftRight } from "@phosphor-icons/react";
import { damageTone } from "./damageTone.js";
import { HealthInput } from "./HealthInput.jsx";
import { TypeCoveragePanel } from "./TypeCoveragePanel.jsx";

function clampPercent(value) {
  return Math.min(100, Math.max(0, Number(value) || 0));
}

export function ResultRail({
  onCurrentHpChange,
  onCurrentHpPercentChange,
  onDirectionToggle,
  result,
  showTypeCoverage = false,
}) {
  const primary = result.selectedResult;
  const isExact =
    primary.status === "exact" &&
    Number.isFinite(primary.totalDamage) &&
    Number.isFinite(primary.hpPercent);
  const barWidth = isExact ? clampPercent(primary.hpPercent) : 0;
  const percentText = isExact ? `${primary.hpPercent.toFixed(1)}% HP` : "待补充条件";
  const outcomeText = isExact
    ? primary.lethal
      ? "可击倒"
      : `剩余 ${Math.max(0, result.defenderHp - primary.totalDamage)} HP`
    : primary.reason ?? (primary.status === "unsupported" ? "该规则暂未验证" : "需要更多输入");
  return (
    <aside aria-label="伤害结果" className="result-rail">
      <div className="result-rail__heading">
        <div>
          <p className="result-rail__matchup">
            <strong className="result-rail__attacker">{result.attackerName}</strong>
            <span aria-hidden="true">→</span>
            <strong className="result-rail__defender">{result.defenderName}</strong>
          </p>
          <p className="result-rail__skill">{result.selectedSkillName}</p>
        </div>
        {onDirectionToggle ? (
          <button
            aria-label="切换计算方向"
            className="result-rail__direction"
            onClick={onDirectionToggle}
            title="切换计算方向"
            type="button"
          >
            <ArrowsLeftRight aria-hidden="true" size={20} weight="bold" />
          </button>
        ) : null}
      </div>

      <div className="result-rail__primary">
        <output className="result-rail__damage" data-testid="primary-damage">
          {isExact ? primary.totalDamage : "—"}
        </output>
        <p className="result-rail__percent">{percentText}</p>
        <p className="result-rail__lethal">{outcomeText}</p>
      </div>

      <div
        aria-label={isExact ? `伤害占最大生命 ${primary.hpPercent.toFixed(1)}%` : "伤害待计算"}
        className="damage-bar"
        role="img"
      >
        <span className="damage-bar__fill" style={{ width: `${barWidth}%` }} />
        <span className="damage-bar__label">
          {isExact ? `${primary.hpPercent.toFixed(1)}%` : "—"}
        </span>
      </div>

      {isExact && primary.warnings?.length > 0 ? (
        <p className="result-rail__warning">{primary.warnings.join("；")}</p>
      ) : null}

      {primary.markSettlements?.length > 0 ? (
        <section aria-label="印记结算" className="result-rail__marks">
          {primary.markSettlements.map((settlement, index) => (
            <div
              data-side={settlement.side}
              data-status={settlement.status}
              key={`${settlement.side}-${settlement.markId}-${index}`}
            >
              <b>
                {settlement.side === "attacker" ? "进攻方" : "防御方"}
              </b>
              <span>{settlement.text}</span>
            </div>
          ))}
        </section>
      ) : null}

      {primary.traitSettlements?.length > 0 ? (
        <section aria-label="特性结算" className="result-rail__traits">
          {primary.traitSettlements.map((settlement, index) => (
            <div
              data-side={settlement.side}
              data-status={settlement.status}
              key={`${settlement.traitId}-${settlement.bloodlineType}-${index}`}
            >
              <b>{settlement.side === "attacker" ? "进攻方" : "防御方"}</b>
              <span>{settlement.text}</span>
            </div>
          ))}
        </section>
      ) : null}

      {onCurrentHpChange ? (
        <div className="result-rail__hp-control">
          <span>目标 HP</span>
          <HealthInput
            currentHp={result.defenderHp}
            label="防御方"
            maxHp={result.defenderMaxHp}
            onCurrentHpChange={onCurrentHpChange}
            onPercentChange={onCurrentHpPercentChange}
            percentValue={result.defenderHpPercent}
          />
          <button
            aria-label="恢复满血"
            onClick={() => onCurrentHpChange(result.defenderMaxHp)}
            title="恢复满血"
            type="button"
          >
            满
          </button>
        </div>
      ) : null}

      {result.mode === "four" ? (
        <section aria-label="技能结果" className="skill-result-list">
          <h2>技能结果</h2>
          {result.traitResult ? (
            <div
              className={`skill-result-row skill-result-row--trait${
                result.traitResult.selected ? " is-selected" : ""
              }`}
              data-tone={damageTone(result.traitResult.hpPercent)}
            >
              <span className="skill-result-row__index skill-result-row__index--trait">
                特
              </span>
              <span className="skill-result-row__name skill-result-row__name--trait">
                <span>{result.traitResult.name}</span>
                <small aria-hidden="true">特性</small>
                <span className="sr-only">特性造成伤害</span>
              </span>
              <span className="skill-result-row__bar" aria-hidden="true">
                <span
                  style={{
                    width: `${clampPercent(result.traitResult.hpPercent)}%`,
                  }}
                />
              </span>
              <strong>
                {Number.isFinite(result.traitResult.hpPercent)
                  ? `${result.traitResult.hpPercent.toFixed(1)}%`
                  : "—"}
              </strong>
            </div>
          ) : null}
          {result.skillResults.map((skill, index) => (
            <div
              className={`skill-result-row${skill.selected ? " is-selected" : ""}`}
              data-tone={damageTone(skill.hpPercent)}
              key={`${skill.id}-${index}`}
            >
              <span className="skill-result-row__index">{index + 1}</span>
              <span className="skill-result-row__name">{skill.name}</span>
              <span className="skill-result-row__bar" aria-hidden="true">
                <span style={{ width: `${clampPercent(skill.hpPercent)}%` }} />
              </span>
              <strong>
                {Number.isFinite(skill.hpPercent)
                  ? `${skill.hpPercent.toFixed(1)}%`
                  : "—"}
              </strong>
            </div>
          ))}
        </section>
      ) : null}

      {showTypeCoverage ? (
        <TypeCoveragePanel analysis={result.typeAnalysis} />
      ) : null}

      {primary.choiceTraitSequence?.text ? (
        <p
          aria-label="选择特性结算"
          className="result-rail__choice-sequence"
          role="status"
        >
          {primary.choiceTraitSequence.text}
        </p>
      ) : null}

    </aside>
  );
}
