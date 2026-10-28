import { useCalculatorLocale } from "../i18n/calculator-text.js";
import { ArrowsLeftRight } from "@phosphor-icons/react";
import { damageTone } from "./damageTone.js";
import { HealthInput } from "./HealthInput.jsx";
import { TypeCoveragePanel } from "./TypeCoveragePanel.jsx";
import { damagePresentation, DamageSegments } from "./damagePresentation.jsx";
import { compactStatusSummary, hasBurnPreview, statusLossText } from "../domain/result-presentation.js";

const STATUS_LABELS = {
  burn: "灼烧",
  freeze: "冻结",
  parasitism: "寄生",
  poison: "中毒",
  electrified: "引电",
};

function burnLossText(phase) {
  const burn = phase?.breakdown?.find((entry) => entry.id === "burn");
  return statusLossText(phase, burn);
}

function TurnStatusPreview({ current, preview, onRepeatChange, repeated }) {
  const { tc } = useCalculatorLocale();
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
      aria-label={tc("回合状态预估")}
      className="result-rail__turn-preview"
      data-status="burn"
    >
      {onRepeatChange ? <label className="result-rail__repeat">
        <input type="checkbox" checked={repeated === true}
          onChange={(event) => onRepeatChange(event.target.checked)} />{tc("下回合继续此技能 ")}</label> : null}
      {rows.map((row) => (
        <div className="result-rail__turn-row" key={row.label}>
          <span>
            {tc(row.label)}
            {row.label === "下回合" && preview.repeated ? (
              <em>{tc("续用")}</em>
            ) : null}
          </span>
          <b>{tc("灼烧 ×")}{tc(Math.max(0, Number(row.phase.stacks?.burn) || 0))}</b>
          <strong>{tc(row.amount)}</strong>
        </div>
      ))}
    </section>
  );
}

function NegativeStatusSettlement({ settlement, onRepeatChange, repeated }) {
  const { tc } = useCalculatorLocale();
  if (!settlement || settlement.skipped === "direct-ko") return null;
  if (!settlement.breakdown?.some((entry) => entry.stacks > 0) &&
      !(settlement.freeze?.stacks > 0) && !(Number(settlement.totalHealing) > 0)) return null;
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
      aria-label={tc("负面状态结算")}
      className="result-rail__status-settlement"
    >
      <header>
        <strong>{tc("状态结算")}</strong>
      </header>
      {settlement.breakdown?.map((entry) =>
        entry.stacks > 0 && !(entry.id === "burn" && hasBurnPreview(settlement)) ? (
          <div className="result-rail__status-row" data-status={entry.id} key={entry.id}>
            <span className="result-rail__status-name">
              {tc(STATUS_LABELS[entry.id])} ×{tc(entry.stacks)}
              {entry.id === "electrified" && entry.triggered ? tc(" · 已触发") : tc("")}
            </span>
            <strong>
              {tc(statusLossText(settlement, entry))}
            </strong>
          </div>
        ) : null,
      )}
      {settlement.freeze?.stacks > 0 ? (
        <div className="result-rail__status-row" data-status="freeze">
          <span className="result-rail__status-name">{tc("冻结 ×")}{tc(settlement.freeze.stacks)}
          </span>
          <strong>
            {settlement.freeze.immune ? tc("免疫") : tc("{v0}% 斩杀线", { v0: settlement.freeze.thresholdPercent })}
          </strong>
          {!settlement.freeze.immune ? (
            <small className="result-rail__status-note">
              ≤{tc(freezeThresholdHp)}{tc(" HP · 不额外扣血 ")}</small>
          ) : null}
        </div>
      ) : null}
      {Number(settlement.totalHealing) > 0 ? (
        <div className="result-rail__status-row">
          <span>{tc("来源回复")}</span>
          <strong>+{tc(settlement.totalHealing)} HP</strong>
        </div>
      ) : null}
      {actualStatusDamage > 0 &&
      (Number(settlement.directDamage) === 0 ||
        actualStatusDamage !== Number(settlement.statusDamage)) ? (
        <footer>
          <strong>
            {actualStatusDamage < Number(settlement.statusDamage) ? tc("异常合计 {v0} HP", { v0: settlement.statusDamage }) : tc("实际扣血 {v0} HP", { v0: actualStatusDamage })}
          </strong>
          <span>{settlement.actualStatusDamage < settlement.statusDamage ? tc("仅剩 {v0} HP 可扣", { v0: settlement.actualStatusDamage }) : settlement.remainingHp === 0 ? tc("负面状态击倒") : tc(settlement.outcome)}</span>
        </footer>
      ) : null}
      <TurnStatusPreview
        current={settlement}
        preview={settlement.turnPreview}
        onRepeatChange={onRepeatChange}
        repeated={repeated}
      />
    </section>
  );
}

