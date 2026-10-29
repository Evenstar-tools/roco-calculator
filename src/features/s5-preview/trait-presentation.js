const ATTACKER_ONLY = new Set([
  "gold-vein-dragon", "underground-silver-dragon", "little-scissor", "lele-shark",
  "boss-glass-jellyfish", "jingyu", "doulie", "watermelon-bug", "crab-coconut", "lily-of-valley", "diliutun",
]);

/** A read-only UI projection; runtime inputs and persisted owner values stay complete. */
export function getS5PreviewTraitPresentation(traitView, role = "attacker", { owner = false } = {}) {
  const identity = traitView?.previewTraitEntity?.previewIdentity;
  if (typeof identity?.catalogId !== "string" || !/^s5(?:[-_:]|$)/iu.test(identity.catalogId)) return null;
  const inputs = traitView.inputs ?? [];
  if (owner || role !== "defender") return { visible: true, inputs, summaryScope: "full" };
  if (ATTACKER_ONLY.has(identity.mechanicKey)) return { visible: false, inputs: [], summaryScope: "full" };
  if (identity.mechanicKey === "boss-ice-bruce") {
    return { visible: true, inputs: inputs.filter(input => input.contextKey?.endsWith("S5OpponentTotalCost")), summaryScope: "speed" };
  }
  // 等级影响双向面板；蛋包蛋的双防也参与自身物防差等技能，进攻时仍需展示。
  // 骰子目前只由出招方发起；双方效果映射继续由运行时保留 pending。
  // 未知机制不推定角色，保留双向入口和原有 pending 说明。
  return { visible: true, inputs, summaryScope: "full" };
}
