import { useState } from "react";
import { Image, View } from "@tarojs/components";
import { PUBLIC_ASSET_ORIGIN } from "../data/public-asset-urls.js";
import moonNight from "../assets/season/s4-moon-night.webp";
import silverWolf from "../assets/season/s4-silver-wolf.webp";

const scenes = {
  s1: `${PUBLIC_ASSET_ORIGIN}/assets/season/s1-night-discovery.webp`,
  s2: `${PUBLIC_ASSET_ORIGIN}/assets/season/s2-carnival.webp`,
  s3: `${PUBLIC_ASSET_ORIGIN}/assets/season/s3-storybook.webp`,
  s4: moonNight,
  s5: `${PUBLIC_ASSET_ORIGIN}/assets/season/s5-dragon-treasure.webp`,
};

export default function SeasonBackdrop({ seasonId = "s5" }) {
  const id = Object.prototype.hasOwnProperty.call(scenes, seasonId) ? seasonId : "s5";
  const [failedScene, setFailedScene] = useState(null);
  return (
    <View aria-hidden="true" className={`season-sky season-sky--${id}`}>
      <View className="season-sky__scene">
        {failedScene !== id && <Image alt="" className="season-sky__panorama"
          mode={id === "s4" ? "aspectFit" : "aspectFill"} src={scenes[id]}
          onError={() => setFailedScene(id)} />}
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
