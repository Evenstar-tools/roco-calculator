export function describeSkillResolution(result) {
  const steps = result?.formulaSteps ?? [];
  const basePowerIndex = steps.findIndex(
    ({ label }) => label === "\u57fa\u7840\u5a01\u529b",
  );
  const skillRuleSteps =
    basePowerIndex >= 0 ? steps.slice(0, basePowerIndex) : steps;
  const step = skillRuleSteps.find(
    ({ before, after, source }) =>
      String(source).startsWith("reviewed-rule:") &&
      Number.isFinite(Number(before)) &&
      Number.isFinite(Number(after)) &&
      Number(before) !== Number(after),
  );
  if (!step) {
    const unchangedBranch = skillRuleSteps.find(
      ({ label, source }) =>
        String(source).startsWith("reviewed-rule:") &&
        String(label).includes("\u4f24\u5bb3\u4e0d\u53d8"),
    );
    return unchangedBranch?.label ?? null;
  }

  const before = Number(step.before);
  const after = Number(step.after);
  const source = String(step.source);
  if (
    source.includes("speed-defense-difference") &&
    Number.isFinite(Number(step.input?.attacker)) &&
    Number.isFinite(Number(step.input?.defender))
  ) {
    const metric = String(step.label).startsWith("\u7269\u9632")
      ? "\u7269\u9632"
      : "\u901f\u5ea6";
    return `${metric} ${Number(step.input.attacker)} \u2212 ${Number(step.input.defender)} = ${before} \u2192 \u5a01\u529b ${after}`;
  }
  if (
    source.includes("adjacent-displayed-power") &&
    step.input?.left &&
    step.input?.right
  ) {
    return `\u5de6 ${step.input.left.name} ${Number(step.input.left.power)}\uff5c\u53f3 ${step.input.right.name} ${Number(step.input.right.power)} \u2192 \u5a01\u529b ${after}`;
  }
  if (source.includes("mana-burst")) {
    return `${Number(step.input)} \u80fd\u91cf \u2192 \u5a01\u529b ${after}`;
  }
  if (source.includes("hit-count")) {
    return `${before} \u8fde\u51fb \u2192 ${after} \u8fde\u51fb`;
  }
  if (source.includes("multiplier") || source.includes("exponential")) {
    const multiplier = before === 0 ? 0 : after / before;
    return `${before} \u00d7 ${Number(multiplier.toFixed(2))} = ${after}`;
  }
  const difference = after - before;
  return `${before} ${difference >= 0 ? "+" : "\u2212"} ${Math.abs(difference)} = ${after}`;
}
