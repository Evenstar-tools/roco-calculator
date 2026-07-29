import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { ElementIcon } from "../../src/components/ElementIcon.jsx";
import { NatureEffect } from "../../src/components/NatureEffect.jsx";
import { StatIcon } from "../../src/components/StatIcon.jsx";

test("nature effect exposes up and down stats without relying on color", () => {
  render(<NatureEffect natureId="adamant" />);

  expect(screen.getByText("物攻")).toBeVisible();
  expect(screen.getByText("+20% ↑")).toBeVisible();
  expect(screen.getByText("魔攻")).toBeVisible();
  expect(screen.getByText("-10% ↓")).toBeVisible();
});

test("neutral nature has a compact no-modifier state", () => {
  render(<NatureEffect natureId="neutral" />);

  expect(screen.getByText("无修正")).toBeVisible();
});

test("element and stat icons use bundled BWIKI assets", () => {
  render(
    <>
      <ElementIcon label type="火" />
      <StatIcon label stat="physicalAttack" />
    </>,
  );

  expect(screen.getByRole("img", { name: "火" })).toHaveAttribute(
    "src",
    "/assets/elements/fire.png",
  );
  expect(screen.getByRole("img", { name: "物攻" })).toHaveAttribute(
    "src",
    "/assets/stats/physical-attack.png",
  );
});
