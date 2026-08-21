import { ArrowsLeftRight } from "@phosphor-icons/react";
import { damageTone } from "./damageTone.js";
import { HealthInput } from "./HealthInput.jsx";
import { TypeCoveragePanel } from "./TypeCoveragePanel.jsx";

function clampPercent(value) {
  return Math.min(100, Math.max(0, Number(value) || 0));
}

const STATUS_LABELS = {
  burn: "灼烧",
  freeze: "冻结",
  parasitism: "寄生",
  poison: "中毒",
  electrified: "引电",
};

function addedStatusEntries(settlement, compact = false) {
  return Object.entries(settlement?.added ?? {})
    .filter(([, stacks]) => Number(stacks) > 0)
    .map(([id, stacks]) =>
      ({
        id,
        label: compact
          ? `+${STATUS_LABELS[id]}${stacks}`
          : `+${STATUS_LABELS[id]} ${stacks}层`,
      }),
    );
}

function compactStatusSummary(settlement) {
  if (!settlement) return null;
  const breakdown = (settlement.breakdown ?? [])
    .filter((entry) => Number(entry.stacks) > 0 && Number(entry.damage) > 0)
    .map((entry) => `${STATUS_LABELS[entry.id]}×${entry.stacks}`);
  const parts = breakdown.length > 0
    ? breakdown
    : Object.entries(settlement.added ?? {})
        .filter(([, stacks]) => Number(stacks) > 0)
        .map(([id, stacks]) => `${STATUS_LABELS[id]}×${stacks}`);
  const freezeThreshold = Number(settlement.freeze?.thresholdPercent) || 0;
  const freezeThresholdHp = Number.isFinite(Number(settlement.freeze?.thresholdHp))
    ? Math.max(0, Number(settlement.freeze.thresholdHp))
    : Math.floor((Number(settlement.maxHp) || 0) * freezeThreshold / 100);
  if (freezeThreshold > 0) {
    parts.push(freezeThresholdHp > 0 ? `斩杀≤${freezeThresholdHp}HP` : `斩杀线${freezeThreshold}%`);
  }
  return parts.join(" · ") || null;
}

function turnStatusText(phase, statusIds) {
  return statusIds
    .map((id) => {
      const stacks = Math.max(0, Number(phase?.stacks?.[id]) || 0);
      if (stacks <= 0) return null;
      return `${STATUS_LABELS[id]} ×${stacks}`;
    })
    .filter(Boolean)
    .join(" · ");
}

function turnLossText(phase) {
  const actualStatusDamage = Math.max(
    0,
    Number(phase?.actualStatusDamage) || 0,
  );
  const maxHp = Math.max(1, Number(phase?.maxHp) || 1);
  if (actualStatusDamage > 0) {
    return `${(actualStatusDamage / maxHp * 100).toFixed(1)}% · ${actualStatusDamage} HP`;
  }
  const threshold = Math.max(0, Number(phase?.freeze?.thresholdPercent) || 0);
  return threshold > 0 ? `冻结线 ${threshold}%` : "不扣血";
}

