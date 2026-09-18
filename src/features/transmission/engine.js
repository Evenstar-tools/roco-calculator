import { buildChoiceSkillSequence } from "../../domain/choice-skill-sequence.js";

export const POSITION_TRAITS = ["向心力", "翼轴", "贪心算法", "盲拧", "机械变式", "风速仪", "有求必应", "一意孤行", "猫精灵的礼物", "翻垃圾桶", "裁决", "滋养", "点燃", "净化", "夺目"];
const REPLACEMENT_SKILLS = ["借用", "取念", "复写", "镜像反射", "隐藏条款", "过山车"];
export const isFixed = (skill) => /此技能位置不会改变/.test(skill?.description ?? "");
export const baseDrive = (skill) => Number(skill?.description?.match(/传动(\d+)/)?.[1] ?? 0);
export const isPositionRelated = (entry) => REPLACEMENT_SKILLS.includes(entry.name) || POSITION_TRAITS.includes(entry.name) || /传动|技能.*(?:位置|顺序)/.test(`${entry.name}${entry.description}`);

// 每层以回合开始时确定的技能身份携带层数；特性不会在移动后重新加层。
export function settleLayers(slots, layers) {
  if (slots.length !== 4 || layers.length !== 4 || layers.some((n) => !Number.isInteger(n) || n < 0 || n > 20)) throw new Error("需要四个槽位及 0–20 的整数层数");
  let order = slots.map((skill, index) => ({ skill, key: index, remaining: isFixed(skill) ? 0 : layers[index] }));
  const steps = [];
  while (order.some((entry) => entry.remaining > 0)) {
    const movable = order.map((entry, index) => ({ entry, index })).filter(({ entry }) => !isFixed(entry.skill));
    const n = movable.length;
    const next = [...order];
    for (let i = 0; i < n; i += 1) {
      const { entry } = movable[i];
      let target = i;
      if (entry.remaining > 0) target = (i + 1) % n;
      else {
        while (movable[(target - 1 + n) % n].entry.remaining > 0) target = (target - 1 + n) % n;
      }
      next[movable[target].index] = { ...entry, remaining: Math.max(0, entry.remaining - 1) };
    }
    order = next;
    steps.push({ slots: order.map((entry) => entry.skill), keys: order.map((entry) => entry.key), remaining: order.map((entry) => entry.remaining) });
  }
  return { slots: order.map((entry) => entry.skill), steps };
}

/** 本回合携带技能计入累计的传动层数（自身传动 + 特性追加）。 */
export function roundDriveTotal(sources = []) {
  return sources.reduce((sum, source) => sum + Number(source.own || 0) + Number(source.extra || 0), 0);
}

export function windStacksFromDrive(driveTotal) {
  return Math.max(0, Math.floor((Number(driveTotal) || 0) / 8));
}


export function slotDriveLayers(slots, traitName = "") {
  return slots.map((skill, index) => {
    if (!skill) return 0;
    const own = baseDrive(skill);
    const extra =
      (traitName === "向心力" && index < 2) ||
      (["翼轴", "贪心算法"].includes(traitName) && index === 0)
        ? 1
        : 0;
    return own + extra;
  });
}

export function isSlotUsable(traitName, index) {
  if (traitName === "正位宝剑") return index === 0;
  if (traitName === "宝剑王牌") return index === 0 || index === 2;
  return true;
}

export function startRound(slots, traitName = "") {
  if (slots.some((skill) => !skill)) return { issue: "请先配置四个技能。" };
  if (slots.some((skill) => ["借用", "取念", "复写"].includes(skill.name))) return { issue: "随机变招需要记录实际技能身份及与传动的先后顺序；请先按实战技能重新配置，当前不能自动推演。" };
  if (traitName === "盲拧") return { issue: "盲拧在回合开始随机重排，与传动的先后顺序未确认。当前不支持自动推演。" };
  if (traitName === "翻垃圾桶") return { issue: "翻垃圾桶需要敌方最近技能及入场信息；请先按实战配置四个技能，再选择无位置特性。" };
  if (["裁决", "滋养", "点燃", "净化", "夺目"].includes(traitName)) return { issue: "该特性会替换或新增技能，需记录触发条件与实际技能身份；当前仅支持重新配置后的四槽推演。" };
  const sources = slots.map((skill, i) => {
    const own = baseDrive(skill);
    const extra = (traitName === "向心力" && i < 2) || (["翼轴", "贪心算法"].includes(traitName) && i === 0) ? 1 : 0;
    return { name: skill.name, own, extra, fixed: isFixed(skill), total: isFixed(skill) ? 0 : own + extra };
  });
  return { ...settleLayers(slots, sources.map((source) => source.total)), sources };
}

export function resolveAction(slots, index, traitName, branch = "power") {
  if (index === -1) return { slots, label: "待机", executions: [] };
  if ((traitName === "正位宝剑" && index !== 0) || (traitName === "宝剑王牌" && ![0, 2].includes(index))) return { issue: `${traitName}限制：当前槽位不可使用。` };
  const skill = slots[index];
  if (!skill) return { issue: "请选择本回合使用的技能。" };
  const sequence = buildChoiceSkillSequence({ skill, traitName, context: { shiftMode: branch, choiceTraitTriggered: true } });
  const label = `${skill.name}${skill.name === "轮班" ? ` · ${branch === "drive" ? "额外传动" : "1号位加威"}` : ""}`;
  if (REPLACEMENT_SKILLS.includes(skill.name)) return { issue: `${skill.name}涉及技能身份变化或全队跨精灵移动，当前四槽无法自动结算。请按实战技能重新配置；不能用原四槽的排列代替。`, label, executions: sequence.executions };
  if (skill.name === "轮班") {
    let next = slots;
    const driveRuns = sequence.executions.filter((execution) => execution.branch === "drive");
    for (const _ of driveRuns) {
      const at = next.findIndex((entry) => entry?.id === skill.id);
      if (at < 0) return { issue: "轮班已不在当前四槽，无法结算额外传动。", label, executions: sequence.executions };
      next = settleLayers(next, next.map((_, index) => (index === at ? 1 : 0))).slots;
    }
    return { slots: next, label, executions: sequence.executions };
  }
  if (/交换两侧技能位置/.test(skill.description)) {
    const next = [...slots], left = (index + 3) % 4, right = (index + 1) % 4;
    if (isFixed(next[left]) || isFixed(next[right])) return { issue: "杠杆置换与固定槽位的冲突规则未确认，当前不支持该操作。", allowObserved: true, label, executions: sequence.executions };
    [next[left], next[right]] = [next[right], next[left]];
    return { slots: next, label, executions: sequence.executions };
  }
  return { slots, label, executions: sequence.executions };
}

export function observedOrder(slots, text) {
  const indices = text.replace(/[\s,，、]/g, "").split("").map(Number);
  if (indices.length !== 4 || new Set(indices).size !== 4 || indices.some((n) => n < 1 || n > 4 || !Number.isInteger(n))) throw new Error("请填入 1–4 的排列，例如 2413；数字对应当前槽位。");
  const next = indices.map((n) => slots[n - 1]);
  if (slots.some((skill, i) => isFixed(skill) && indices[i] !== i + 1)) throw new Error("固定位置技能不能移动。");
  return next;
}
