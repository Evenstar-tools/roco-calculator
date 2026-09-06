import { Image, View } from "@tarojs/components";
import moonNight from "../assets/season/s4-moon-night.webp";
import silverWolf from "../assets/season/s4-silver-wolf.webp";

export default function SeasonBackdrop() {
  return (
    <View aria-hidden="true" className="season-sky">
      <View className="season-sky__scene">
        <Image alt="" className="season-sky__panorama" mode="aspectFit" src={moonNight} />
      </View>
      <View className="season-sky__quiet" />
      <View className="season-sky__orbit" />
      <View className="season-sky__wolf">
        <Image alt="" className="season-sky__portrait" mode="aspectFit" src={silverWolf} />
      </View>
      <View className="season-sky__star" />
    </View>
  );
}