function TurnStatusPreview({ current, preview }) {
  if (!preview?.next) return null;
  const statusIds = (preview.focusStatusIds ?? []).filter(
    (id) => STATUS_LABELS[id],
  );
  if (statusIds.length === 0) return null;
  const rows = [
    {
      amount: turnLossText(current),
      label: "本回合",
      phase: current,
    },
    {
      amount: turnLossText(preview.next),
      label: "下回合",
      phase: preview.next,
    },
  ];
  return (
    <section
      aria-label="回合状态预估"
      className="result-rail__turn-preview"
      data-status={statusIds[0]}
    >
      {rows.map((row) => (
        <div className="result-rail__turn-row" key={row.label}>
          <span>
            {row.label}
            {row.label === "下回合" && preview.repeated ? (
              <em>续用</em>
            ) : null}
          </span>
          <b>{turnStatusText(row.phase, statusIds)}</b>
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
  const meterEntries = (settlement.breakdown ?? []).filter(
    (entry) => entry.stacks > 0 && entry.damage > 0,
  );
  const statusDamage = Math.max(0, Number(settlement.statusDamage) || 0);
  const freezeThreshold = Math.max(
    0,
    Number(settlement.freeze?.thresholdPercent) || 0,
  );
  const freezeThresholdHp = Number.isFinite(Number(settlement.freeze?.thresholdHp))
    ? Math.max(0, Math.floor(Number(settlement.freeze.thresholdHp)))
    : Math.floor(maxHp * freezeThreshold / 100);
  const hasFreeze = Number(settlement.freeze?.stacks) > 0;
  const meterLabel = [
    actualStatusDamage > 0 ? `状态实际追加 ${actualStatusDamage} HP` : null,
    freezeThreshold > 0
      ? `冻结斩杀阈值 ${freezeThreshold}%，等效不高于 ${freezeThresholdHp} HP，不额外扣血`
      : null,
  ].filter(Boolean).join("；");
  return (
    <section
      aria-label="负面状态结算"
      className="result-rail__status-settlement"
    >
      <header>
        <strong>状态结算</strong>
      </header>
      {meterEntries.length > 0 || hasFreeze ? (
        <div
          aria-label={meterLabel || "负面状态生命影响"}
          className="result-rail__status-meter"
          role="img"
        >
          {freezeThreshold > 0 ? (
            <span
              className="result-rail__status-threshold"
              data-status="freeze"
              style={{ width: `${Math.min(100, freezeThreshold)}%` }}
            />
          ) : null}
          {meterEntries.map((entry) => (
            <span
              data-status={entry.id}
              key={entry.id}
              style={{
                width: `${Math.min(
                  100,
                  (entry.damage * (statusDamage > 0 ? actualStatusDamage / statusDamage : 0)) /
                    maxHp * 100,
                )}%`,
              }}
            />
          ))}
          {freezeThreshold > 0 && meterEntries.length > 0 ? (
            <i
              data-status="freeze"
              style={{ left: `${freezeThreshold}%` }}
            />
          ) : null}
        </div>
      ) : null}
      {!settlement.turnPreview ? settlement.breakdown?.map((entry) =>
        entry.stacks > 0 ? (
          <div className="result-rail__status-row" data-status={entry.id} key={entry.id}>
            <span className="result-rail__status-name">
              {STATUS_LABELS[entry.id]} ×{entry.stacks}
              {entry.id === "electrified" && entry.triggered ? " · 已触发" : ""}
            </span>
            <strong>
              {entry.immune
                ? "免疫"
                : `${(entry.damage / maxHp * 100).toFixed(1)}% · ${entry.damage} HP`}
            </strong>
            {entry.id === "parasitism" && entry.healing > 0 ? (
              <small className="result-rail__status-note">回复 +{entry.healing}</small>
            ) : null}
          </div>
        ) : null,
      ) : null}
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
      (Number(settlement.directDamage) > 0 ||
        actualStatusDamage !== Number(settlement.statusDamage)) ? (
        <footer>
          <strong>
            {Number(settlement.directDamage) > 0 ? "合计" : "实际扣血"}{" "}
            {settlement.combinedHpLoss} HP
          </strong>
          <span>{settlement.outcome}</span>
        </footer>
      ) : settlement.freeze?.lethal === true ? (
        <footer>
          <strong>触发冻结斩杀</strong>
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
  const statusDamage = Number(
    item.negativeStatusSettlement?.actualStatusDamage,
  );
  const statusPercent = item.statusOnly && statusDamage > 0
    ? statusDamage /
      Math.max(1, Number(item.negativeStatusSettlement.maxHp) || 1) * 100
    : item.statusOnly ? Number.NaN : null;
  const displayPercent = item.statusOnly
    ? statusPercent
    : Number.isFinite(statusPercent) ? statusPercent : item.hpPercent;
  return (
    <Tag
      {...(onClick
        ? {
            "aria-label": `查看${item.name}伤害`,
            onClick,
            type: "button",
          }
        : {})}
      className={`skill-result-row${isTrait || isBloodline ? " skill-result-row--trait" : ""}${onClick ? " skill-result-row--action" : ""}${item.selected ? " is-selected" : ""}`}
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
      <span className="skill-result-row__bar" aria-hidden="true">
        <span style={{ width: `${clampPercent(displayPercent)}%` }} />
      </span>
      <strong>
        {Number.isFinite(displayPercent)
          ? `${displayPercent.toFixed(1)}%`
            : "—"}
      </strong>
    </Tag>
  );
}

export function ResultRail({
  onBloodlineResultFocus,
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
  const isStatusOnly = isExact && primary.statusOnly === true;
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

      {!isStatusOnly ? (
        <>
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
        </>
      ) : null}

      {isExact && primary.warnings?.length > 0 ? (
        <p className="result-rail__warning">{primary.warnings.join("；")}</p>
      ) : null}

      <NegativeStatusSettlement settlement={primary.negativeStatusSettlement} />

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
            <SkillResultRow index={index} item={skill} key={`${skill.id}-${index}`} />
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
