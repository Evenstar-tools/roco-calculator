import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { StatTile } from "../../src/components/StatTile.jsx";

test("shows computed, race, and editable individual values together", async () => {
  const user = userEvent.setup();
  const onIvChange = vi.fn();

  render(
    <StatTile
      accent="attack"
      displayIv={60}
      label="物攻"
      onIvChange={onIvChange}
      panel={271}
      race={128}
    />,
  );

  expect(screen.getByText("271")).toBeVisible();
  expect(screen.getByText("种:128")).toBeVisible();

  const input = screen.getByRole("spinbutton", { name: "物攻个体" });
  expect(input).toHaveValue(60);
  expect(input).toHaveAttribute("max", "60");
  expect(input).toHaveAttribute("step", "6");
  await user.clear(input);
  await user.type(input, "54");

  expect(onIvChange).toHaveBeenLastCalledWith(54);
});

test("clamps individual values to the current sixty-point cap", async () => {
  const user = userEvent.setup();
  const onIvChange = vi.fn();

  render(
    <StatTile
      displayIv={60}
      label="速度"
      onIvChange={onIvChange}
      panel={225}
      race={120}
    />,
  );

  const input = screen.getByRole("spinbutton", { name: "速度个体" });
  await user.clear(input);
  await user.type(input, "100");
  await user.tab();

  expect(input).toHaveValue(60);
  expect(onIvChange).toHaveBeenLastCalledWith(60);
});
