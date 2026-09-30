import { ArrowsLeftRight } from "@phosphor-icons/react";
import { damageTone } from "./damageTone.js";
import { HealthInput } from "./HealthInput.jsx";
import { TypeCoveragePanel } from "./TypeCoveragePanel.jsx";
import { damagePresentation, DamageSegments } from "./damagePresentation.jsx";
import { hasBurnPreview, statusLossText } from "../domain/result-presentation.js";

const STATUS_LABELS = {
  burn: "灼烧",
  freeze: "冻结",
  parasitism: "寄生",
  poison: "中毒",
  electrified: "引电",
};

function compactStatusSummary(settlement) {
  if (!settlement) return null;
  const breakdown = (settlement.breakdown ?? [])
    .filter((entry) => Number(entry.stacks) > 0 && Number(entry.damage) > 0)
    .map((entry) => `${STATUS_LABELS[entry.id]}×${entry.stacks}`);
  const parts = breakdown.length > 0
    ? breakdown
    : Object.entries(settlement.added ?? {})
        .filter(([id, stacks]) => id !== "freeze" && Number(stacks) > 0)
        .map(([id, stacks]) => `${STATUS_LABELS[id]}×${stacks}`);
  const freezeThreshold = Number(settlement.freeze?.thresholdPercent) || 0;
  if (freezeThreshold > 0 && !settlement.freeze?.immune && !settlement.skipped) {
    parts.push(settlement.freeze?.lethal && settlement.remainingHp > 0 ? "冻结击倒" : `冻结${freezeThreshold}%`);
  }
  return parts.join(" · ") || null;
}

function burnLossText(phase) {
  const burn = phase?.breakdown?.find((entry) => entry.id === "burn");
  return statusLossText(phase, burn);
}

function TurnStatusPreview({ current, preview }) {
  if (!hasBurnPreview(current)) return null;
  const rows = [
    {
      amount: burnLossText(current),
      label: "本回合",
      phase: current,
    },
    {
      amount: burnLossText(preview.next),
      label: "下回合",
      phase: preview.next,
    },
  ];
  return (
    <section
      aria-label="回合状态预估"
      className="result-rail__turn-preview"
      data-status="burn"
    >
      {rows.map((row) => (
        <div className="result-rail__turn-row" key={row.label}>
          <span>
            {row.label}
            {row.label === "下回合" && preview.repeated ? (
              <em>续用</em>
            ) : null}
          </span>
          <b>灼烧 ×{Math.max(0, Number(row.phase.stacks?.burn) || 0)}</b>
          <strong>{row.amount}</strong>
        </div>
      ))}
    </section>
  );
}

function NegativeStatusSettlement({ settlement }) {
  if (!settlement || settlement.skipped === "direct-ko") return null;
  const maxHp = Math.max(1, Number(settlement.maxHp) || 1);
  const actualStatusDamage = Math.max(
    0,
    Number(settlement.actualStatusDamage) || 0,
  );
  const freezeThreshold = Math.max(
    0,
    Number(settlement.freeze?.thresholdPercent) || 0,
  );
  const freezeThresholdHp = Number.isFinite(Number(settlement.freeze?.thresholdHp))
    ? Math.max(0, Math.floor(Number(settlement.freeze.thresholdHp)))
    : Math.floor(maxHp * freezeThreshold / 100);
  return (
    <section
      aria-label="负面状态结算"
      className="result-rail__status-settlement"
    >
      <header>
        <strong>状态结算</strong>
      </header>
      {settlement.breakdown?.map((entry) =>
        entry.stacks > 0 && !(entry.id === "burn" && hasBurnPreview(settlement)) ? (
          <div className="result-rail__status-row" data-status={entry.id} key={entry.id}>
            <span className="result-rail__status-name">
              {STATUS_LABELS[entry.id]} ×{entry.stacks}
              {entry.id === "electrified" && entry.triggered ? " · 已触发" : ""}
            </span>
            <strong>
              {statusLossText(settlement, entry)}
            </strong>
          </div>
        ) : null,
      )}
      {settlement.freeze?.stacks > 0 ? (
        <div className="result-rail__status-row" data-status="freeze">
          <span className="result-rail__status-name">
            冻结 ×{settlement.freeze.stacks}
          </span>
          <strong>
            {settlement.freeze.immune
              ? "免疫"
              : settlement.freeze.thresholdPercent + "% 斩杀线"}
          </strong>
          {!settlement.freeze.immune ? (
            <small className="result-rail__status-note">
              ≤{freezeThresholdHp} HP · 不额外扣血
            </small>
          ) : null}
        </div>
      ) : null}
      {Number(settlement.totalHealing) > 0 ? (
        <div className="result-rail__status-row">
          <span>来源回复</span>
          <strong>+{settlement.totalHealing} HP</strong>
        </div>
      ) : null}
      {actualStatusDamage > 0 &&
      (Number(settlement.directDamage) === 0 ||
        actualStatusDamage !== Number(settlement.statusDamage)) ? (
        <footer>
          <strong>
            {actualStatusDamage < Number(settlement.statusDamage)
              ? `异常合计 ${settlement.statusDamage} HP`
              : `实际扣血 ${actualStatusDamage} HP`}
          </strong>
          <span>{settlement.actualStatusDamage < settlement.statusDamage
            ? `仅剩 ${settlement.actualStatusDamage} HP 可扣`
            : settlement.remainingHp === 0 ? "负面状态击倒" : settlement.outcome}</span>
        </footer>
      ) : null}
      <TurnStatusPreview
        current={settlement}
        preview={settlement.turnPreview}
      />
    </section>
  );
}

