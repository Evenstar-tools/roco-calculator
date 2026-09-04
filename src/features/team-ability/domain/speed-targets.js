import { calculateAllPanelStats, hasCompleteRaceStats } from "../../../domain/stat.js";
import {
  BEAST_FLOWER_TRAIT_NAME,
  resolveBeastFlowerBloodline,
} from "../../../domain/beast-flower-bloodline.js";
import { createSpeedModifiers } from "./speed-modifiers.js";
import { resolveSpiritFormRole } from "./spirit-form-role.js";

const EMPTY_DISPLAY_IVS = Object.freeze({
  hp: 0,
  magicalAttack: 0,
  magicalDefense: 0,
  physicalAttack: 0,
  physicalDefense: 0,
  speed: 0,
});

export const SPEED_TARGET_PROFILES = Object.freeze({
  "positive-max": Object.freeze({
    displayIv: 60,
    id: "positive-max",
    label: "极速",
    natureMultiplier: 1.2,
  }),
  "neutral-max": Object.freeze({
    displayIv: 60,
    id: "neutral-max",
    label: "满速",
    natureMultiplier: 1,
  }),
  "positive-zero": Object.freeze({
    displayIv: 0,
    id: "positive-zero",
    label: "仅速度性格",
    natureMultiplier: 1.2,
  }),
  "neutral-zero": Object.freeze({
    displayIv: 0,
    id: "neutral-zero",
    label: "无速度",
    natureMultiplier: 1,
  }),
  "negative-zero": Object.freeze({
    displayIv: 0,
    id: "negative-zero",
    label: "减速度",
    natureMultiplier: 0.9,
  }),
});

const SPEED_SPECIAL_CASES = Object.freeze([
  ["影狸", "positive-max", "嘲弄"],
  ["落陨星兔", "positive-max", "嘲弄"],
  ["海枝枝（翠绿纶布）", "positive-max", "嘲弄"],
  ["海枝枝（碧蓝珊瑚）", "neutral-max", "嘲弄"],
  ["梦悠悠（穿旧睡衣的样子）", "positive-max", "嘲弄"],
  ["梦悠悠（穿旧睡衣的样子）", "neutral-max", "嘲弄"],
  ["梦悠悠（穿星星睡衣的样子）", "positive-max", "嘲弄"],
  ["梦悠悠（穿星星睡衣的样子）", "neutral-max", "嘲弄"],
  ["绒光优优", "positive-max", "哨兵"],
  ["朔夜伊芙", "neutral-max", "啮合传递"],
  ["朔夜伊芙", "positive-max", "啮合传递"],
  ["声波缇塔", "positive-max", "啮合传递"],
  ["黑猫巫师", "positive-max", "预警"],
  ["黑猫巫师", "neutral-max", "预警"],
  ["白金独角兽", "positive-max", "折射"],
  ["迷迷箱怪", "positive-max", "啮合传递"],
  ["陨星虫", "positive-max", "契约的形状"],
  ["权杖-V", "positive-max", "啮合传递"],
  ["混乱鱿彩", "positive-max", "啮合传递"],
  ["女王蜂", "positive-max", "虫群突袭", 3],
  ["女王蜂", "positive-max", "虫群突袭", 4],
  ["女王蜂", "positive-max", "虫群突袭", 5],
  ["花魁蜂后", "positive-max", "虫群鼓舞", 3],
  ["圣剑-X", "positive-max", "啮合传递"],
  ["圣剑-X", "neutral-zero", "啮合传递"],
  ["迪莫", "positive-max", "最好的伙伴", 1],
  ["迪莫", "positive-max", "最好的伙伴", 2],
  ["兽花蕾", "positive-max", "电血脉"],
  ["火巨人", "positive-max", "淬炼火", 10],
  ["蝎子王", "positive-max", "流沙统治者"],
  ["夜枭", "positive-max", "快速移动"],
  ["夜枭", "neutral-max", "快速移动"],
  ["菊花梨", "neutral-zero", "示弱"],
  ["卡洛儿", "neutral-max", "示弱", undefined, { allowUnlearnedSkill: true }],
  ["古钟蛇", "positive-max", "示弱", undefined, { allowGrowth: true }],
  ["寒音蛇", "positive-max", "示弱"],
]);

function speedProfile(profileId) {
  const profile = SPEED_TARGET_PROFILES[profileId];
  if (profile) return profile;
  const error = new TypeError(`未知速度目标口径：${String(profileId)}`);
  error.code = "INVALID_SPEED_TARGET_PROFILE";
  throw error;
}

function specialLabel(sourceName, stack) {
  if (sourceName === "啮合传递") return "啮合";
  if (sourceName === "契约的形状") return "绝缘球";
  if (sourceName === "折射") return "折射·电";
  return `${sourceName}${stack ? `${stack}层` : ""}`;
}

function compareSpeedTargets(left, right) {
  return right.speed - left.speed ||
    Number(Boolean(right.specialLabel)) - Number(Boolean(left.specialLabel)) ||
    left.name.localeCompare(right.name, "zh-CN") ||
    left.id.localeCompare(right.id);
}

