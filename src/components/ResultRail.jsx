import { ArrowsLeftRight } from "@phosphor-icons/react";
import { damageTone } from "./damageTone.js";

function clampPercent(value) {
  return Math.min(100, Math.max(0, Number(value) || 0));
}

export function ResultRail({
  onCurrentHpChange,
  onDirectionToggle,
  result,
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
        aria-label={isExact ? `伤害占当前生命 ${primary.hpPercent.toFixed(1)}%` : "伤害待计算"}
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

      {onCurrentHpChange ? (
        <div className="result-rail__hp-control">
          <span>目标 HP</span>
          <label>
            <input
              aria-label="防御方当前生命"
              max={result.defenderMaxHp}
              min="0"
              onChange={(event) =>
                onCurrentHpChange(
                  Math.min(
                    result.defenderMaxHp,
                    Math.max(0, Number(event.target.value) || 0),
                  ),
                )
              }
              type="number"
              value={result.defenderHp}
            />
            <span>/ {result.defenderMaxHp}</span>
          </label>
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

    </aside>
  );
}
