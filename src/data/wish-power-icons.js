// 按原图符号逐一核对：旧资源编号 6 空缺，机械使用 18，不沿用列表序号。
export const WISH_POWER_ICON_NUMBERS = Object.freeze({
  normal: 7700001, grass: 7700002, fire: 7700003, water: 7700004,
  light: 7700005, ground: 7700007, ice: 7700008, dragon: 7700009,
  electric: 7700010, poison: 7700011, bug: 7700012, martial: 7700013,
  wing: 7700014, moe: 7700015, ghost: 7700016, evil: 7700017,
  machine: 7700018, phantom: 7700019,
});

export function getWishPowerIconUrl(skillId) {
  if (typeof skillId !== "string" || !skillId.startsWith("calculator_wish_power_")) return null;
  const suffix = skillId.slice("calculator_wish_power_".length);
  const number = Object.hasOwn(WISH_POWER_ICON_NUMBERS, suffix) ? WISH_POWER_ICON_NUMBERS[suffix] : null;
  return number ? `/assets/skills/wish-power/${number}.png` : null;
}
