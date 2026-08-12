import { Image } from "@tarojs/components";
import bugIcon from "../assets/elements/bug.webp";
import cuteIcon from "../assets/elements/cute.webp";
import darkIcon from "../assets/elements/dark.webp";
import dragonIcon from "../assets/elements/dragon.webp";
import earthIcon from "../assets/elements/earth.webp";
import electricIcon from "../assets/elements/electric.webp";
import fireIcon from "../assets/elements/fire.webp";
import ghostIcon from "../assets/elements/ghost.webp";
import grassIcon from "../assets/elements/grass.webp";
import iceIcon from "../assets/elements/ice.webp";
import illusionIcon from "../assets/elements/illusion.webp";
import lightIcon from "../assets/elements/light.webp";
import machineIcon from "../assets/elements/machine.webp";
import martialIcon from "../assets/elements/martial.webp";
import normalIcon from "../assets/elements/normal.webp";
import poisonIcon from "../assets/elements/poison.webp";
import waterIcon from "../assets/elements/water.webp";
import wingIcon from "../assets/elements/wing.webp";

const ELEMENT_ICONS = Object.freeze({
  光: lightIcon,
  冰: iceIcon,
  地: earthIcon,
  幻: illusionIcon,
  幽: ghostIcon,
  恶: darkIcon,
  普通: normalIcon,
  机械: machineIcon,
  武: martialIcon,
  水: waterIcon,
  火: fireIcon,
  电: electricIcon,
  萌: cuteIcon,
  草: grassIcon,
  虫: bugIcon,
  龙: dragonIcon,
  毒: poisonIcon,
  翼: wingIcon,
});

export default function ElementIcon({ className = "", type }) {
  const source = ELEMENT_ICONS[type];
  if (!source) return null;

  return (
    <Image
      alt={`${type}系图标`}
      className={`element-icon ${className}`.trim()}
      mode="aspectFit"
      src={source}
    />
  );
}
