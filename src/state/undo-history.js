function normalizedRememberSides(value) {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value];
}

export function createUndoHistory({ limit = 50, coalesceMs = 400 } = {}) {
  let entries = [];
  let future = [];
  let restored = false;

  function record(state, {
    batchToken = null,
    groupKey = null,
    now = Date.now(),
    rememberSide = null,
  } = {}) {
    future = [];
    const last = entries.at(-1);
    const sameBatch = !restored && batchToken !== null && last?.batchToken === batchToken;
    const sameRapidControl = Boolean(
      !restored && groupKey &&
      last?.groupKey === groupKey &&
      now - last.timestamp <= coalesceMs,
    );
    restored = false;
    if (sameBatch || sameRapidControl) {
      for (const side of normalizedRememberSides(rememberSide)) {
        last.rememberSides.add(side);
      }
      last.timestamp = now;
      if (batchToken !== null) last.batchToken = batchToken;
      return entries.length;
    }

    entries.push({
      batchToken,
      groupKey,
      rememberSides: new Set(normalizedRememberSides(rememberSide)),
      state,
      timestamp: now,
    });
    if (entries.length > limit) entries = entries.slice(-limit);
    return entries.length;
  }

  function undo(currentState) {
    const entry = entries.pop();
    if (!entry) return null;
    if (currentState !== undefined) future.push({ ...entry, state: currentState });
    restored = true;
    return {
      rememberSides: [...entry.rememberSides],
      state: entry.state,
    };
  }

  return {
    clear() {
      entries = [];
      future = [];
      restored = false;
    },
    redo(currentState) {
      const entry = future.pop();
      if (!entry) return null;
      entries.push({ ...entry, state: currentState });
      restored = true;
      return { rememberSides: [...entry.rememberSides], state: entry.state };
    },
    redoSize() { return future.length; },
    record,
    size() {
      return entries.length;
    },
    undo,
  };
}
