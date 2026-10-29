import { buildStarfallTemplateState, getStarfallSelection, withStarfallStacks } from "../domain/starfall-thresholds.js";

// Return the same transaction shape consumed by commitSession. It records one
// undo step without overwriting a personal saved spirit configuration.
export function applyStarfallThreshold({ snapshot, state, direction = "forward", selectedSkillIndex, spiritId, templateId, stacks } = {}) {
  const selection = getStarfallSelection(snapshot, state, direction, selectedSkillIndex);
  if (!selection?.selected) throw new TypeError("请选择要计算的技能");
  let next = state;
  if (spiritId || templateId) {
    if (!spiritId || !templateId) throw new TypeError("请同时指定目标与培养模板");
    next = buildStarfallTemplateState({ snapshot, state, direction, selectedSkillIndex, spiritId, templateId, ignoreTraits: false });
  }
  if (stacks !== undefined) next = withStarfallStacks(next, direction, stacks, selection.index);
  return { state: next, persistence: { rememberSide: null } };
}
