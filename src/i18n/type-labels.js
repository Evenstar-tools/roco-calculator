// Client TYPE_DICTIONARY short names; type identifiers stay Chinese for the engine.
const TYPE_LABELS = {
  普通: ["Common", "ノーマル"], 草: ["Flora", "草"], 火: ["Fire", "炎"],
  水: ["Water", "水"], 光: ["Light", "光"], 地: ["Earth", "地"],
  冰: ["Ice", "氷"], 龙: ["Dragon", "竜"], 电: ["Electro", "雷"],
  毒: ["Poison", "毒"], 虫: ["Bug", "虫"], 武: ["Fighting", "武"],
  翼: ["Wing", "翼"], 萌: ["Charm", "萌"], 幽: ["Shadow", "幽霊"],
  恶: ["Havoc", "悪"], 机械: ["Mech", "機械"], 幻: ["Stellar", "幻"],
};

export function localizeType(type, locale) {
  return locale === "en" ? TYPE_LABELS[type]?.[0] ?? type
    : locale === "ja" ? TYPE_LABELS[type]?.[1] ?? type : type;
}
