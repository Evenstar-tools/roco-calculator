import {
  Button,
  Input,
  ScrollView,
  Text,
  View,
} from "@tarojs/components";
import { useState } from "react";
import {
  damagePresentation,
  hasBurnPreview,
  statusLossText,
  resultTone,
} from "../view-models/result-presentation.js";
import ResultFormulaAudit from "./ResultFormulaAudit.jsx";
import ResultActionPanel from "./ResultActionPanel.jsx";
import ConditionSection from "./ConditionSection.jsx";
import SkillConditionEditor from "./SkillConditionEditor.jsx";
import SkillResultRows from "./SkillResultRows.jsx";
import SharePreviewSheet from "./SharePreviewSheet.jsx";
import TypeAnalysisPanel from "./TypeAnalysisPanel.jsx";
import DamageSegments from "./DamageSegments.jsx";

const STATUS_LABELS = Object.freeze({
  burn: "灼烧",
  electrified: "引电",
  freeze: "冻结",
  parasitism: "寄生",
  poison: "中毒",
});

function turnStatusText(phase, statusIds) {
  return statusIds
    .map((id) => {
      const stacks = Math.max(0, Number(phase?.stacks?.[id]) || 0);
      return stacks > 0 ? `${STATUS_LABELS[id]} ×${stacks}` : null;
    })
    .filter(Boolean)
    .join(" · ");
}

function turnLossText(phase) {
  return statusLossText(phase, phase?.breakdown?.find(entry => entry.id === "burn"));
}

function TurnStatusPreview({ current, preview }) {
  if (!hasBurnPreview(current)) return null;
  const statusIds = ["burn"];
  return (
    <View aria-label="回合状态预估" className="result-sheet__turn-preview" data-status="burn">
      {[
        ["本回合", current],
        ["下回合", preview.next],
      ].map(([label, phase]) => (
        <View className="result-sheet__turn-row" key={label}>
          <View className="result-sheet__turn-label">
            <Text>{label}</Text>
            {label === "下回合" && preview.repeated ? <Text>续用</Text> : null}
          </View>
          <Text className="result-sheet__turn-status">
            {turnStatusText(phase, statusIds)}
          </Text>
          <Text className="result-sheet__turn-loss">{turnLossText(phase)}</Text>
        </View>
      ))}
    </View>
  );
}

function settlementText(entry) {
  return [
    entry?.kind === "baron-greed" ? "贪得无厌" : entry?.name ?? entry?.label,
    entry?.lines?.length ? entry.lines.join("；") : entry?.text ?? entry?.summary,
  ]
    .filter(Boolean)
    .join(" · ");
}

function SettlementDetail({ entry }) {
  if (entry?.kind === "baron-greed" && entry?.lines?.length) {
    return (
      <View aria-label="贪得无厌结算" className="result-sheet__baron-settlement">
        <Text className="result-sheet__baron-title">贪得无厌</Text>
        {entry.lines.map((line, index) => (
          <Text className="result-sheet__baron-line" key={`baron-${index}`}>
            {line}
          </Text>
        ))}
      </View>
    );
  }
  return <Text className="result-sheet__detail-row">{settlementText(entry)}</Text>;
}

function DetailSection({
  items,
  title,
  formatter = (value) => String(value),
  renderItem,
}) {
  if (!items?.length) return null;
  return (
    <View className="result-sheet__detail-section">
      <Text className="result-sheet__detail-title">{title}</Text>
      <View className="result-sheet__detail-list">
        {items.map((item, index) => (
          <View key={`${title}-${index}`}>
            {renderItem ? renderItem(item) : (
              <Text className="result-sheet__detail-row">{formatter(item)}</Text>
            )}
          </View>
        ))}
      </View>
    </View>
  );
}

