import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef, useState } from "react";
import { expect, test, vi } from "vitest";
import { TeamDrawer } from "../../src/components/TeamDrawer.jsx";
import { teamPresetsRepository } from "../../src/state/team-presets.js";

const snapshot = {
  learnsets: [
    {
      skillIds: ["fire-a", "fire-b", "fire-c", "fire-d"],
      spiritId: "sonic-dog",
    },
    {
      skillIds: ["water-a"],
      spiritId: "water-spirit",
    },
  ],
  skills: [
    {
      basePower: 80,
      category: "physical",
      cost: 1,
      id: "fire-a",
      name: "风力冲击",
      type: "火",
    },
    {
      basePower: 60,
      category: "magical",
      cost: 1,
      id: "fire-b",
      name: "火焰喷发",
      type: "火",
    },
    {
      basePower: null,
      category: "status",
      cost: 2,
      id: "fire-c",
      name: "热身",
      type: "火",
    },
    {
      basePower: null,
      category: "defense",
      cost: 2,
      id: "fire-d",
      name: "火盾",
      type: "火",
    },
    {
      basePower: 60,
      category: "magical",
      cost: 1,
      id: "water-a",
      name: "水之波纹",
      type: "水",
    },
  ],
  spirits: [
    {
      asset: null,
      fullName: "音速犬",
      id: "sonic-dog",
      raceStats: {
        hp: 85,
        magicalAttack: 46,
        magicalDefense: 82,
        physicalAttack: 128,
        physicalDefense: 101,
        speed: 120,
      },
      stage: "三阶",
      traitName: "专注力",
      types: ["火"],
    },
    {
      asset: null,
      fullName: "水灵",
      id: "water-spirit",
      raceStats: {
        hp: 125,
        magicalAttack: 127,
        magicalDefense: 132,
        physicalAttack: 58,
        physicalDefense: 94,
        speed: 85,
      },
      stage: "三阶",
      traitName: "浸润",
      types: ["水"],
    },
  ],
};

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, String(value)),
  };
}

function DrawerHarness({
  getSpiritConfiguration = () => null,
  onApply = vi.fn(),
  onCaptureSide = vi.fn(),
}) {
  const triggerRef = useRef(null);
  const storeRef = useRef(null);
  if (!storeRef.current) {
    let id = 0;
    storeRef.current = teamPresetsRepository({
      idFactory: () => `team-${(id += 1)}`,
      now: () => "2026-07-24T00:00:00.000Z",
      storage: memoryStorage(),
    });
  }
  const store = storeRef.current;
  const [open, setOpen] = useState(true);
  const [teamsState, setTeamsState] = useState(() => store.load(snapshot));

  return (
    <>
      <button onClick={() => setOpen(true)} ref={triggerRef} type="button">
        打开队伍
      </button>
      <TeamDrawer
        getSpiritConfiguration={getSpiritConfiguration}
        onActiveTeamChange={(id) =>
          setTeamsState((state) => store.setActive(state, id))
        }
        onApply={onApply}
        onCaptureSide={onCaptureSide}
        onClose={() => setOpen(false)}
        onCreateTeam={(name) =>
          setTeamsState((state) => store.create(state, name))
        }
        onDeleteTeam={(id) =>
          setTeamsState((state) => store.remove(state, id))
        }
        onDuplicateTeam={(id) =>
          setTeamsState((state) => store.duplicate(state, id))
        }
        onMemberChange={(teamId, index, member) =>
          setTeamsState((state) =>
            store.updateMember(state, teamId, index, member),
          )
        }
        onRenameTeam={(id, name) =>
          setTeamsState((state) => store.rename(state, id, name))
        }
        open={open}
        returnFocusRef={triggerRef}
        snapshot={snapshot}
        teamsState={teamsState}
      />
    </>
  );
}

test("creates and edits one of six team members", async () => {
  const user = userEvent.setup();
  render(<DrawerHarness />);

  expect(screen.getByRole("dialog", { name: "队伍" })).toBeVisible();
  expect(screen.getByRole("button", { name: "关闭队伍" })).toHaveFocus();
  await user.click(screen.getByRole("button", { name: "新建队伍" }));

  const roster = screen.getByRole("list", { name: "队伍成员" });
  expect(within(roster).getAllByRole("listitem")).toHaveLength(6);
  expect(
    screen.queryByRole("button", { name: /收藏/ }),
  ).not.toBeInTheDocument();
  await user.click(
    within(roster).getByRole("button", { name: "编辑空位 1" }),
  );

  const spiritPicker = screen.getByRole("combobox", { name: "成员精灵" });
  fireEvent.change(spiritPicker, { target: { value: "音速犬" } });
  await user.click(screen.getByRole("option", { name: /音速犬/ }));

  await waitFor(() =>
    expect(
      within(roster).getByRole("button", { name: "编辑音速犬" }),
    ).toBeVisible(),
  );

  await user.selectOptions(
    screen.getByRole("combobox", { name: "成员性格" }),
    "adamant",
  );
  const attackIv = screen.getByRole("spinbutton", { name: "物攻个体" });
  await user.clear(attackIv);
  await user.type(attackIv, "60");

  await waitFor(() => {
    expect(screen.getByText("+20% ↑")).toBeVisible();
    expect(screen.getByRole("combobox", { name: "成员技能1" })).toHaveValue(
      "风力冲击",
    );
    expect(screen.getAllByRole("combobox", { name: /成员技能/ })).toHaveLength(
      4,
    );
  });
});

