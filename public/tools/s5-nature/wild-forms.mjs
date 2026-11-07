// Branches select only the defense source. Attack and HP always use the target's
// own race stats and strength stage, including when no defense branch is chosen.
export function resolveWildTarget(target, formId) {
  if (!target) return target;
  if (target.wildDataStatus === 'unavailable') {
    throw new RangeError('该精灵尚无已确认的奇遇资料，暂不能计算。');
  }
  if (formId === undefined || formId === null || formId === '') return target;
  if (typeof formId !== 'string') throw new RangeError('防御分支编号无效，请重新选择。');
  const form = target.wildStatForms?.find(row => row.id === formId);
  if (!form) throw new RangeError('防御分支不属于当前野怪，请重新选择。');
  return {
    ...target,
    wildDefenseRaceStats: form.defenseRaceStats,
    wildStatFormId: form.id,
    wildStatFormName: form.name,
  };
}

export function missingWildRaceReason(target, kind) {
  if (kind === 'defense' && target.wildStatForms?.length > 1 && !target.wildStatFormId) {
    return '请选择野怪的防御分支。';
  }
  return kind === 'attack' ? '该精灵的攻击来源资料缺失。' : '该精灵的三阶段双防资料缺失。';
}
