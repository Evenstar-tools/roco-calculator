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

const STATUS_ACTION_DIRECTIONS = Object.freeze(["forward", "reverse"]);

function statusActionEntry(state, action) {
  if (!action || action.kind !== "skill") return null;
  const skills = state?.sides?.[action.side]?.skills;
  if (!skills) return null;
  return action.mode === "single"
    ? skills.single
    : skills.four?.[action.slotIndex];
}

function replaceStatusActionEntry(state, action, value) {
  const skills = state?.sides?.[action.side]?.skills;
  if (!skills) return;
  if (action.mode === "single") {
    skills.single = value;
    return;
  }
  skills.four[action.slotIndex] = value;
}

function stripStatusActionMarker(entry) {
  if (!entry || typeof entry !== "object") return entry;
  const next = clone(entry);
  delete next.statusAction;
  return next;
}

function statusActionDirectionSnapshot(direction = {}) {
  const snapshot = {
    context: clone(direction.context ?? {}),
    currentHp: direction.currentHp ?? null,
    finalDamageMultiplier: direction.finalDamageMultiplier ?? 1,
    hitCount: direction.hitCount ?? 1,
    overrides: clone(direction.overrides ?? {}),
    reduction: direction.reduction ?? 1,
    starfallStacks: direction.starfallStacks ?? 0,
  };
  if (
    Number.isInteger(direction.statusTriggerCount) &&
    direction.statusTriggerCount >= 1 &&
    direction.statusTriggerCount <= 99
  ) {
    snapshot.statusTriggerCount = direction.statusTriggerCount;
  }
  return snapshot;
}

function statusActionSnapshot(state) {
  return {
    directions: Object.fromEntries(
      STATUS_ACTION_DIRECTIONS.map((direction) => [
        direction,
        statusActionDirectionSnapshot(state?.directions?.[direction]),
      ]),
    ),
    marks: clone(state?.marks ?? {}),
  };
}

function sameSnapshot(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function statusActionMarker(state, action) {
  const entry = statusActionEntry(state, action);
  return entry && typeof entry === "object" && entry.statusAction &&
    typeof entry.statusAction === "object"
    ? entry.statusAction
    : null;
}

function restoreStatusActionSnapshot(state, snapshot) {
  for (const direction of STATUS_ACTION_DIRECTIONS) {
    const current = state?.directions?.[direction];
    const saved = snapshot?.directions?.[direction];
    if (!current || !saved) continue;
    state.directions[direction] = {
      ...current,
      ...saved,
      context: clone(saved.context ?? {}),
      overrides: clone(saved.overrides ?? {}),
    };
  }
  state.marks = clone(snapshot?.marks ?? state.marks ?? {});
}

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

export function persistStatusAction({ action, afterState, beforeState }) {
  if (!action || action.kind !== "skill") return afterState;
  const entry = statusActionEntry(afterState, action);
  if (!entry) return afterState;

  const nextState = clone(afterState);
  const nextEntry = statusActionEntry(nextState, action);
  const stableEntry = stripStatusActionMarker(nextEntry);
  replaceStatusActionEntry(nextState, action, {
    ...(stableEntry && typeof stableEntry === "object"
      ? stableEntry
      : { skillId: stableEntry }),
    statusAction: {
      actionKey: action.key,
      after: statusActionSnapshot(afterState),
      before: statusActionSnapshot(beforeState),
    },
  });
  return nextState;
}

export function hasPersistedStatusAction(state, action) {
  const marker = statusActionMarker(state, action);
  return marker?.actionKey === action?.key;
}

export function restorePersistedStatusAction(state, action) {
  const marker = statusActionMarker(state, action);
  if (
    !marker ||
    marker.actionKey !== action?.key ||
    !marker.before ||
    !marker.after ||
    !sameSnapshot(statusActionSnapshot(state), marker.after)
  ) {
    return null;
  }

  const beforeState = clone(state);
  restoreStatusActionSnapshot(beforeState, marker.before);
  replaceStatusActionEntry(
    beforeState,
    action,
    stripStatusActionMarker(statusActionEntry(beforeState, action)),
  );
  return createResultActionRecord(action.key, beforeState, clone(state));
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
