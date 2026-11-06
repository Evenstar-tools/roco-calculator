// 己方特性结算，口径与计算器 src/domain/trait-effects.js 的 resolveTraitEffectRule 一致：
// 攻防百分比按能力等级（每级10%）换算，正等级面板 = floor(面板 × (100 + 10×等级) / 100)。
// 野怪特性永远不参与伤害，这里只处理己方。

const NEUTRAL = Object.freeze({
  attackStage: 0, defenseStage: 0, powerMultiplier: 1, fixedPowerAdd: 0,
  finalDamageMultiplier: 1, damageReductionMultiplier: 1,
});

export function traitInfo(traitCatalog, traitName) {
  const row = traitCatalog?.traits?.[traitName];
  if (!row) return { damage: 'none', attacker: null, defender: null };
  return { damage: row.damage, attacker: row.attacker ?? null, defender: row.defender ?? null };
}

/** 统一的输入项：层数（数字）或触发开关（勾选），两个方向共用同一状态。 */
export function traitControls(info) {
  const rules = [info?.attacker, info?.defender].filter(Boolean);
  const stack = rules.find(rule => rule.stack && !rule.automaticStack)?.stack ?? null;
  const condition = rules.find(rule => rule.condition)?.condition ?? null;
  const automatic = rules.find(rule => rule.automaticStack)?.automaticStack ?? null;
  return { stack, condition, automatic };
}

// 固定CN源 skill-result/numeric.js 限制能力等级为[-99,99]；本模块只导出正向增益。
const clampStage = stage => Math.min(99, Math.max(0, stage));

function stageAdjusted(value, stage) {
  return Math.floor(value * (100 + clampStage(stage) * 10) / 100);
}

/**
 * role: 'attacker'（我方出招）或 'defender'（我方受击）。
 * state: { stacks, active }；automaticStack 由 skillTypes 自动计数。
 */
export function resolveOwnTrait(info, role, state = {}, skill = {}, skillTypes = []) {
  const rule = role === 'defender' ? info?.defender : info?.attacker;
  if (!rule || info?.damage !== 'applied') return { ...NEUTRAL };
  if (Array.isArray(rule.categories) && !rule.categories.includes(skill.category)) return { ...NEUTRAL };
  if (Array.isArray(rule.types) && !rule.types.includes(skill.type)) return { ...NEUTRAL };
  if (rule.fixedPowerBySkillName && !Object.hasOwn(rule.fixedPowerBySkillName, skill.name)) return { ...NEUTRAL };
  const triggered = rule.condition ? state.active === true : true;
  const rawStacks = rule.stack
    ? rule.automaticStack
      ? skillTypes.filter(type => rule.automaticStack.skillTypes.includes(type)).length
      : state.stacks ?? 0
    : 1;
  // 与固定CN源 trigger-controls.js#sanitizeTriggerValues 一致：先取整，再按控件min/max限制。
  const numericStacks = typeof rawStacks === 'string' && rawStacks.trim() !== '' ? Number(rawStacks) : rawStacks;
  const stacks = Math.min(rule.stack?.max ?? Infinity,
    Math.max(rule.stack?.min ?? 0, Math.floor(Number.isFinite(numericStacks) ? numericStacks : 0)));
  const active = triggered && (!rule.stack || stacks > 0 || rule.kind === 'decay_attack_percent');
  if (!active) return { ...NEUTRAL };
  const effect = Math.max(0, rule.fixedPowerBySkillName?.[skill.name] ?? rule.effect ?? 0);
  const amount = rule.kind === 'decay_attack_percent' ? Math.max(0, (rule.baseEffect ?? 100) - stacks * effect) : effect * stacks;
  const defenseAmount = Math.max(0, rule.defenseEffect ?? rule.effect ?? 0) * stacks;
  const result = { ...NEUTRAL };
  const attacker = role === 'attacker';
  switch (rule.kind) {
    case 'attack_percent':
    case 'decay_attack_percent':
      if (attacker) result.attackStage = amount / 10;
      break;
    case 'attack_defense_percent':
      if (attacker) result.attackStage = amount / 10; else result.defenseStage = amount / 10;
      break;
    case 'split_attack_defense_percent':
      if (attacker) result.attackStage = amount / 10; else result.defenseStage = defenseAmount / 10;
      break;
    case 'defense_percent':
      if (!attacker) result.defenseStage = amount / 10;
      break;
    case 'physical_defense_percent':
      if (!attacker && skill.category === 'physical') result.defenseStage = amount / 10;
      break;
    case 'power_percent':
      result.powerMultiplier = 1 + amount / 100;
      break;
    case 'fixed_power':
      result.fixedPowerAdd = amount;
      break;
    case 'fixed_power_physical_defense':
      if (attacker) result.fixedPowerAdd = amount;
      else if (skill.category === 'physical') result.defenseStage = defenseAmount / 10;
      break;
    case 'damage_reduction_percent':
      result.damageReductionMultiplier = Math.max(0, 1 - amount / 100);
      break;
    case 'final_damage_percent':
      result.finalDamageMultiplier = 1 + amount / 100;
      break;
    default:
      break;
  }
  result.attackStage = clampStage(result.attackStage);
  result.defenseStage = clampStage(result.defenseStage);
  return result;
}

export function applyAttackStage(value, effect) { return effect.attackStage ? stageAdjusted(value, effect.attackStage) : value; }
export function applyDefenseStage(value, effect) { return effect.defenseStage ? stageAdjusted(value, effect.defenseStage) : value; }

/** 面板展示用：返回各属性的加成百分比（不含骰子）。 */
export function traitPanelPercents(info, state = {}, skillTypes = []) {
  const probe = (role, category) => resolveOwnTrait(info, role, state, { category, type: null, name: null }, skillTypes);
  const physicalAttack = probe('attacker', 'physical').attackStage * 10;
  const magicalAttack = probe('attacker', 'magical').attackStage * 10;
  const physicalDefense = probe('defender', 'physical').defenseStage * 10;
  const magicalDefense = probe('defender', 'magical').defenseStage * 10;
  return { physicalAttack, magicalAttack, physicalDefense, magicalDefense };
}
