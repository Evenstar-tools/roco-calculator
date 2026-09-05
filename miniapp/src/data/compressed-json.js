import pako from "pako";

const BASE64_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const { inflateRaw } = pako;

function decodeBase64(value) {
  if (
    typeof wx !== "undefined" &&
    typeof wx.base64ToArrayBuffer === "function"
  ) {
    return new Uint8Array(wx.base64ToArrayBuffer(value));
  }

  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
  const output = new Uint8Array((value.length * 3) / 4 - padding);
  let buffer = 0;
  let bits = 0;
  let offset = 0;

  for (const character of value) {
    if (character === "=") break;
    const index = BASE64_ALPHABET.indexOf(character);
    if (index < 0) throw new Error("内置数据编码无效");
    buffer = (buffer << 6) | index;
    bits += 6;
    if (bits < 8) continue;
    bits -= 8;
    output[offset] = (buffer >> bits) & 0xff;
    offset += 1;
  }

  return output;
}

export function decodeCompressedJson(payload, label) {
  const text = inflateRaw(decodeBase64(payload), { to: "string" });
  if (!text) throw new Error(`${label}解压失败`);
  return JSON.parse(text);
}
