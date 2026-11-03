import { getS5PreviewTraitEvaluation } from "../domain/s5-preview-traits.js";
import { getS5PreviewTraitPresentation } from "../features/s5-preview/trait-presentation.js";

// 等级输入框与摘要同排时，摘要只保留输入框表达不了的效果。
export const hasBattleLevelInput = (inputs) => (inputs ?? []).some((input) => input?.suffix === "BattleLevel" || /BattleLevel$/u.test(input?.contextKey ?? ""));

export function S5PreviewTraitSummary({ trait, role = "attacker", context = {}, owner = false, linked = false, levelInputShown = false }) {
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
  const physicalAttack = evaluation.effects.find(effect => effect.kind === "physical-attack-percent");
  const speedOnly = presentation.summaryScope === "speed";
  const speed = evaluation.effects.find(effect => effect.kind === "speed-flat");
  const summary = speedOnly ? (speed ? `速度 +${speed.amount}` : "") : evaluation.summary;

  if (!linked && evaluation.mechanicKey === "diliutun" && evaluation.calcStatus === "ready") return null;
  if (["lele-shark", "egg-wrap"].includes(evaluation.mechanicKey) && evaluation.calcStatus === "ready" && !evaluation.effects.length) return null;
  if (!hasLevel && !summary && !reason) return null;
  const showsPhysicalAttack = Boolean(physicalAttack && (owner || role === "attacker"));
  const showsIncoming = Boolean(incoming && (owner || role === "defender"));
  if (hasLevel && levelInputShown && !showsPhysicalAttack && !showsIncoming && !reason) return null;

  return (
    <div
      aria-label={`${role === "defender" ? "防御" : "攻击"}特性当前效果`}
      className="s5-preview-trait-summary"
      data-status={evaluation.calcStatus}
      data-level={hasLevel || undefined}
      role="status"
    >
      {hasLevel ? <>
        {levelInputShown ? null : <span>当前等级 {level}</span>}
        {showsPhysicalAttack ? <span>
          {evaluation.levelGain !== undefined ? `被动 ${evaluation.levelGain} 层 · ` : ""}物攻 +{physicalAttack.amount}%
        </span> : null}
        {showsIncoming ? <span>承伤 +{incoming.amount}%</span> : null}
      </> : <span>{summary}</span>}
      {reason ? <small>{reason}</small> : null}
    </div>
  );
}
