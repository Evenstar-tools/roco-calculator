import { expect, test } from "vitest";
import { decodeLineupImage, inspectImagePayload } from "../../src/state/lineup-image.js";

test.each([
  ["https://rocom.qq.com/act/a20250703array/index.html?shareData=B~G", true],
  ["https://rocom.qq.com.evil.invalid/act/a20250703array/index.html?shareData=B~G", false],
  ["https://example.invalid/short?shareData=B~G", false],
  ["https://rocom.qq.com/short", false],
  ["unknown-short-code", false],
  ["B\\~Gxf\\~", true],
])("classifies QR payload without following links: %s", (text, supported) => {
  expect(inspectImagePayload(text).supported).toBe(supported);
});

test("rejects unsupported and oversized files before decoding", async () => {
  await expect(decodeLineupImage({ type: "text/plain", size: 1 })).rejects.toThrow("PNG");
  await expect(decodeLineupImage({ type: "image/jpeg", size: 11 * 1024 * 1024 })).rejects.toThrow("10 MB");
});