function SkillResultRow({ index, item, onClick }) {
  const isTrait = item.kind === "trait";
  const isBloodline = item.kind === "bloodline";
  const Tag = onClick ? "button" : "div";
  const statusSummary = compactStatusSummary(item.negativeStatusSettlement);
  const presentation = damagePresentation(item);
  const displayPercent = presentation.percent;
  const displayDamage = presentation.damage;
  return (
    <Tag
      {...(onClick
        ? {
            "aria-label": `查看${item.name}伤害`,
            onClick,
            type: "button",
          }
        : {})}
      className={`skill-result-row${isTrait || isBloodline ? " skill-result-row--trait" : ""}${Number(item.negativeStatusSettlement?.freeze?.thresholdPercent) > 0 ? " skill-result-row--freeze" : ""}${onClick ? " skill-result-row--action" : ""}${item.selected ? " is-selected" : ""}`}
      data-tone={damageTone(displayPercent)}
    >
      <span className={`skill-result-row__index${isTrait || isBloodline ? " skill-result-row__index--trait" : ""}`}>
        {isTrait ? "特" : isBloodline ? "血" : index + 1}
      </span>
      <span className={`skill-result-row__name${isTrait || isBloodline ? " skill-result-row__name--trait" : ""}`}>
        <span>{item.name}</span>
        {isBloodline ? <small>血脉</small> : null}
        {isTrait ? (
          <>
            <small aria-hidden="true">特性</small>
            <span className="sr-only">特性造成伤害</span>
          </>
        ) : statusSummary ? (
          <small className="skill-result-row__status" title={statusSummary}>
            {statusSummary}
          </small>
        ) : null}
      </span>
      <span className="skill-result-row__bar" aria-hidden="true" title={presentation.detail ?? undefined}>
        <DamageSegments presentation={presentation} />
      </span>
      <span
        aria-label={`${item.name}实际伤害`}
        className="skill-result-row__damage"
      >
        {displayDamage ?? "—"}
      </span>
      <strong aria-label={`${item.name}生命百分比`} title={presentation.detail ?? undefined}>
        {Number.isFinite(displayPercent)
          ? `${displayPercent.toFixed(1)}%`
            : "—"}
      </strong>
    </Tag>
  );
}