function SkillResultRow({ index, item, onClick }) {
  const { tc, entityName } = useCalculatorLocale();
  const isTrait = item.kind === "trait";
  const isBloodline = item.kind === "bloodline";
  const displayName = isBloodline ? tc(item.name) : entityName(isTrait ? "trait" : "skill", { id: item.skillId, name: item.name });
  const Tag = onClick ? "button" : "div";
  const statusSummary = compactStatusSummary(item.negativeStatusSettlement);
  const presentation = damagePresentation(item);
  const displayPercent = presentation.percent;
  const displayDamage = presentation.damage;
  return (
    <Tag
      {...(onClick
        ? {
            "aria-label": tc("查看{v0}伤害", { v0: displayName }),
            onClick,
            type: "button",
          }
        : {})}
      className={`skill-result-row${isTrait || isBloodline ? " skill-result-row--trait" : ""}${onClick ? " skill-result-row--action" : ""}${item.selected ? " is-selected" : ""}`}
      data-tone={damageTone(displayPercent)}
    >
      <span className={`skill-result-row__index${isTrait || isBloodline ? " skill-result-row__index--trait" : ""}`}>
        {isTrait ? tc("特") : isBloodline ? tc("血") : tc(index + 1)}
      </span>
      <span className={`skill-result-row__name${isTrait || isBloodline ? " skill-result-row__name--trait" : ""}`}>
        <span>{displayName}</span>
        {isBloodline ? <small>{tc("血脉")}</small> : null}
        {isTrait ? (
          <>
            <small aria-hidden="true">{tc("特性")}</small>
            <span className="sr-only">{tc("特性造成伤害")}</span>
          </>
        ) : null}
      </span>
      <span className="skill-result-row__bar" aria-hidden="true" title={tc(presentation.detail ?? undefined)}>
        <DamageSegments presentation={presentation} />
      </span>
      <span
        aria-label={tc("{v0}实际伤害", { v0: displayName })}
        className="skill-result-row__damage"
      >
        {tc(displayDamage ?? "—")}
      </span>
      <strong aria-label={tc("{v0}生命百分比", { v0: displayName })} title={tc(presentation.detail ?? undefined)}>
        {Number.isFinite(displayPercent) ? tc(`${displayPercent.toFixed(1)}%`) : tc("—")}
      </strong>
      {statusSummary ? (
        <small className="skill-result-row__status">
          {statusSummary.map((part) => <span key={part}>{tc(part)}</span>)}
        </small>
      ) : null}
    </Tag>
  );
}

