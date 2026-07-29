export const ELEMENT_TONES = Object.freeze({
  光: { color: "#f2c94c", ink: "#3d2f00" },
  幽: { color: "#7b61d1", ink: "#ffffff" },
  普通: { color: "#8c94a3", ink: "#ffffff" },
  草: { color: "#6bbf45", ink: "#ffffff" },
  火: { color: "#e9503f", ink: "#ffffff" },
  水: { color: "#2c8ee8", ink: "#ffffff" },
  地: { color: "#b99055", ink: "#ffffff" },
  冰: { color: "#68c7df", ink: "#0d3440" },
  龙: { color: "#6d5ce7", ink: "#ffffff" },
  电: { color: "#f3b729", ink: "#312100" },
  毒: { color: "#b458c8", ink: "#ffffff" },
  虫: { color: "#7ab74d", ink: "#ffffff" },
  武: { color: "#d96b62", ink: "#ffffff" },
  翼: { color: "#7ba7d8", ink: "#10243a" },
  萌: { color: "#f08ab6", ink: "#3c1024" },
  恶: { color: "#6f625d", ink: "#ffffff" },
  机械: { color: "#8190a0", ink: "#ffffff" },
  幻: { color: "#c57bd8", ink: "#ffffff" },
});

export function getElementTone(type) {
  return ELEMENT_TONES[type] ?? { color: "#8c94a3", ink: "#ffffff" };
}

export function getElementToneStyle(type) {
  const tone = getElementTone(type);
  return {
    "--type-color": tone.color,
    "--type-ink": tone.ink,
  };
}