export function createSpeedTargets({
  profileId = "positive-max",
  spiritFilterRevision,
  spirits = [],
} = {}) {
  const profile = speedProfile(profileId);

  return spirits
    .flatMap((spirit) => {
      if (!hasCompleteRaceStats(spirit?.raceStats)) return [];
      const form = resolveSpiritFormRole(spirit, { spiritFilterRevision });
      if (form.formRole !== "final" && form.formRole !== "boss") return [];
      const speed = calculateAllPanelStats({
        displayIvs: { ...EMPTY_DISPLAY_IVS, speed: profile.displayIv },
        natureMultipliers: { speed: profile.natureMultiplier },
        raceStats: spirit.raceStats,
      }).speed;
      return [{
        formRole: form.formRole,
        id: spirit.id,
        name: spirit.fullName,
        profileId: profile.id,
        profileLabel: profile.label,
        qualifier: `${spirit.raceStats.speed}种族·${profile.label}`,
        speed,
        spirit,
        spiritId: spirit.id,
      }];
    })
    .sort(compareSpeedTargets);
}

export function createSpeedSpecialTargets({ profileId = "positive-max", snapshot } = {}) {
  const profile = speedProfile(profileId);
  const spirits = snapshot?.spirits ?? [];
  const skills = snapshot?.skills ?? [];
  const traits = snapshot?.traits ?? [];
  const learnsets = new Map(
    (snapshot?.learnsets ?? []).map((entry) => [entry.spiritId, entry.skillIds ?? []]),
  );

  return SPEED_SPECIAL_CASES
    .filter(([, caseProfileId]) => caseProfileId === profileId)
    .flatMap(([spiritName, , sourceName, stack, options = {}]) => {
      const spirit = spirits.find((entry) => entry.fullName === spiritName);
      if (!spirit || !hasCompleteRaceStats(spirit.raceStats)) return [];
      const form = resolveSpiritFormRole(spirit, {
        spiritFilterRevision: snapshot?.meta?.revisions?.spiritFilter,
      });
      if (
        form.formRole !== "final" &&
        form.formRole !== "boss" &&
        !(options.allowGrowth && form.formRole === "growth")
      ) return [];

      const learnedIds = learnsets.get(spirit.id) ?? [];
      const sourceSkill = skills.find(
        (skill) =>
          skill.name === sourceName &&
          (options.allowUnlearnedSkill || learnedIds.includes(skill.id)),
      );
      const extraElectricSkill = sourceName === "折射"
        ? skills.find((skill) => skill.type === "电" && learnedIds.includes(skill.id))
        : null;
      const carriedSkills = [sourceSkill?.id, extraElectricSkill?.id].filter(Boolean);
      const baseSpeed = calculateAllPanelStats({
        displayIvs: { ...EMPTY_DISPLAY_IVS, speed: profile.displayIv },
        natureMultipliers: { speed: profile.natureMultiplier },
        raceStats: spirit.raceStats,
      }).speed;
      const hasBeastFlowerTrait = (spirit.traitIds ?? []).some((traitId) =>
        traits.find((trait) => trait.id === traitId)?.name === BEAST_FLOWER_TRAIT_NAME,
      );
      const electricBloodline = sourceName === "电血脉" && hasBeastFlowerTrait
        ? resolveBeastFlowerBloodline({
            activated: true,
            bloodlineType: "electric",
            skill: {},
          })
        : null;
      const modifier = electricBloodline
        ? { amount: electricBloodline.ownerSpeedFlat }
        : createSpeedModifiers({
            configuration: { skills: { four: carriedSkills } },
            currentSpeed: baseSpeed,
            snapshot,
            spirit,
            traitStackLimit: Math.max(5, Number(stack) || 0),
          }).find((entry) =>
            entry.label.startsWith(sourceName) &&
            (stack === undefined || entry.stack === stack),
          );
      if (!modifier) return [];

      const label = specialLabel(sourceName, stack);
      return [{
        formRole: form.formRole,
        id: `special:${spirit.id}:${profileId}:${sourceName}:${stack ?? ""}`,
        name: spirit.fullName,
        profileId: profile.id,
        profileLabel: profile.label,
        qualifier: `${spirit.raceStats.speed}种族·${profile.label}·${label}`,
        specialLabel: label,
        speed: baseSpeed + modifier.amount,
        spirit,
        spiritId: spirit.id,
      }];
    })
    .sort(compareSpeedTargets);
}

export function groupSpeedTargets(targets = []) {
  return [...targets].sort(compareSpeedTargets).reduce((groups, target) => {
    const lastGroup = groups.at(-1);
    if (lastGroup?.speed === target.speed) {
      lastGroup.targets.push(target);
      return groups;
    }
    groups.push({ speed: target.speed, targets: [target] });
    return groups;
  }, []);
}

export function findNearestSpeedTarget(targets, speed) {
  return [...targets].sort((left, right) =>
    Math.abs(left.speed - speed) - Math.abs(right.speed - speed) ||
    left.speed - right.speed ||
    left.id.localeCompare(right.id),
  )[0] ?? null;
}