test("copies a personal configuration when selecting a member and never inherits the previous spirit", async () => {
  const personalConfig = {
    displayIvs: {
      hp: 1,
      speed: 2,
      physicalAttack: 60,
      magicalAttack: 3,
      physicalDefense: 4,
      magicalDefense: 5,
    },
    natureId: "adamant",
    skills: {
      four: ["fire-a", "fire-b", null, null],
      single: "fire-a",
    },
    spiritId: "sonic-dog",
  };
  const user = userEvent.setup();
  render(
    <DrawerHarness
      getSpiritConfiguration={(spiritId) =>
        spiritId === "sonic-dog" ? personalConfig : null
      }
    />,
  );

  await user.click(screen.getByRole("button", { name: "新建队伍" }));
  await user.click(screen.getByRole("button", { name: "编辑空位 1" }));
  const editor = screen.getByRole("region", { name: "成员 1 配置" });
  const picker = within(editor).getByRole("combobox", { name: "成员精灵" });
  fireEvent.change(picker, { target: { value: "音速犬" } });
  await user.click(within(editor).getByRole("option", { name: /音速犬/ }));

  expect(within(editor).getByRole("combobox", { name: "成员性格" })).toHaveValue(
    "adamant",
  );
  expect(within(editor).getByRole("spinbutton", { name: "物攻个体" })).toHaveValue(
    60,
  );
  expect(within(editor).getByRole("combobox", { name: "成员技能1" })).toHaveValue(
    "风力冲击",
  );

  fireEvent.change(picker, { target: { value: "水灵" } });
  await user.click(within(editor).getByRole("option", { name: /水灵/ }));

  expect(within(editor).getByRole("combobox", { name: "成员性格" })).toHaveValue(
    "neutral",
  );
  expect(within(editor).getByRole("spinbutton", { name: "物攻个体" })).toHaveValue(
    0,
  );
  expect(within(editor).getByRole("combobox", { name: "成员技能1" })).toHaveValue(
    "水之波纹",
  );
  expect(personalConfig).toMatchObject({
    natureId: "adamant",
    skills: { four: ["fire-a", "fire-b", null, null] },
  });
});

test("applies a member as attack or defense and confirms deletion inline", async () => {
  const onApply = vi.fn();
  const user = userEvent.setup();
  render(<DrawerHarness onApply={onApply} />);

  await user.click(screen.getByRole("button", { name: "新建队伍" }));
  await user.click(screen.getByRole("button", { name: "编辑空位 1" }));
  const spiritPicker = screen.getByRole("combobox", { name: "成员精灵" });
  fireEvent.change(spiritPicker, { target: { value: "音速犬" } });
  await user.click(screen.getByRole("option", { name: /音速犬/ }));

  const applyAttack = screen.getByRole("button", {
    name: "音速犬设为攻击方",
  });
  const applyDefense = screen.getByRole("button", {
    name: "音速犬设为防御方",
  });
  expect(applyAttack).toHaveAttribute("title", "设为攻击方");
  expect(applyDefense).toHaveAttribute("title", "设为防御方");
  await user.click(applyAttack);
  await user.click(
    applyDefense,
  );
  expect(onApply).toHaveBeenNthCalledWith(
    1,
    "attacker",
    expect.objectContaining({ spiritId: "sonic-dog" }),
  );
  expect(onApply).toHaveBeenNthCalledWith(
    2,
    "defender",
    expect.objectContaining({ spiritId: "sonic-dog" }),
  );

  await user.click(screen.getByRole("button", { name: "删除队伍" }));
  expect(screen.getByText("删除当前队伍？")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "确认删除" }));
  expect(
    screen.queryByRole("list", { name: "队伍成员" }),
  ).not.toBeInTheDocument();
});

test("captures the current attack or defense configuration into the selected slot", async () => {
  const onCaptureSide = vi.fn();
  const user = userEvent.setup();
  render(<DrawerHarness onCaptureSide={onCaptureSide} />);

  await user.click(screen.getByRole("button", { name: "新建队伍" }));

  await user.click(
    screen.getByRole("button", { name: "用当前攻击方填入1号位" }),
  );
  await user.click(
    screen.getByRole("button", { name: "用当前防御方填入1号位" }),
  );

  expect(onCaptureSide).toHaveBeenNthCalledWith(
    1,
    "attacker",
    "team-1",
    0,
  );
  expect(onCaptureSide).toHaveBeenNthCalledWith(
    2,
    "defender",
    "team-1",
    0,
  );
});

test("closes with Escape and restores focus to the trigger", async () => {
  const user = userEvent.setup();
  render(<DrawerHarness />);

  await user.keyboard("{Escape}");

  expect(
    screen.queryByRole("dialog", { name: "队伍" }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "打开队伍" })).toHaveFocus();
});
