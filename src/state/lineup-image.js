import wasmUrl from "zxing-wasm/reader/zxing_reader.wasm?url";

let readerRequest;
function loadReader() {
  readerRequest ??= import("zxing-wasm/reader").then((reader) => {
    // 始终读取随应用打包的 WASM，禁止使用库默认的 CDN。
    reader.prepareZXingModule({ overrides: { locateFile: () => wasmUrl } });
    return reader;
  }).catch((error) => { readerRequest = null; throw error; });
  return readerRequest;
}

export function inspectImagePayload(text) {
  if (/^https?:\/\//i.test(text.trim())) {
    try {
      const url = new URL(text.trim());
      if (url.protocol === "https:" && url.hostname === "rocom.qq.com" &&
          url.pathname === "/act/a20250703array/index.html" && url.searchParams.has("shareData")) {
        return { kind: "官方阵容链接", supported: true };
      }
    } catch { /* 无效链接按未知内容展示。 */ }
    return { kind: "其他链接", supported: false };
  }
  if (text.replace(/\\~/g, "~").includes("~")) return { kind: "阵容码候选", supported: true };
  return { kind: "未知内容或短码", supported: false };
}

export async function decodeLineupImage(file) {
  if (!file || !/^image\/(png|jpeg|webp)$/.test(file.type)) {
    throw new Error("请选择 PNG、JPG 或 WebP 配队图");
  }
  if (file.size > 10 * 1024 * 1024) throw new Error("图片超过 10 MB，请裁剪二维码区域后重试");
  let bitmap;
  try { bitmap = await createImageBitmap(file); }
  catch { throw new Error("图片无法读取，请重新选择完整图片"); }
  try {
    if (bitmap.width * bitmap.height > 24_000_000) throw new Error("图片尺寸过大，请裁剪二维码区域后重试");
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.fillStyle = "white";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    let results;
    try {
      const reader = await loadReader();
      results = await reader.readBarcodes(pixels, { formats: ["QRCode"], tryHarder: true, maxNumberOfSymbols: 255 });
    } catch { throw new Error("本地二维码识别器加载或运行失败，请重试，或粘贴阵容码"); }
    const codes = results.filter(result => result.isValid && result.text);
    const payloads = [...new Set(codes.map(result => result.text))];
    if (!payloads.length) throw new Error("未识别到清晰二维码，请上传原图或裁剪二维码后重试");
    if (payloads.length > 1) throw new Error("检测到多个不同二维码，请裁剪到要导入的阵容二维码后重试");
    const text = payloads[0];
    return { text, ...inspectImagePayload(text), position: codes[0].position };
  } finally { bitmap.close(); }
}
