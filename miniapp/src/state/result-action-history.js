function clone(value) {
  if (typeof globalThis.structuredClone === "function") {
    return globalThis.structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

const PRESENTATION_KEYS = Object.freeze([
  "selectedDamageSource",
  "selectedSkillIndex",
  "traitDamageHitCount",
]);

function battleState(value) {
  const projected = clone(value);
  for (const direction of Object.values(projected?.directions ?? {})) {
    for (const key of PRESENTATION_KEYS) delete direction[key];
  }
  return projected;
}

function sameState(left, right) {
  return JSON.stringify(battleState(left)) === JSON.stringify(battleState(right));
}

function restorePresentation(restoredState, currentState) {
  for (const [directionKey, currentDirection] of Object.entries(
    currentState?.directions ?? {},
  )) {
    const restoredDirection = restoredState?.directions?.[directionKey];
    if (!restoredDirection) continue;
    for (const key of PRESENTATION_KEYS) {
      if (Object.hasOwn(currentDirection, key)) {
        restoredDirection[key] = clone(currentDirection[key]);
      }
    }
  }
  return restoredState;
}

export function createResultActionRecord(actionKey, beforeState, afterState) {
  return {
    actionKey,
    afterState: clone(afterState),
    beforeState: clone(beforeState),
  };
}

export function restoreResultAction(currentState, record) {
  if (!record || !sameState(currentState, record.afterState)) {
    return {
      reason: "状态已变化，无法安全撤销；可在战斗条件中调整",
      restored: false,
      state: currentState,
    };
  }
  const restoredState = clone(record.beforeState);
  return {
    restored: true,
    state: restorePresentation(restoredState, currentState),
  };
}