function NegativeStatusSettlement({ settlement }) {
  if (!settlement || settlement.skipped) return null;
  const entries = (settlement.breakdown ?? []).filter(
    (entry) => Number(entry?.stacks) > 0 && !(entry.id === "burn" && hasBurnPreview(settlement)),
  );
  const freeze = settlement.freeze;
  return (
    <View aria-label="负面状态结算" className="result-sheet__status-settlement">
      <View className="result-sheet__status-heading">
        <Text className="result-sheet__section-title">状态结算</Text>
      </View>
      {entries.map((entry) => (
        <View
          className="result-sheet__status-row"
          data-status={entry.id}
          key={entry.id}
        >
          <Text>{entry.label} ×{entry.stacks}{entry.id === "electrified" && entry.triggered ? " · 已触发" : ""}</Text>
          <Text>{statusLossText(settlement, entry)}</Text>
        </View>
      ))}
      {Number(freeze?.stacks) > 0 ? (
        <View className="result-sheet__status-row" data-status="freeze">
          <Text>冻结 ×{freeze.stacks}</Text>
          <Text>{freeze.immune ? "免疫" : `${Math.max(0, Number(freeze.thresholdPercent) || 0)}% 斩杀线`}</Text>
        </View>
      ) : null}
      {settlement.totalHealing > 0 ? <View className="result-sheet__status-row" data-status="parasitism">
        <Text>来源回复</Text><Text>+{settlement.totalHealing} HP</Text>
      </View> : null}
      {settlement.actualStatusDamage < settlement.statusDamage ? <Text className="result-sheet__status-note">
        异常合计 {settlement.statusDamage} HP，仅剩 {settlement.actualStatusDamage} HP 可扣
      </Text> : null}
      <TurnStatusPreview current={settlement} preview={settlement.turnPreview} />
    </View>
  );
}

function ResultSummary({
  damagePercent,
  damagePercentText,
  presentation,
  damageTone,
  remainingHp,
  result,
}) {
  return (
    <View aria-label="伤害摘要" className="result-sheet__summary">
      <Text className="result-sheet__skill-name">{result.skillName}</Text>
      {result.powerSummary ? (
        <Text className="result-sheet__power-summary">
          {result.powerSummary}
        </Text>
      ) : null}
      <View className="result-sheet__primary">
        <Text className="result-sheet__damage">{presentation.damage ?? "—"}</Text>
        <Text
          className={`result-sheet__damage-percent result-sheet__damage-percent--${damageTone}`}
        >
          {damagePercentText}
        </Text>
        <Text className="result-sheet__remaining">{presentation.outcome ?? `剩余 ${remainingHp} HP`}</Text>
      </View>
      <View
        aria-label={Number.isFinite(damagePercent)
          ? `伤害占目标生命 ${damagePercent.toFixed(1)}%`
          : "伤害占目标生命待计算"}
        className="result-sheet__health"
        role="img"
      >
        <View className="result-sheet__health-track">
          <DamageSegments presentation={presentation} className={`result-sheet__health-fill--${damageTone}`} />
        </View>
        <Text className="result-sheet__health-value">
          {Number.isFinite(damagePercent)
            ? `${damagePercent.toFixed(1)}%`
            : "--"}
        </Text>
      </View>
      {presentation.detail ? <Text className="result-sheet__coverage-detail">{presentation.detail}</Text> : null}
    </View>
  );
}

