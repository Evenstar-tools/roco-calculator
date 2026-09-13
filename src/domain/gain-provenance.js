// 来源只解释已结算的数值，不参与伤害计算。
const FIELDS = ["fixedPowerAdd", "attackLevelStage", "defenseLevelStage",
  "magicalDefenseLevelStageAdd", "hitCountAdd", "hitCountPercentAdd",
  "attackerSpeedFlat", "defenderSpeedFlat", "lifestealPercent"];
const SLOTS = ["fixedPowerAddsBySlot", "skillPowerPercentAddsBySlot"];
const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const close = (a, b) => Math.abs(a - b) < 1e-8;
const unknown = (amount, kind = "unknown") => ({ kind, id: kind, name: kind === "manual" ? "手动" : "未记录", count: 0, amount });

function values(overrides = {}) {
  const result = Object.fromEntries(FIELDS.map((key) => [key, number(overrides[key])]));
  for (const key of SLOTS) {
    for (const [slot, value] of Object.entries(overrides[key] ?? {})) {
      if (/^[1-9]\d*$/u.test(slot)) result[`${key}.${slot}`] = number(value);
    }
  }
  return result;
}

export function sanitizeGainSources(value) {
  const result = {};
  for (const [field, entry] of Object.entries(value ?? {})) {
    if (!FIELDS.includes(field) && !SLOTS.some((key) => new RegExp(`^${key}\\.[1-9]\\d*$`, "u").test(field))) continue;
    if (!entry || !Number.isFinite(entry.value) || !Array.isArray(entry.sources)) continue;
    const sources = entry.sources.filter((source) => source &&
      ["skill", "trait", "manual", "unknown"].includes(source.kind) &&
      typeof source.id === "string" && typeof source.name === "string" &&
      Number.isSafeInteger(source.count) && source.count >= 0 && Number.isFinite(source.amount)
    ).map(({ kind, id, name, count, amount, transient }) => ({ kind, id, name, count, amount, ...(transient ? { transient: true } : {}) }));
    if (close(sources.reduce((sum, source) => sum + source.amount, 0), entry.value)) result[field] = { value: entry.value, sources };
  }
  return result;
}

export function gainSourcesFor(overrides, field, value) {
  if (!number(value)) return [];
  const entry = sanitizeGainSources(overrides?.gainSources)[field];
  return entry && close(entry.value, number(value)) ? entry.sources : [unknown(number(value))];
}

export function recordGainChanges(before, after, source) {
  for (const direction of ["forward", "reverse"]) {
    const previous = before.directions[direction].overrides ?? {};
    const current = after.directions[direction].overrides ?? {};
    const oldValues = values(previous);
    const nextValues = values(current);
    const ledger = { ...sanitizeGainSources(current.gainSources) };
    const count = 1 + Math.max(0, ...Object.values(sanitizeGainSources(previous.gainSources)).flatMap((entry) => entry.sources.filter((item) => item.id === source.id && item.kind === source.kind).map((item) => item.count)));
    for (const field of new Set([...Object.keys(oldValues), ...Object.keys(nextValues)])) {
      const oldValue = oldValues[field] ?? 0;
      const value = nextValues[field] ?? 0;
      if (close(oldValue, value)) continue;
      const sources = gainSourcesFor(previous, field, oldValue).map((item) => ({ ...item }));
      const transient = source.transient && field.startsWith("skillPowerPercentAddsBySlot.");
      const existing = sources.find((item) => item.id === source.id && item.kind === source.kind && Boolean(item.transient) === Boolean(transient));
      if (existing) { existing.amount += value - oldValue; existing.count = count; }
      else sources.push({ kind: source.kind, id: source.id, name: source.name, count, amount: value - oldValue, ...(transient ? { transient: true } : {}) });
      ledger[field] = { value, sources: value === 0 ? [] : sources.filter((item) => !close(item.amount, 0)) };
    }
    if (Object.keys(ledger).length) current.gainSources = ledger;
  }
  return after;
}

export function recordManualGainChanges(previous, current) {
  const oldValues = values(previous);
  const ledger = { ...sanitizeGainSources(current.gainSources) };
  for (const [field, value] of Object.entries(values(current))) {
    if (!close(value, oldValues[field] ?? 0)) ledger[field] = { value, sources: value ? [unknown(value, "manual")] : [] };
  }
  return Object.keys(ledger).length ? { ...current, gainSources: ledger } : current;
}

export function expireTransientGainSources(overrides) {
  const ledger = sanitizeGainSources(overrides.gainSources);
  for (const [field, entry] of Object.entries(ledger)) {
    const sources = entry.sources.filter((source) => !source.transient);
    if (sources.length !== entry.sources.length) ledger[field] = { sources, value: sources.reduce((sum, source) => sum + source.amount, 0) };
  }
  if (Object.keys(ledger).length) overrides.gainSources = ledger;
}

export function sourceLabel(source) {
  return `${source.name}${source.kind === "skill" && source.count > 0 ? `×${source.count}` : ""}`;
}

export function gainLabels(sources = []) {
  return [...new Set(sources.map(sourceLabel))].join(" · ");
}

export function gainTermLabel(label, sources = [], unit = "") {
  if (!sources.length) return label;
  return `${label} · ${sources.map((source) => `${source.amount > 0 ? "+" : ""}${Number(source.amount.toFixed(3))}${unit}（${sourceLabel(source)}）`).join(" · ")}`;
}

export function summarizeGains(groups) {
  const sources = new Map();
  for (const source of Object.values(groups).flat()) {
    if (!source.amount) continue;
    const key = `${source.kind}:${source.id}`;
    const previous = sources.get(key);
    if (!previous || source.count > previous.count) sources.set(key, source);
  }
  return gainLabels([...sources.values()]);
}

export function limitGainSources(sources, minimum, maximum) {
  const result = sources.map((source) => ({ ...source }));
  const total = result.reduce((sum, source) => sum + source.amount, 0);
  let excess = total - Math.min(maximum, Math.max(minimum, total));
  for (let index = result.length - 1; index >= 0 && !close(excess, 0); index -= 1) {
    const source = result[index];
    if (source.amount * excess <= 0) continue;
    const removed = Math.sign(excess) * Math.min(Math.abs(excess), Math.abs(source.amount));
    source.amount -= removed;
    excess -= removed;
  }
  return result.filter((source) => !close(source.amount, 0));
}
