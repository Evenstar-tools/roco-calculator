import { getS5PreviewTraitEvaluation } from "../domain/s5-preview-traits.js";

export function S5PreviewTraitSummary({ trait, role = "attacker", context = {} }) {
  const evaluation = getS5PreviewTraitEvaluation(trait?.previewTraitEntity, role, context);
  if (!evaluation) return null;
  const reason = evaluation.reason && evaluation.reason !== evaluation.summary
    ? evaluation.reason
    : null;

  return (
    <div
      aria-label={`${role === "defender" ? "防御" : "攻击"}特性当前效果`}
      className="s5-preview-trait-summary"
      data-status={evaluation.calcStatus}
      role="status"
    >
      <span>{evaluation.summary}</span>
      {reason ? <small>{reason}</small> : null}
    </div>
  );
}
