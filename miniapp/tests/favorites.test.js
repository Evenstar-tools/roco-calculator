import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, test, vi } from "vitest";
import FavoriteButton from "../src/components/FavoriteButton.jsx";
import SpiritPicker from "../src/components/SpiritPicker.jsx";
import {
  MINIAPP_FAVORITES_KEY,
  createFavoritesRepository,
} from "../src/state/favorites.js";

function createMemoryStorage(initialValue) {
  const values = new Map();
  if (initialValue !== undefined) {
    values.set(MINIAPP_FAVORITES_KEY, initialValue);
  }
  return {
    get: vi.fn((key) => values.get(key)),
    set: vi.fn((key, value) => values.set(key, value)),
    remove: vi.fn((key) => values.delete(key)),
  };
}

const snapshot = {
  spirits: [
    { id: "spirit-a", fullName: "火灵" },
    { id: "spirit-b", fullName: "水灵" },
    { id: "spirit-c", fullName: "风灵" },
  ],
};

describe("createFavoritesRepository", () => {
  test("toggles only known spirit ids and persists the stable order", () => {
    const storage = createMemoryStorage();
    const repository = createFavoritesRepository({ storage });

    expect(repository.load(snapshot)).toEqual([]);
    expect(repository.toggle("spirit-b")).toEqual(["spirit-b"]);
    expect(repository.toggle("spirit-a")).toEqual([
      "spirit-b",
      "spirit-a",
    ]);
    expect(repository.toggle("unknown-spirit")).toEqual([
      "spirit-b",
      "spirit-a",
    ]);
    expect(repository.toggle("spirit-b")).toEqual(["spirit-a"]);
    expect(storage.set).toHaveBeenLastCalledWith(
      MINIAPP_FAVORITES_KEY,
      ["spirit-a"],
    );
  });

  test("repairs bad values, removes unknown ids, and preserves first-seen order", () => {
    const storage = createMemoryStorage(
      JSON.stringify([
        "spirit-c",
        "unknown-spirit",
        "spirit-a",
        "spirit-c",
        42,
      ]),
    );
    const repository = createFavoritesRepository({ storage });

    expect(repository.load(snapshot)).toEqual([
      "spirit-c",
      "spirit-a",
    ]);
    expect(storage.set).toHaveBeenCalledWith(
      MINIAPP_FAVORITES_KEY,
      ["spirit-c", "spirit-a"],
    );
  });

  test("clears corrupted storage without blocking the calculator", () => {
    const storage = createMemoryStorage("{not-json");
    const repository = createFavoritesRepository({ storage });

    expect(repository.load(snapshot)).toEqual([]);
    expect(storage.remove).toHaveBeenCalledWith(MINIAPP_FAVORITES_KEY);
    expect(repository.clear()).toEqual([]);
  });

  test("replaces a non-array stored value with the safe empty shape", () => {
    const storage = createMemoryStorage({ favorite: "spirit-a" });
    const repository = createFavoritesRepository({ storage });

    expect(repository.load(snapshot)).toEqual([]);
    expect(storage.set).toHaveBeenCalledWith(
      MINIAPP_FAVORITES_KEY,
      [],
    );
  });
});

describe("favorite controls", () => {
  test("uses a native 44px button without emoji or a fabricated icon", () => {
    const onToggle = vi.fn();
    render(
      React.createElement(FavoriteButton, {
        favorite: true,
        onToggle,
        spiritName: "火灵",
      }),
    );

    const button = screen.getByRole("button", {
      name: "取消收藏火灵",
    });
    expect(button.tagName).toBe("BUTTON");
    expect(button).toHaveClass("favorite-button");
    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(button).toHaveTextContent("已收藏");
    expect(button.textContent).not.toMatch(
      /[\u{1F300}-\u{1FAFF}\u2605\u2606]/u,
    );
    fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  test("pins matching favorites first without hiding other matches", () => {
    render(
      React.createElement(SpiritPicker, {
        favoriteIds: ["spirit-c"],
        onChange() {},
        side: "attacker",
        spirits: snapshot.spirits,
        value: null,
      }),
    );

    fireEvent.input(screen.getByLabelText("搜索攻击方宠物"), {
      target: { value: "灵" },
    });

    expect(
      screen
        .getAllByRole("button", { name: /^选择/u })
        .map((button) => button.getAttribute("aria-label")),
    ).toEqual(["选择风灵", "选择火灵", "选择水灵"]);
  });

  test("pins a favorite beyond the first 30 matches before applying the result limit", () => {
    const manySpirits = Array.from({ length: 31 }, (_, index) => ({
      id: `spirit-${String(index + 1).padStart(2, "0")}`,
      fullName: `测试灵${String(index + 1).padStart(2, "0")}`,
    }));
    render(
      React.createElement(SpiritPicker, {
        favoriteIds: ["spirit-31"],
        onChange() {},
        side: "attacker",
        spirits: manySpirits,
        value: null,
      }),
    );

    fireEvent.input(screen.getByLabelText("搜索攻击方宠物"), {
      target: { value: "测试灵" },
    });

    const labels = screen
      .getAllByRole("button", { name: /^选择测试灵/u })
      .map((button) => button.getAttribute("aria-label"));
    expect(labels).toHaveLength(30);
    expect(labels[0]).toBe("选择测试灵31");
    expect(labels.slice(1)).toEqual(
      Array.from(
        { length: 29 },
        (_, index) =>
          `选择测试灵${String(index + 1).padStart(2, "0")}`,
      ),
    );
  });
});
