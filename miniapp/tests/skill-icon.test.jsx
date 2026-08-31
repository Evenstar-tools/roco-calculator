import { fireEvent, render } from "@testing-library/react";
import { expect, test } from "vitest";
import SkillIcon from "../src/components/SkillIcon.jsx";

test("uses a secure skill image and falls back to the element icon after an image error", () => {
  const { container } = render(
    <SkillIcon
      className="skill-picker__trigger-icon"
      skill={{
        iconUrl: "https://images.example.test/skill.png",
        type: "光",
      }}
    />,
  );

  const image = container.querySelector(".skill-icon");
  expect(image).toHaveAttribute("src", "https://images.example.test/skill.png");

  fireEvent.error(image);

  const fallback = container.querySelector(".skill-icon--fallback");
  expect(fallback).toBeInTheDocument();
  expect(fallback.querySelector(".element-icon")).toHaveAttribute(
    "alt",
    "光系图标",
  );
});

test("uses the existing element icon when the skill has no secure image", () => {
  const { container } = render(<SkillIcon skill={{ type: "水" }} />);

  expect(container.querySelector(".skill-icon--fallback")).toBeInTheDocument();
  expect(container.querySelector(".element-icon")).toHaveAttribute(
    "alt",
    "水系图标",
  );
});
