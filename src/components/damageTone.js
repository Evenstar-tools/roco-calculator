export function damageTone(hpPercent) {
  if (!Number.isFinite(hpPercent)) return "pending";
  if (hpPercent < 20) return "safe";
  if (hpPercent <= 50) return "warning";
  return "danger";
}
