import { publicResourceUrl } from "../runtime/public-resource-url.js";

// 按原图符号逐一核对：旧资源编号 6 空缺，机械使用 18，不沿用列表序号。
export const WISH_POWER_ICON_NUMBERS = Object.freeze({
  normal: 7700001, grass: 7700002, fire: 7700003, water: 7700004,
  light: 7700005, ground: 7700007, ice: 7700008, dragon: 7700009,
  electric: 7700010, poison: 7700011, bug: 7700012, martial: 7700013,
  wing: 7700014, moe: 7700015, ghost: 7700016, evil: 7700017,
  machine: 7700018, phantom: 7700019,
});

const TYPE_SUFFIXES = Object.freeze({
  普通: "normal", 草: "grass", 火: "fire", 水: "water", 光: "light", 地: "ground",
  冰: "ice", 龙: "dragon", 电: "electric", 毒: "poison", 虫: "bug", 武: "martial",
  翼: "wing", 萌: "moe", 幽: "ghost", 恶: "evil", 机械: "machine", 幻: "phantom",
});
const WISH_POWER_NAMES = new Set(["愿力冲击", "Wishpower Blast", "願いの波動"]);

// 接受旧的虚拟ID，也接受保留参考身份的国际服或标准技能对象；只改变展示素材。
export function getWishPowerIconUrl(skill) {
  let skillId = typeof skill === "string" ? skill : skill?.reference?.sourceId ?? skill?.sourceId ?? skill?.id;
  if (typeof skillId === "string" && skillId.startsWith("cn-placeholder:")) skillId = skillId.slice("cn-placeholder:".length);
  if (typeof skillId !== "string") return null;
  const suffix = skillId.startsWith("calculator_wish_power_") ? skillId.slice("calculator_wish_power_".length) : "";
  let number = Object.hasOwn(WISH_POWER_ICON_NUMBERS, suffix) ? WISH_POWER_ICON_NUMBERS[suffix] : null;
  if (!number && !(/^skill_[a-f0-9]{16}$/u.test(skillId) && WISH_POWER_NAMES.has(skill?.name))) return null;
  if (typeof skill === "object" && skill.type !== undefined) {
    // 未知属性不回退成普通系；已知身份仍以调用方显示的真实属性选图。
    number = typeof skill.type === "string" && Object.hasOwn(TYPE_SUFFIXES, skill.type)
      ? WISH_POWER_ICON_NUMBERS[TYPE_SUFFIXES[skill.type]] : null;
  }
  return number ? publicResourceUrl(`/assets/skills/wish-power/${number}.png`) : null;
}
