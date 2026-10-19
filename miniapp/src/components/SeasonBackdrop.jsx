import { Image, View } from "@tarojs/components";
import moonNight from "../assets/season/s4-moon-night.webp";
import silverWolf from "../assets/season/s4-silver-wolf.webp";
import nightDiscovery from "../assets/season/s1-night-discovery.webp";
import carnival from "../assets/season/s2-carnival.webp";
import storybook from "../assets/season/s3-storybook.webp";

const scenes = { s1: nightDiscovery, s2: carnival, s3: storybook, s4: moonNight };

export default function SeasonBackdrop({ seasonId = "s4" }) {
  const id = Object.prototype.hasOwnProperty.call(scenes, seasonId) ? seasonId : "s4";
  return (
    <View aria-hidden="true" className={`season-sky season-sky--${id}`}>
      <View className="season-sky__scene">
        <Image alt="" className="season-sky__panorama" mode={id === "s4" ? "aspectFit" : "aspectFill"} src={scenes[id]} />
      </View>
      <View className="season-sky__quiet" />
      {id === "s4" && <><View className="season-sky__orbit" />
      <View className="season-sky__wolf">
        <Image alt="" className="season-sky__portrait" mode="aspectFit" src={silverWolf} />
      </View>
      <View className="season-sky__star" /></>}
    </View>
  );
}
