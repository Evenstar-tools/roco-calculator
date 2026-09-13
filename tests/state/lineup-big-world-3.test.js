import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";
import { expect, test } from "vitest";
import { prepareZXingModule, readBarcodes } from "zxing-wasm/reader";
import expected from "../fixtures/game-lineup-big-world-3/expected.json";
import snapshot from "../../data/snapshots/current.json";
import mapping from "../../public/data/lineup-code-map.json";
import { getNature } from "../../src/domain/natures.js";
import { decodeLineupCode, importLineupCode, exportLineupCode } from "../../src/state/lineup-code.js";
import { inspectLineupIvs } from "../../src/state/lineup-ivs.js";

const fixture = path.resolve("tests/fixtures/game-lineup-big-world-3");
const text = readFileSync(path.join(fixture, "sample.txt"), "utf8");
const code = text.split(/\r?\n/).find(line => line.startsWith("B")).replace(/\\([~_])/g, "$1");
const raw = decodeLineupCode(text);

test("原图二维码与完整导出串逐字相同，保留末尾波浪线", async () => {
  const image = readFileSync(path.join(fixture, "sample-image.jpg"));
  expect(createHash("sha256").update(image).digest("hex")).toBe(expected.imageSha256);
  const require = createRequire(path.resolve("package.json"));
  prepareZXingModule({ overrides: {
    wasmBinary: readFileSync(require.resolve("zxing-wasm/reader/zxing_reader.wasm")),
  } });
  const results = await readBarcodes(image, { formats: ["QRCode"], tryHarder: true, maxNumberOfSymbols: 255 });
  const payloads = [...new Set(results.filter(item => item.isValid && item.text).map(item => item.text))];
  expect(payloads).toHaveLength(1);
  const url = new URL(payloads[0]);
  expect(url.origin).toBe("https://rocom.qq.com");
  expect(url.searchParams.get("shareData")).toBe(code);
  expect(url.searchParams.get("name")).toBe(expected.name);
  expect(code).toHaveLength(expected.codeLength);
  expect(code.endsWith("~")).toBe(true);
  expect(decodeLineupCode(payloads[0]).members).toEqual(raw.members);
});

test("实际字段和性格逐项对应原图，图中数值明确保持未知", () => {
  const team = importLineupCode(text, snapshot, mapping);
  expect(raw.members).toHaveLength(expected.members.length);
  team.members.forEach((member, index) => {
    const target = expected.members[index];
    expect(snapshot.spirits.find(spirit => spirit.id === member.spiritId).fullName).toBe(target.name);
    expect(raw.members[index].talents).toEqual(target.encodedTalents);
    expect(raw.members[index].talents.map(id => expected.observedAttributeIds[id])).toEqual(target.selectedAttributes);
    expect(getNature(member.natureId)).toMatchObject(target.nature);
    expect(target.numericIvs).toBeNull();
  });
});

test("忽略图中排列顺序，按六只出现组合仍唯一对应五项属性，不外推83", () => {
  const ids = [...new Set(raw.members.flatMap(member => member.talents))];
  const attributes = [...new Set(expected.members.flatMap(member => member.selectedAttributes))];
  const derived = Object.fromEntries(ids.map(id => {
    const matching = attributes.filter(attribute => raw.members.every((member, index) =>
      member.talents.includes(id) === expected.members[index].selectedAttributes.includes(attribute)));
    expect(matching).toHaveLength(1);
    return [id, matching[0]];
  }));
  expect(derived).toEqual(expected.observedAttributeIds);
  expect(derived).not.toHaveProperty("83");
});

test("当前缺口：非空字段未适配，保留待确认及原码，不把零占位当实际数值", () => {
  const team = importLineupCode(text, snapshot, mapping);
  for (const member of team.members) {
    expect(inspectLineupIvs(member.lineupSource.talents).status).toBe("unknown");
    expect(member.ivsPending).toBe(true);
    expect(Object.values(member.displayIvs)).toEqual([0, 0, 0, 0, 0, 0]);
  }
  expect(exportLineupCode(team, snapshot, mapping).code).toBe(code);
});
