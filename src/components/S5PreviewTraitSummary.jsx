import { getS5PreviewTraitEvaluation } from "../domain/s5-preview-traits.js";
import { getS5PreviewTraitPresentation } from "../features/s5-preview/trait-presentation.js";

export function S5PreviewTraitSummary({ trait, role = "attacker", context = {}, owner = false }) {
  const presentation = getS5PreviewTraitPresentation(trait, role, { owner });
  if (!presentation?.visible) return null;
  const evaluation = getS5PreviewTraitEvaluation(trait?.previewTraitEntity, role, context);
  if (!evaluation) return null;
  const reason = evaluation.reason && evaluation.reason !== evaluation.summary
    ? evaluation.reason
    : null;
  const level = evaluation.calcStatus === "ready" ? evaluation.currentLevel : null;
  const hasLevel = Number.isSafeInteger(level) && level > 0;
  const incoming = evaluation.effects.find(effect => effect.kind === "incoming-damage-percent");
  const speedOnly = presentation.summaryScope === "speed";
  const speed = evaluation.effects.find(effect => effect.kind === "speed-flat");
  const summary = speedOnly ? (speed ? `速度 +${speed.amount}` : "速度无额外增益") : evaluation.summary;

  return (
    <div
      aria-label={`${role === "defender" ? "防御" : "攻击"}特性当前效果`}
      className="s5-preview-trait-summary"
      data-status={evaluation.calcStatus}
      data-level={hasLevel || undefined}
      role="status"
    >
      {hasLevel ? <>
        <span>当前等级 {level}</span>
        {incoming && (owner || role === "defender") ? <span>承伤 +{incoming.amount}%</span> : null}
      </> : <span>{summary}</span>}
      {reason ? <small>{reason}</small> : null}
    </div>
  );
}
