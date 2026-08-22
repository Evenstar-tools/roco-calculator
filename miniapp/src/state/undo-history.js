function normalizedRememberSides(value) {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value];
}

export function createUndoHistory({ limit = 50, coalesceMs = 400 } = {}) {
  let entries = [];

  function record(state, {
    batchToken = null,
    groupKey = null,
    now = Date.now(),
    rememberSide = null,
  } = {}) {
    const last = entries.at(-1);
    const sameBatch = batchToken !== null && last?.batchToken === batchToken;
    const sameRapidControl = Boolean(
      groupKey &&
      last?.groupKey === groupKey &&
      now - last.timestamp <= coalesceMs,
    );
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

  function undo() {
    const entry = entries.pop();
    if (!entry) return null;
    return {
      rememberSides: [...entry.rememberSides],
      state: entry.state,
    };
  }

  return {
    clear() {
      entries = [];
    },
    record,
    size() {
      return entries.length;
    },
    undo,
  };
}
