export const PUBLIC_ASSET_ORIGIN = "https://rococalc.top";
export const PUBLIC_SPIRIT_ASSET_REVISION = "20260905";

export function publicSpiritImageUrl(spiritId) {
  return `${PUBLIC_ASSET_ORIGIN}/assets/spirits/${spiritId}.png?v=${PUBLIC_SPIRIT_ASSET_REVISION}`;
}
