const ELEMENT_ASSETS = Object.freeze({
  光: "light",
  冰: "ice",
  地: "earth",
  幻: "illusion",
  幽: "ghost",
  恶: "dark",
  普通: "normal",
  机械: "machine",
  武: "martial",
  水: "water",
  火: "fire",
  电: "electric",
  萌: "cute",
  草: "grass",
  虫: "bug",
  龙: "dragon",
  毒: "poison",
  翼: "wing",
});

export function ElementIcon({ label = false, size = 18, type }) {
  const asset = ELEMENT_ASSETS[type];
  if (!asset) return null;
  return (
    <img
      alt={label ? type : ""}
      className="element-icon"
      height={size}
      src={`/assets/elements/${asset}.png`}
      width={size}
    />
  );
}
