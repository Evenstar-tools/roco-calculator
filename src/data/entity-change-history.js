// These two sources describe the same Nov 5 release. Only retire the preview
// when the reviewed record covers every announced change; never fold dates.
// Called once by the reviewed importer, not by browser-side history merges.
export function deduplicateS5ChangeInfo(info) {
  if (!info) return info;
  const records = new Map([info, ...(info.history ?? [])]
    .map(({ history: _history, ...record }) => [record.patch?.id, record]));
  const announcement = records.get("s5-season-announcement-2026-11-05");
  const reviewed = records.get("s5-2026-10-31");
  if (!announcement?.items?.length || !reviewed?.items?.length) return info;
  if (![announcement, reviewed].every(({ patch }) => patch.seasonId === "S5"
    && (patch.displayDate ?? patch.date ?? "").replace(/\D/g, "") === "20261105")) return info;
  const equal = (left, right) => JSON.stringify(left) === JSON.stringify(right);
  const covered = announcement.items.every(item => {
    if (item.kind === "learnset") {
      const bloodline = item.label?.match(/^(.+)系血脉技能$/u)?.[1];
      const directions = ["before", "after"].filter(key => item[key] != null);
      return directions.length > 0 && directions.every(key => reviewed.items.some(candidate =>
        candidate.kind === "learnset" && equal(candidate[key], item[key])
        && (!bloodline || candidate.note?.includes(`${bloodline}血脉`))));
    }
    if (["stat", "mechanic", "trait"].includes(item.kind)) {
      const field = item.field ?? (item.kind === "trait" ? "traitDescription" : null);
      return field != null && reviewed.items.some(candidate => candidate.kind === item.kind
        && candidate.field === field && equal(candidate.before, item.before) && equal(candidate.after, item.after));
    }
    return reviewed.items.some(candidate => equal(candidate, item));
  });
  if (covered) {
    const ordered = [...records];
    records.clear();
    for (const [key, record] of ordered) {
      // Keep this release in the earliest of its two source positions, including
      // when the preview overlay is applied again after the reviewed import.
      if (key === announcement.patch.id) records.set(reviewed.patch.id, reviewed);
      else records.set(key, record);
    }
    const [latest, ...history] = records.values();
    return { ...latest, ...(history.length ? { history } : {}) };
  }
  return info;
}

function normalizeHpChangeInfo(info) {
  if (!info) return info;
  const items = info.items && [...new Map(info.items.map(item => {
    const canonical = item?.kind === "stat" && item.field === "hp" && item.label === "精力"
      ? { ...item, label: "生命" } : item;
    return [JSON.stringify(canonical), canonical];
  })).values()];
  const history = info.history?.map(normalizeHpChangeInfo);
  const unchanged = (!items || items.length === info.items.length && items.every((item, index) => item === info.items[index]))
    && (!history || history.every((record, index) => record === info.history[index]));
  return unchanged ? info : { ...info, ...(items && { items }), ...(history && { history }) };
}

// Keep every patch's own before/after and date. Latest fields remain at the top
// for existing callers; the original records stay reachable through history.
export function mergeEntityChangeInfo(previous, incoming) {
  previous = normalizeHpChangeInfo(previous);
  incoming = normalizeHpChangeInfo(incoming);
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
