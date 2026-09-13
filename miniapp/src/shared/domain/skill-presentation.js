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


export function describeSkillUsage(result) {
  const usage = result?.usageSummary;
  if (!usage) return null;
  if (!(usage.count > 0) && !usage.historyIncomplete) return "未使用｜无增益";
  const signed = (value) => `${value >= 0 ? "+" : ""}${value}`;
  const count = usage.historyIncomplete
    ? `已记录×${usage.count}（此前次数未知）`
    : `已使用×${usage.count}`;
  const cap = usage.hitCountCapped ? `（连击已达上限${usage.hitCountLimit}）` : "";
  return `${count}｜增益：威力${signed(usage.powerGain)} · 连击${signed(usage.hitCountGain)}${cap}`;
}

export function skillUsageExplanation(result) {
  if (!result?.usageSummary) return undefined;
  return result.usageSummary.scope === "persistent"
    ? "本技能逐次施加的累计状态；连击增益仅用于声明连击的技能，并受最终连击上限约束。手动覆盖威力时，以当前公式为准。历史缺失时仅列已记录增益。"
    : "根据当前使用次数、分支和结算规则计算的累计增益；连击已按当前上限截取。";
}


export function skillUsageDetails(result) {
  const usage = result?.usageSummary;
  if (!usage) return [];
  const lines = [usage.scope === "persistent"
    ? "累计已生效：按每次使用时的条件记录；本次可得仅预览下一次，不与累计值再次相加。"
    : "累计已生效：复用配置区的此前使用次数与当前分支，按现有规则结算。"];
  if (usage.scope === "persistent") {
    for (const source of usage.sources ?? []) {
      lines.push(`来源：携带${source.types.join("、") || "未记录"}系；萌芽${source.sproutStacks}层；成功使用${source.count}次 → 威力+${source.powerGain} · 连击+${source.hitCountGain}`);
    }
    const recorded = (usage.sources ?? []).reduce((sum, source) => sum + source.count, 0);
    if (recorded < usage.count || usage.historyIncomplete) lines.push("此前来源或次数未记录，不按当前条件倒推。" );
    lines.push("折射无独立的累计威力/连击状态上限；次数来自成功点击，减少使用请用现有撤回，切换精灵会清空战斗状态。" );
  } else {
    for (const step of usage.ruleSteps ?? []) {
      if (Number.isFinite(Number(step.before)) && Number.isFinite(Number(step.after))) {
        lines.push(`来源：${step.label} ${step.before} → ${step.after}`);
      }
    }
  }
  if (!usage.hitCountEligible) lines.push("当前技能未声明连击或连击被特性固定，累计连击状态不额外增加本技能连击。" );
  if (Number.isFinite(usage.hitCountLimit)) lines.push(`当前技能最终连击上限：${usage.hitCountLimit}${usage.hitCountCapped ? "，已达上限" : ""}；这不是累计状态上限。`);
  if (usage.manualPower) lines.push("当前威力已手动覆盖，累计状态仍保留，伤害以当前公式为准。" );
  return lines;
}
