export function shareHashFromInput(value) {
  const text = String(value ?? "").trim();
  if (/^#v\d+\./.test(text)) return text;
  try {
    const hash = new URL(text, globalThis.location?.href).hash;
    if (/^#v\d+\./.test(hash)) return hash;
  } catch { /* 仅提取协议片段，不使用输入网址跳转。 */ }
  const error = new TypeError("分享链接格式无效");
  error.code = "SHARE_INVALID_FORMAT";
  throw error;
}