export function ResultRail({
  activeAdvancedConditions = [],
  onBloodlineResultFocus,
  onAdvancedOptionsOpen,
  onCurrentHpChange,
  onCurrentHpPercentChange,
  onDirectionToggle,
  onSkillResultSelect,
  onOpenComparison,
  result,
  showTypeCoverage = false,
}) {
  const primary = result.selectedResult;
  const isExact =
    primary.status === "exact" &&
    Number.isFinite(primary.totalDamage) &&
    Number.isFinite(primary.hpPercent);
  const isStatusOnly = isExact && primary.statusOnly === true;
  const presentation = damagePresentation(primary);
  const percentText = isExact ? `${presentation.percent.toFixed(1)}% ${presentation.freezePercent > 0 ? "覆盖" : "HP"}` : primary.reason === "非伤害技能不计算伤害" ? "非伤害技能" : "待补充条件";
  const outcomeText = isExact
    ? presentation.lethal
      ? presentation.outcome
      : `剩余 ${presentation.remainingHp ?? Math.max(0, result.defenderHp - primary.totalDamage)} HP`
    : primary.reason ?? (primary.status === "unsupported" ? "该规则暂未验证" : "需要更多输入");
  const koHits =
    isExact && !presentation.lethal && !presentation.hasStatusImpact && primary.totalDamage > 0
      ? Math.ceil(result.defenderHp / primary.totalDamage)
      : null;
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

      {!isStatusOnly ? (
        <>
          <div className="result-rail__primary">
            <p className="result-rail__damage-label">{presentation.statusDamage > 0 ? "本次合计伤害" : "单次伤害"}</p>
            <output className="result-rail__damage" data-testid="primary-damage">
              {isExact ? presentation.damage : "—"}
            </output>
            <p className="result-rail__percent" data-status={primary.reason}>{percentText}</p>
            <p className="result-rail__lethal">
              {outcomeText}
              {koHits !== null ? (
                <span className="result-rail__ko-hint">{koHits} 次可击倒</span>
              ) : null}
            </p>
          </div>

        </>
      ) : null}

      <div
        aria-label={isExact ? presentation.detail ?? `伤害占最大生命 ${primary.hpPercent.toFixed(1)}%` : "伤害待计算"}
        className="damage-bar"
        role="img"
      >
        <DamageSegments className="damage-bar__fill" presentation={presentation} />
        <span className="damage-bar__label">
          {isExact ? `${presentation.percent.toFixed(1)}%` : "—"}
        </span>
      </div>
      {isExact && presentation.detail ? (
        <p className="result-rail__coverage-detail">{presentation.detail}</p>
      ) : null}
      {isStatusOnly && presentation.lethal ? (
        <p className="result-rail__lethal">{presentation.outcome}</p>
      ) : null}

      {isExact && primary.warnings?.length > 0 ? (
        <p className="result-rail__warning">{primary.warnings.join("；")}</p>
      ) : null}

      <NegativeStatusSettlement settlement={primary.negativeStatusSettlement} />
      {onOpenComparison ? <button type="button" className="damage-comparison-entry" onClick={onOpenComparison}>查看全精灵承伤</button> : null}

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
              data-kind={settlement.kind}
              data-side={settlement.side}
              data-status={settlement.status}
              key={`${settlement.traitId}-${settlement.bloodlineType}-${index}`}
            >
              <b>
                {settlement.kind === "baron-greed"
                  ? "贪得无厌"
                  : settlement.side === "attacker" ? "进攻方" : "防御方"}
              </b>
              {settlement.lines?.length ? (
                <div className="result-rail__trait-lines">
                  {settlement.lines.map((line) => <span key={line}>{line}</span>)}
                </div>
              ) : (
                <span>{settlement.text}</span>
              )}
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
            onClick={() => {
              onCurrentHpChange(result.defenderMaxHp);
              onCurrentHpPercentChange?.(100);
            }}
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
          <div aria-hidden="true" className="skill-result-list__columns">
            <span>伤害</span>
            <span>{result.skillResults.some((skill) => damagePresentation(skill).freezePercent > 0) ? "覆盖" : "HP"}</span>
          </div>
          {result.bloodlineResult ? (
            <SkillResultRow
              index={-1}
              item={{ ...result.bloodlineResult, kind: "bloodline" }}
              onClick={onBloodlineResultFocus}
            />
          ) : null}
          {result.traitResult ? (
            <SkillResultRow
              index={-1}
              item={{ ...result.traitResult, kind: "trait" }}
            />
          ) : null}
          {result.skillResults.map((skill, index) => (
            <SkillResultRow
              index={index}
              item={skill}
              key={`${skill.id}-${index}`}
              onClick={onSkillResultSelect
                ? () => onSkillResultSelect(index)
                : undefined}
            />
          ))}
        </section>
      ) : null}

      {activeAdvancedConditions.length > 0 || primary.gainSummary ? (
        <section
          aria-label="当前非默认高级条件"
          className="result-rail__active-conditions"
        >
          <div>
            <strong>计算条件</strong>
            {onAdvancedOptionsOpen ? (
              <button onClick={onAdvancedOptionsOpen} type="button">
                调整
              </button>
            ) : null}
          </div>
          {activeAdvancedConditions.length > 0 ? <p>{activeAdvancedConditions.join(" · ")}</p> : null}
          {primary.gainSummary ? <p className="result-rail__gains"><span>增益来源</span><strong>{primary.gainSummary}</strong></p> : null}
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
