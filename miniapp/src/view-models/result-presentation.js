export function clampResultPercent(value) {
  return Math.min(100, Math.max(0, Number(value) || 0));
}

export function resultTone(percent) {
  if (!Number.isFinite(percent)) return "neutral";
  if (percent < 20) return "success";
  if (percent < 50) return "warning";
  return "danger";
}
