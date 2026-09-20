import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { StatTile } from "../../src/components/StatTile.jsx";
import { NATURES, QUICK_STATS, STAT_LABELS } from "../../src/domain/natures.js";

test.each(QUICK_STATS)("性格增加 %s 时只标记对应图标，普通性格和面板加成不误标", stat => {
  const nature = NATURES.find(item => item.upStat === stat);
  const tiles = natureId => QUICK_STATS.map(key => <StatTile key={key} stat={key} label={STAT_LABELS[key]} natureId={natureId} panel={200} race={100} displayIv={60} change="increase" delta={20} basePanel={180} onIvChange={() => {}} />);
  const view = render(<>{tiles(nature.id)}</>);
  expect(screen.getAllByRole("img")).toHaveLength(1);
  expect(screen.getByRole("img", { name: `${STAT_LABELS[stat]}性格增益 +20%` })).toHaveClass("stat-icon--nature-gain");
  expect(screen.getAllByText("200")).toHaveLength(6);
  expect(view.container.querySelectorAll("img.stat-icon")).toHaveLength(5);
  view.rerender(<>{tiles("neutral")}</>);
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
  expect(view.container.querySelectorAll("img.stat-icon")).toHaveLength(6);
});

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
  expect(input.closest(".stat-tile")).toHaveClass("stat-tile--iv-max");
  await user.clear(input);
  await user.type(input, "54");

  expect(onIvChange).toHaveBeenLastCalledWith(54);
  expect(input.closest(".stat-tile")).not.toHaveClass("stat-tile--iv-max");
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

test("marks a final panel value with a readable positive delta", () => {
  render(
    <StatTile
      accent="attack"
      basePanel={221}
      change="increase"
      delta={50}
      displayIv={60}
      label="速度"
      onIvChange={() => {}}
      panel={271}
      race={116}
      stat="speed"
    />,
  );

  expect(screen.getByText("271")).toBeVisible();
  expect(screen.getByText("+50")).toBeVisible();
  expect(
    screen.getByRole("button", {
      name: "速度最终值271，基础值221，增加50，点击查看修改前的六维",
    }),
  ).toBeVisible();
});
