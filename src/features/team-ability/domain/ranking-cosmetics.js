// 五族麦田主题纯外观只在速度、耐久排行中去重；目录和已有配置保留原实体。
const WHEAT_COSMETIC_SPIRIT_IDS = new Set([
  "spirit_4ba8f07d34a4e247", // 护主犬 · 看守麦田
  "spirit_58fba21fe70be498", // 音速犬 · 看守麦田
  "spirit_576805f2cd1bbd11", // 风暴战犬 · 看守麦田
  "spirit_95aaf0ee94680c86", // 公平鸽 · 称量
  "spirit_e09a7b2376f6e518", // 奔波鼠 · 搬运果实
  "spirit_95d31f7040c570b2", // 流浪鼠 · 搬运果实
  "spirit_bf63c954e18a8852", // 花怨鳗 · 果壳铃
  "spirit_45095a4991f540a4", // 鳗尾兽 · 果壳铃
  "spirit_0aff77799da7257f", // 稻草人 · 暖和
  "spirit_9383a26b3b5da4c5", // 稻草守护者 · 暖和
]);

export function isWheatCosmeticSpirit(spirit) {
  return WHEAT_COSMETIC_SPIRIT_IDS.has(spirit?.id);
}