export default function ResultSheet({
  actions,
  activeActionKeys,
  actionFeedback,
  hiddenActionKeys,
  onClose,
  onApplyAction,
  onActionControlChange,
  onSkillConditionContextChange,
  onSkillConditionDirectionChange,
  onSelectBloodline,
  onSelectSkill,
  onSelectTrait,
  onTraitHitCountChange,
  open,
  selectedIndex,
  shareCompleteness = "full",
  shareSummary,
  showSkillConditions = false,
  showTypeAnalysis = false,
  skillConditionContext,
  skillConditionDirection,
  skillConditionPresentation,
  skillConditionSkill,
  skillConditionStatusActivation,
  traitDamageHitCount = 1,
  view,
}) {
  const [sharePreviewOpen, setSharePreviewOpen] = useState(false);

  if (!open) return null;

  const exact = view?.status === "exact";
  const result = view?.selectedResult;
  const presentation = damagePresentation(result);
  const damagePercent = presentation.percent;
  const damagePercentText = Number.isFinite(damagePercent)
    ? `${damagePercent.toFixed(1)}% ${presentation.freezePercent > 0 ? "覆盖" : "HP"}`
    : "--% HP";
  const damageTone = resultTone(damagePercent);
  const remainingHp = Number.isFinite(presentation.remainingHp)
    ? presentation.remainingHp
    : "--";
  return (
    <View className="result-sheet__overlay" onClick={onClose}>
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
          <View className="result-sheet__scroll-content">
          {exact ? (
            <ResultSummary
              damagePercent={damagePercent}
              damagePercentText={damagePercentText}
              presentation={presentation}
              damageTone={damageTone}
              remainingHp={remainingHp}
              result={result}
            />
          ) : null}
          {exact ? (
            <NegativeStatusSettlement
              settlement={result?.negativeStatusSettlement}
            />
          ) : null}
          {exact && view?.rows?.length > 1 ? (
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
          <ResultActionPanel
            actions={actions}
            activeActionKeys={activeActionKeys}
            feedback={actionFeedback}
            hiddenActionKeys={hiddenActionKeys}
            onApplyAction={onApplyAction}
            onControlChange={onActionControlChange}
            parameterContent={showSkillConditions ? (
              <SkillConditionEditor
                context={skillConditionContext}
                direction={skillConditionDirection}
                onContextChange={onSkillConditionContextChange}
                onDirectionChange={onSkillConditionDirectionChange}
                presentation={skillConditionPresentation}
                result={result}
                skill={skillConditionSkill}
                statusActivation={skillConditionStatusActivation}
              />
            ) : null}
            parameterSummary={skillConditionSkill?.name}
          />
          {result?.gainSummary ? (
            <View className="result-sheet__conditions" aria-label="计算条件">
              <Text className="result-sheet__section-title">计算条件</Text>
              <Text className="result-sheet__gains"><Text className="result-sheet__gain-label">增益来源</Text>　{result.gainSummary}</Text>
            </View>
          ) : null}
          {exact ? (
            <>
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
              {view?.bloodlineResult ? (
                <View className="result-sheet__trait-result">
                  <Button
                    aria-label="选择血脉魔法伤害结果"
                    aria-pressed={view.selectedDamageSource === "bloodline"}
                    className={[
                      "result-sheet__trait-select",
                      view.selectedDamageSource === "bloodline"
                        ? "result-sheet__trait-select--selected"
                        : "",
                    ].filter(Boolean).join(" ")}
                    onClick={onSelectBloodline}
                  >
                    <Text>血脉魔法</Text>
                    <Text>
                      {view.bloodlineResult.skillName} · {view.bloodlineResult.totalDamage}
                    </Text>
                  </Button>
                </View>
              ) : null}
              {(result.markSettlements?.length || result.traitSettlements?.length) ? (
                <View className="result-sheet__audit-group">
                  <Text className="result-sheet__audit-title">结算明细</Text>
                  <DetailSection
                    formatter={settlementText}
                    items={result.markSettlements}
                    renderItem={(entry) => <SettlementDetail entry={entry} />}
                    title="印记"
                  />
                  <DetailSection
                    formatter={settlementText}
                    items={result.traitSettlements}
                    renderItem={(entry) => <SettlementDetail entry={entry} />}
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
                {view?.message === "非伤害技能不计算伤害" ? "非伤害技能" : "伤害暂未解析"}
              </Text>
              <Text className="result-sheet__message">
                {view?.message}
              </Text>
            </View>
          )}
          {showTypeAnalysis && view?.typeAnalysis ? (
            <ConditionSection
              className="condition-section--type-analysis"
              summary={view.typeAnalysis.subjectName}
              title="属性分析"
            >
              <TypeAnalysisPanel analysis={view.typeAnalysis} />
            </ConditionSection>
          ) : null}
          </View>
        </ScrollView>
        <Button
          aria-label="预览并分享"
          className="result-sheet__share"
          hoverClass="button-hover"
          onClick={() => setSharePreviewOpen(true)}
        >
          预览并分享
        </Button>
        <SharePreviewSheet
          completeness={shareCompleteness}
          onClose={() => setSharePreviewOpen(false)}
          open={sharePreviewOpen}
          skillContext={skillConditionContext}
          skillDirection={skillConditionDirection}
          skillPresentation={skillConditionPresentation}
          summary={shareSummary}
          view={view}
        />
      </View>
    </View>
  );
}
