import { expect, test } from "vitest";
import {
  createSpiritSearchIndex,
  prepareSpiritForView,
} from "../../src/data/search-index.js";

const spirits = [
  {
    asset: { localUrl: "/assets/spirits/sonic-dog.png" },
    aliases: ["狗哥"],
    dexNo: "128",
    fullName: "音速犬",
    id: "sonic-dog",
    initials: "ysq",
    pinyin: "yinsuquan",
    sourceCategory: "原始形态",
    stage: "三阶",
    traitName: "专注力",
    types: ["火"],
    variantName: null,
  },
  {
    asset: { sourceUrl: "https://example.com/kaka.png" },
    dexNo: "311",
    fullName: "卡卡虫（火山附近）",
    id: "kaka-volcano",
    initials: "kkchsfj",
    pinyin: "kakachonghuoshanfujin",
    sourceCategory: "区域形态",
    stage: "一阶",
    traitName: "虫鸣",
    types: ["虫"],
    variantName: "火山附近",
  },
];

test("searches spirits by Chinese, full pinyin, initials, variant, and dex number", () => {
  const index = createSpiritSearchIndex(spirits);

  expect(index.search("音速").map((spirit) => spirit.id)).toEqual(["sonic-dog"]);
  expect(index.search("yinsuquan").map((spirit) => spirit.id)).toEqual(["sonic-dog"]);
  expect(index.search("ysq").map((spirit) => spirit.id)).toEqual(["sonic-dog"]);
  expect(index.search("火山附近").map((spirit) => spirit.id)).toEqual(["kaka-volcano"]);
  expect(index.search("311").map((spirit) => spirit.id)).toEqual(["kaka-volcano"]);
  expect(index.search("狗哥").map((spirit) => spirit.id)).toEqual(["sonic-dog"]);
});

test("prefers locally synchronized assets while preserving source fallback", () => {
  expect(prepareSpiritForView(spirits[0]).assetUrl).toBe(
    "/assets/spirits/sonic-dog.png",
  );
  expect(prepareSpiritForView(spirits[1]).assetUrl).toBe(
    "https://example.com/kaka.png",
  );
});