export function ResultRail({
  hasCustomRaceStats = false,
  activeAdvancedConditions = [],
  onBloodlineResultFocus,
  onAdvancedOptionsOpen,
  onCurrentHpChange,
  onCurrentHpPercentChange,
  onHpInputModeChange,
  onDirectionToggle,
  onSkillResultSelect,
  onNegativeStatusRepeatChange,
  onOpenComparison,
  result,
  showTypeCoverage = false,
}) {
  const { tc, locale, entityName } = useCalculatorLocale();
  const primary = result.selectedResult;
  const isExact =
    primary.status === "exact" &&
    Number.isFinite(primary.totalDamage) &&
    Number.isFinite(primary.hpPercent);
  const isStatusOnly = isExact && primary.statusOnly === true;
  const presentation = damagePresentation(primary);
  const showPrimaryResult = !isStatusOnly || presentation.statusDamage > 0;
  const percentText = isExact ? `${presentation.percent.toFixed(1)}%${presentation.freezePercent > 0 ? "" : " HP"}` : primary.reason === "非伤害技能不计算伤害" ? "非伤害技能" : "待补充条件";
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
    <aside aria-label={tc("伤害结果")} className="result-rail">
      <div className="result-rail__heading">
        <div>
          <p className="result-rail__matchup">
            <strong className="result-rail__attacker">{entityName("spirit", { name: result.attackerName })}</strong>
            <span aria-hidden="true">→</span>
            <strong className="result-rail__defender">{entityName("spirit", { name: result.defenderName })}</strong>
          </p>
          <p className="result-rail__skill">{tc(entityName(primary.sourceKind === "trait" ? "trait" : "skill", { name: result.selectedSkillName }))}</p>
        </div>
        {onDirectionToggle ? (
          <button
            aria-label={tc("切换计算方向")}
            className="result-rail__direction"
            onClick={onDirectionToggle}
            title={tc("切换计算方向")}
            type="button"
          >
            <ArrowsLeftRight aria-hidden="true" size={20} weight="bold" />
          </button>
        ) : null}
      </div>

      {showPrimaryResult ? (
        <>
          <div className="result-rail__primary">
            <p className="result-rail__damage-label">{presentation.statusDamage > 0 ? tc("本次合计伤害") : tc("单次伤害")}</p>
            <output className="result-rail__damage" data-testid="primary-damage">
              {isExact ? tc(presentation.damage) : tc("—")}
            </output>
            <p className="result-rail__percent" data-status={primary.reason}>{tc(percentText)}</p>
            <p className="result-rail__lethal">
              {tc(outcomeText)}
              {koHits !== null ? (
                <span className="result-rail__ko-hint">{tc(koHits)}{tc(" 次可击倒")}</span>
              ) : null}
            </p>
          </div>

          {result.levelComparison ? <details className="result-level-comparison" aria-label={tc("等级伤害对比")}>
            <summary>
              <span>{tc(result.levelComparison.attackerLevel)}{tc("级 → ")}{tc(result.levelComparison.defenderLevel)}{tc("级")}</span>
              <span>{tc("较双60级 ")}<strong>{Number.isFinite(result.levelComparison.percent) ? tc(`${result.levelComparison.percent > 0 ? "+" : ""}${result.levelComparison.percent}%`) : tc("—")}</strong></span>
            </summary>
            <p>{tc("伤害：双60级 ")}<b>{tc(result.levelComparison.baselineDamage)}</b>{tc(" → 当前 ")}<b>{tc(result.levelComparison.currentDamage)}</b></p>
            <p>{tc("含等级系数、面板与等级触发效果；双方血量比例不变。")}</p>
            {result.levelComparison.status === "zero-baseline" ? <p>{tc("基准伤害为0，不计算百分比。")}</p> : null}
            <p>{tc("非60级面板按预览规则试算。")}</p>
          </details> : null}

        </>
      ) : null}

      <div
        aria-label={isExact ? tc(presentation.detail ?? `伤害占最大生命 ${primary.hpPercent.toFixed(1)}%`) : tc("伤害待计算")}
        className="damage-bar"
        role="img"
      >
        <DamageSegments className="damage-bar__fill" presentation={presentation} />
        <span className="damage-bar__label">
          {isExact ? tc(`${presentation.percent.toFixed(1)}%`) : tc("—")}
        </span>
      </div>
      {isExact && presentation.detail ? (
        <p className="result-rail__coverage-detail">{tc(presentation.detail)}</p>
      ) : null}
      {!showPrimaryResult && presentation.lethal ? (
        <p className="result-rail__lethal">{tc(presentation.outcome)}</p>
      ) : null}

      {isExact && primary.warnings?.length > 0 ? (
        <p className="result-rail__warning">{tc(primary.warnings.join("；"))}</p>
      ) : null}

      <NegativeStatusSettlement settlement={primary.negativeStatusSettlement}
        onRepeatChange={primary.negativeStatusCanRepeatNextTurn ? onNegativeStatusRepeatChange : undefined}
        repeated={primary.negativeStatusRepeatNextTurn} />
      {onOpenComparison ? <button type="button" className="damage-comparison-entry" onClick={onOpenComparison}>{hasCustomRaceStats ? tc("查看全精灵承伤（官方值）") : tc("查看全精灵承伤")}</button> : null}

      {primary.markSettlements?.length > 0 ? (
        <section aria-label={tc("印记结算")} className="result-rail__marks">
          {primary.markSettlements.map((settlement, index) => (
            <div
              data-side={settlement.side}
              data-status={settlement.status}
              key={`${settlement.side}-${settlement.markId}-${index}`}
            >
              <b>
                {settlement.side === "attacker" ? tc("进攻方") : tc("防御方")}
              </b>
              <span>{tc(settlement.text)}</span>
            </div>
          ))}
        </section>
      ) : null}

      {primary.traitSettlements?.length > 0 ? (
        <section aria-label={tc("特性结算")} className="result-rail__traits">
          {primary.traitSettlements.map((settlement, index) => (
            <div
              data-kind={settlement.kind}
              data-side={settlement.side}
              data-status={settlement.status}
              key={`${settlement.traitId}-${settlement.bloodlineType}-${index}`}
            >
              <b>
                {settlement.kind === "baron-greed" ? tc("贪得无厌") : settlement.side === "attacker" ? tc("进攻方") : tc("防御方")}
              </b>
              {settlement.lines?.length ? (
                <div className="result-rail__trait-lines">
                  {settlement.lines.map((line) => <span key={line}>{tc(line)}</span>)}
                </div>
              ) : (
                <span>{tc(settlement.text)}</span>
              )}
            </div>
          ))}
        </section>
      ) : null}

      {onCurrentHpChange ? (
        <div className="result-rail__hp-control">
          <span>{tc("目标 HP")}</span>
          <HealthInput
            currentHp={result.defenderHp}
            label="防御方"
            maxHp={result.defenderMaxHp}
            onCurrentHpChange={onCurrentHpChange}
            onPercentChange={onCurrentHpPercentChange}
            onInputModeChange={onHpInputModeChange}
            percentValue={result.defenderHpPercent}
          />
          <button
            aria-label={tc("恢复满血")}
            onClick={() => {
              onHpInputModeChange?.("percent");
              onCurrentHpChange(result.defenderMaxHp);
              onCurrentHpPercentChange?.(100);
            }}
            title={tc("恢复满血")}
            type="button"
          >{tc("满 ")}</button>
        </div>
      ) : null}

      {result.mode === "four" ? (
        <section aria-label={tc("技能结果")} className="skill-result-list">
          <h2>{tc("技能结果")}</h2>
          <div aria-hidden="true" className="skill-result-list__columns">
            <span>{tc("伤害")}</span>
            <span>{locale === "zh-CN" ? tc("占比") : tc("生命占比")}</span>
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
          aria-label={tc("当前非默认高级条件")}
          className="result-rail__active-conditions"
        >
          <div>
            <strong>{tc("计算条件")}</strong>
            {onAdvancedOptionsOpen ? (
              <button onClick={onAdvancedOptionsOpen} type="button">{tc("调整 ")}</button>
            ) : null}
          </div>
          {activeAdvancedConditions.length > 0 ? <p>{tc(activeAdvancedConditions.join(" · "))}</p> : null}
          {primary.gainSummary ? <p className="result-rail__gains"><span>{tc("增益来源")}</span><strong>{tc(primary.gainSummary)}</strong></p> : null}
        </section>
      ) : null}

      {showTypeCoverage ? (
        <TypeCoveragePanel analysis={result.typeAnalysis} />
      ) : null}

      {primary.choiceTraitSequence?.text ? (
        <p
          aria-label={tc("选择特性结算")}
          className="result-rail__choice-sequence"
          role="status"
        >
          {tc(primary.choiceTraitSequence.text)}
        </p>
      ) : null}

    </aside>
  );
}
