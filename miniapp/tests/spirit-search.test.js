import { describe, expect, test } from "vitest";
import {
  createSpiritSearchIndex,
  searchSpirits,
} from "../src/view-models/spirit-search.js";

function createSnapshot() {
  return {
    spirits: [
      {
        id: "spirit-sonic-dog",
        fullName: "音速犬",
        pinyin: "yinsuquan",
        initials: "ysq",
        evolutionChainNames: ["风暴战犬"],
      },
      {
        id: "spirit-water",
        fullName: "水灵",
        pinyin: "shuiling",
        initials: "sl",
      },
    ],
  };
}

describe("spirit search index", () => {
  test.each(["音速犬", "音速", "yinsuquan", "ysq", "风暴战犬"])(
    "finds a spirit from the snapshot's precomputed name fields: %s",
    (query) => {
      const index = createSpiritSearchIndex(createSnapshot());

      expect(searchSpirits(index, query).map((item) => item.id))
        .toContain("spirit-sonic-dog");
    },
  );

  test("normalizes spaces and ASCII case without mutating the source spirit", () => {
    const snapshot = createSnapshot();
    const index = createSpiritSearchIndex(snapshot);

    expect(searchSpirits(index, " Yin Su Quan ")).toEqual([
      snapshot.spirits[0],
    ]);
    expect(snapshot.spirits[0]).not.toHaveProperty("searchText");
  });

  test("bounds empty and matching result sets", () => {
    const snapshot = {
      spirits: Array.from({ length: 40 }, (_, index) => ({
        id: `spirit-${index}`,
        fullName: `测试宠物${index}`,
        pinyin: `ceshichongwu${index}`,
        initials: `cscw${index}`,
      })),
    };
    const index = createSpiritSearchIndex(snapshot);

    expect(searchSpirits(index, "")).toHaveLength(30);
    expect(searchSpirits(index, "测试", 5)).toHaveLength(5);
  });
});
