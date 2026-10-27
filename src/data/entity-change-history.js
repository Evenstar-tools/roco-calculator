// Keep every patch's own before/after and date. Latest fields remain at the top
// for existing callers; the original records stay reachable through history.
export function mergeEntityChangeInfo(previous, incoming) {
  if (!previous) return incoming;
  if (!incoming) return previous;
  const records = new Map();
  function append(info) {
    if (!info) return;
    const { history = [], ...record } = info;
    const key = record.patch?.id ?? `${record.patch?.label ?? ""}:${record.patch?.date ?? ""}`;
    const existing = records.get(key);
    records.set(key, existing ? {
      ...record, ...existing,
      items: [...new Map([...(existing.items ?? []), ...(record.items ?? [])]
        .map(item => [JSON.stringify(item), item])).values()],
    } : record);
    history.forEach(append);
  }
  append(incoming);
  append(previous);
  const [latest, ...history] = records.values();
  return { ...latest, ...(history.length ? { history } : {}) };
}
