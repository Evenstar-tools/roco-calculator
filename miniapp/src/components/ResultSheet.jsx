import {
  Button,
  Input,
  ScrollView,
  Text,
  View,
} from "@tarojs/components";
import {
  clampResultPercent,
  resultTone,
} from "../view-models/result-presentation.js";
import ResultFormulaAudit from "./ResultFormulaAudit.jsx";
import SkillResultRows from "./SkillResultRows.jsx";

function settlementText(entry) {
  return [entry?.name ?? entry?.label, entry?.text ?? entry?.summary]
    .filter(Boolean)
    .join(" · ");
}

function DetailSection({ items, title, formatter = (value) => String(value) }) {
  if (!items?.length) return null;
  return (
    <View className="result-sheet__detail-section">
      <Text className="result-sheet__detail-title">{title}</Text>
      <View className="result-sheet__detail-list">
        {items.map((item, index) => (
          <Text className="result-sheet__detail-row" key={`${title}-${index}`}>
            {formatter(item)}
          </Text>
        ))}
      </View>
    </View>
  );
}

export default function ResultSheet({
  onClose,
  onSelectSkill,
  onSelectTrait,
  onTraitHitCountChange,
  open,
  selectedIndex,
  traitDamageHitCount = 1,
  view,
}) {
  if (!open) return null;

  const exact = view?.status === "exact";
  const result = view?.selectedResult;
  const damagePercent = Number.isFinite(result?.hpPercent)
    ? result.hpPercent
    : null;
  const damagePercentText = Number.isFinite(damagePercent)
    ? `${damagePercent.toFixed(1)}% HP`
    : "--% HP";
  const damageProgress = Number.isFinite(damagePercent)
    ? `${clampResultPercent(damagePercent)}%`
    : "0%";
  const damageTone = resultTone(damagePercent);
  const remainingHp = Number.isFinite(result?.remainingHp)
    ? result.remainingHp
    : "--";
  return (
    <View
      catchMove
      className="result-sheet__overlay"
      onClick={onClose}
    >
      <View
        aria-label="伤害结果"
        aria-modal="true"
        className="result-sheet"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <View className="result-sheet__header">
          <View className="result-sheet__heading">
            <Text className="result-sheet__title">伤害结果</Text>
            <View className="result-sheet__direction">
              <Text className="result-sheet__attacker">
                {view?.attackerName ?? "攻击方"}
              </Text>
              <Text aria-hidden="true" className="result-sheet__direction-arrow">
                →
              </Text>
              <Text className="result-sheet__defender">
                {view?.defenderName ?? "防守方"}
              </Text>
            </View>
          </View>
          <Button
            aria-label="关闭伤害结果"
            className="result-sheet__close"
            onClick={onClose}
          >
            关闭
          </Button>
        </View>
        <ScrollView
          className="result-sheet__scroll"
          scrollY
          showScrollbar
        >
          {exact ? (
            <>
              <View aria-label="伤害摘要" className="result-sheet__summary">
                <Text className="result-sheet__skill-name">
                  {result.skillName}
                </Text>
                {result.powerSummary ? (
                  <Text className="result-sheet__power-summary">
                    {result.powerSummary}
                  </Text>
                ) : null}
                <View className="result-sheet__primary">
                  <Text className="result-sheet__damage">
                    {result.totalDamage}
                  </Text>
                  <Text
                    className={`result-sheet__damage-percent result-sheet__damage-percent--${damageTone}`}
                  >
                    {damagePercentText}
                  </Text>
                  <Text className="result-sheet__remaining">
                    剩余 {remainingHp} HP
                  </Text>
                </View>
                <View
                  aria-label={Number.isFinite(damagePercent)
                    ? `伤害占目标生命 ${damagePercent.toFixed(1)}%`
                    : "伤害占目标生命待计算"}
                  className="result-sheet__health"
                  role="img"
                >
                  <View className="result-sheet__health-track">
                    <View
                      className={`result-sheet__health-fill result-sheet__health-fill--${damageTone}`}
                      style={{ width: damageProgress }}
                    />
                  </View>
                  <Text className="result-sheet__health-value">
                    {Number.isFinite(damagePercent)
                      ? `${damagePercent.toFixed(1)}%`
                      : "--"}
                  </Text>
                </View>
              </View>
              {view?.rows?.length > 1 ? (
                <View className="result-sheet__comparison">
                  <Text className="result-sheet__section-title">
                    技能结果
                  </Text>
                  <SkillResultRows
                    onSelect={onSelectSkill}
                    rows={view.rows}
                    selectedIndex={selectedIndex}
                  />
                </View>
              ) : null}
              {view?.traitResult ? (
                <View className="result-sheet__trait-result">
                  <Button
                    aria-label="选择特性伤害结果"
                    aria-pressed={view.selectedDamageSource === "trait"}
                    className={[
                      "result-sheet__trait-select",
                      view.selectedDamageSource === "trait"
                        ? "result-sheet__trait-select--selected"
                        : "",
                    ].filter(Boolean).join(" ")}
                    onClick={onSelectTrait}
                  >
                    <Text>特性伤害</Text>
                    <Text>
                      {view.traitResult.skillName ?? view.traitResult.name} · {view.traitResult.totalDamage ?? view.traitResult.damage}
                    </Text>
                  </Button>
                  <View className="result-sheet__trait-count">
                    <Text>触发次数</Text>
                    <Input
                      aria-label="特性伤害触发次数"
                      className="result-sheet__trait-count-input"
                      inputMode="numeric"
                      min="1"
                      onInput={(event) => {
                        const value = Number(
                          event?.detail?.value ?? event?.target?.value,
                        );
                        if (Number.isFinite(value)) {
                          onTraitHitCountChange?.(
                            Math.min(99, Math.max(1, Math.floor(value))),
                          );
                        }
                      }}
                      type="number"
                      value={traitDamageHitCount}
                    />
                  </View>
                </View>
              ) : null}
              {(result.markSettlements?.length || result.traitSettlements?.length) ? (
                <View className="result-sheet__audit-group">
                  <Text className="result-sheet__audit-title">结算明细</Text>
                  <DetailSection
                    formatter={settlementText}
                    items={result.markSettlements}
                    title="印记"
                  />
                  <DetailSection
                    formatter={settlementText}
                    items={result.traitSettlements}
                    title="特性"
                  />
                </View>
              ) : null}
              {result.warnings?.length ? (
                <View className="result-sheet__audit-group result-sheet__audit-group--warning">
                  <Text className="result-sheet__audit-title">计算提醒</Text>
                  <DetailSection items={result.warnings} title="提醒" />
                </View>
              ) : null}
              {result.formulaSteps?.length ? (
                <ResultFormulaAudit result={result} />
              ) : null}
            </>
          ) : (
            <View
              aria-label="计算未解析"
              className="result-sheet__unresolved"
            >
              <Text className="result-sheet__unresolved-title">
                伤害暂未解析
              </Text>
              <Text className="result-sheet__message">
                {view?.message}
              </Text>
            </View>
          )}
        </ScrollView>
        <Button
          aria-label="分享当前计算"
          className="result-sheet__share"
          openType="share"
        >
          分享当前计算
        </Button>
      </View>
    </View>
  );
}
