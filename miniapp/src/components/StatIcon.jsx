import { Image } from "@tarojs/components";
import hpIcon from "../assets/stats/hp.png";
import magicalAttackIcon from "../assets/stats/magical-attack.png";
import magicalDefenseIcon from "../assets/stats/magical-defense.png";
import physicalAttackIcon from "../assets/stats/physical-attack.png";
import physicalDefenseIcon from "../assets/stats/physical-defense.png";
import speedIcon from "../assets/stats/speed.png";

const STAT_ICONS = Object.freeze({
  hp: hpIcon,
  magicalAttack: magicalAttackIcon,
  magicalDefense: magicalDefenseIcon,
  physicalAttack: physicalAttackIcon,
  physicalDefense: physicalDefenseIcon,
  speed: speedIcon,
});

export default function StatIcon({ label, stat }) {
  return (
    <Image
      alt={label}
      aria-hidden="true"
      className="stat-icon"
      mode="aspectFit"
      src={STAT_ICONS[stat]}
    />
  );
}
