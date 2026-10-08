import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { App } from "../../src/App.jsx";
import { AppHeader } from "../../src/components/AppHeader.jsx";
import { createInitialState } from "../../src/state/defaults.js";
import { COMPACT_OPTION_LABELS_STORAGE_KEY, VIEW_MODE_STORAGE_KEY } from "../../src/state/display-settings.js";
import { FIRST_RUN_GUIDE_STORAGE_KEY } from "../../src/state/first-run-guide.js";
import { SPIRIT_CONFIG_STORAGE_KEY } from "../../src/state/spirit-configs.js";

// 应用入口和显示设置回归不执行二维码解码，独立解码专项仍使用真实实现。
vi.mock("../../src/state/lineup-image.js", () => ({ decodeLineupImage: vi.fn() }));

function createInteractiveSnapshot() {
  const spirit = {
    asset: { localUrl: "/assets/spirits/sonic-dog.png" },
    dexNo: "048", fullName: "音速犬", id: "sonic-dog", stage: "二阶",
    raceStats: { hp: 85, magicalAttack: 46, magicalDefense: 82, physicalAttack: 128, physicalDefense: 101, speed: 120 },
    traitIds: [], types: ["火"],
  };
  return {
    learnsets: [{ spiritId: "sonic-dog", skillIds: ["tackle"] }, { spiritId: "water-spirit", skillIds: ["tackle"] }],
    meta: { id: "compact-option-labels-ui", rulesVersion: "1.0.0" },
    skills: [{ id: "tackle", name: "拍击", type: "普通", category: "physical", basePower: 70, cost: 2, description: "造成物理伤害。" }],
    spirits: [spirit, { ...spirit, id: "water-spirit", fullName: "水灵", types: ["水"] }],
    traits: [], typeChart: { "普通": { "火": 1, "水": 1 } },
  };
}

test("renders the calculator title", () => {
  render(<App />);

  expect(
    screen.getByRole("heading", {
      name: "洛克计算器 · S4「月涌狂想」",
    }),
  ).toBeVisible();
  expect(screen.getByText("正在加载 S4「月涌狂想」数据…")).toBeVisible();
});

test("season decoration stays local and decorative without changing header actions", async () => {
  const onThemeChange = vi.fn();
  const onTeamsOpen = vi.fn();
  const onMenuOpen = vi.fn();
  const onViewModeChange = vi.fn();
  const { container } = render(
    <AppHeader
      onMenuOpen={onMenuOpen}
      onTeamsOpen={onTeamsOpen}
      onThemeChange={onThemeChange}
      onViewModeChange={onViewModeChange}
    />,
  );
  const decoration = container.querySelector(".app-header__season");
  expect(decoration).toHaveAttribute("aria-hidden", "true");
  expect(decoration.querySelector("img")).toHaveAttribute("alt", "");
  expect(decoration.querySelector("img")).toHaveAttribute(
    "src", "/assets/season/s4-silver-wolf.webp",
  );
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "洛克计算器 · S4「月涌狂想」" })).toBeVisible();

  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "切换主题" }));
  await user.click(screen.getByRole("button", { name: "打开队伍" }));
  await user.click(screen.getByRole("button", { name: "打开菜单" }));
  await user.click(screen.getByRole("button", { name: "具体版" }));
  expect(onThemeChange).toHaveBeenCalledWith("dark");
  expect(onTeamsOpen).toHaveBeenCalledOnce();
  expect(onMenuOpen).toHaveBeenCalledOnce();
  expect(onViewModeChange).toHaveBeenCalledWith("detailed");
});

test("loads the compact runtime snapshot instead of the audit snapshot", () => {
  const fetchMock = vi.fn(() => new Promise(() => {}));
  vi.stubGlobal("fetch", fetchMock);

  render(<App />);

  expect(fetchMock).toHaveBeenCalledWith(
    "/data/runtime.json",
    expect.objectContaining({ signal: expect.any(AbortSignal) }),
  );
  expect(fetchMock).toHaveBeenCalledTimes(1);
  vi.unstubAllGlobals();
});

test("uses avatar data embedded in the runtime snapshot without a second request", async () => {
  const runtime = {
    learnsets: [],
    meta: {
      bwikiRevision: 41360,
      id: "s3-fast-start",
      rulesVersion: "1.0.0",
    },
    skills: [],
    spirits: [
      {
        asset: { localUrl: "/assets/spirits/sonic-dog.png" },
        dexNo: "128",
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
        traitIds: [],
        traitName: "专注力",
        types: ["火"],
      },
    ],
    traits: [],
    typeChart: {},
  };
  const fetchMock = vi.fn((url) => {
    if (url === "/data/runtime.json") {
      return Promise.resolve({
        json: () => Promise.resolve(runtime),
        ok: true,
      });
    }
    throw new Error(`unexpected request ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);

  render(<App />);

  const user = userEvent.setup();
  const picker = await screen.findByRole("combobox", { name: "攻击方精灵" });
  await user.type(picker, "音速犬");
  await user.click(screen.getByRole("option", { name: /音速犬/ }));

  expect(screen.getByRole("img", { name: "音速犬" })).toHaveAttribute(
    "src",
    "/assets/spirits/sonic-dog.png",
  );
  expect(fetchMock).toHaveBeenCalledTimes(1);
  vi.unstubAllGlobals();
});

test("显示选项名称开关接通真实精简版，改变标签不改变伤害、选中状态或技能配置", async () => {
  const snapshot = createInteractiveSnapshot();
  const state = createInitialState(snapshot);
  state.mode = "four";
  state.sides.attacker.nature = "smart";
  state.sides.attacker.displayIvs = { hp: 60, magicalAttack: 60, speed: 60, physicalAttack: 0, physicalDefense: 0, magicalDefense: 0 };
  const keys = [COMPACT_OPTION_LABELS_STORAGE_KEY, FIRST_RUN_GUIDE_STORAGE_KEY, VIEW_MODE_STORAGE_KEY, SPIRIT_CONFIG_STORAGE_KEY];
  const stored = keys.map((key) => [key, localStorage.getItem(key)]);
  localStorage.removeItem(COMPACT_OPTION_LABELS_STORAGE_KEY);
  localStorage.setItem(FIRST_RUN_GUIDE_STORAGE_KEY, "1");
  const app = render(<App initialSnapshot={snapshot} initialWorkspace={{ state, viewMode: "compact" }} />);
  const user = userEvent.setup();
  try {
    const damage = screen.getByTestId("primary-damage").textContent;
    const percent = app.container.querySelector(".result-rail__percent").textContent;
    const skills = [...screen.getAllByRole("combobox", { name: /^攻击方技能\d$/ })].map((input) => input.value);
    const configBytes = localStorage.getItem(SPIRIT_CONFIG_STORAGE_KEY);
    expect(Number(damage)).toBeGreaterThan(0);
    expect(app.container.querySelector(".quick-nature__name")).toBeNull();
    expect(screen.getByRole("tab", { name: "四技能" }).textContent).toBe("");

    for (const enabled of [true, false]) {
      await user.click(screen.getByRole("button", { name: "打开菜单" }));
      await user.click(screen.getByRole("button", { name: "显示设置" }));
      await user.click(screen.getByRole("checkbox", { name: "显示选项名称" }));
      await user.click(screen.getByRole("button", { name: "完成" }));
      expect(localStorage.getItem(COMPACT_OPTION_LABELS_STORAGE_KEY)).toBe(enabled ? "1" : "0");
      expect(app.container.querySelectorAll(".quick-nature__name")).toHaveLength(enabled ? 12 : 0);
      expect(app.container.querySelectorAll(".quick-iv__name")).toHaveLength(enabled ? 12 : 0);
      expect(screen.getByRole("tab", { name: "四技能" }).textContent).toBe(enabled ? "四技能" : "");
      expect(screen.getByRole("button", { name: "攻击方普通性格" })).toHaveTextContent(enabled ? "普通" : "性格");
      expect(screen.getByRole("button", { name: "攻击方普通性格" })).toHaveAttribute("aria-pressed", "false");
      expect(screen.getByRole("button", { name: "攻击方魔攻增益" })).toHaveAttribute("aria-pressed", "true");
      expect(screen.getByRole("checkbox", { name: "攻击方魔攻个体加点" })).toBeChecked();
      expect(screen.getByRole("checkbox", { name: "攻击方物攻个体加点" })).not.toBeChecked();
      expect(screen.getByTestId("primary-damage")).toHaveTextContent(damage);
      expect(app.container.querySelector(".result-rail__percent").textContent).toBe(percent);
      expect(screen.getAllByRole("combobox", { name: /^攻击方技能\d$/ }).map((input) => input.value)).toEqual(skills);
      expect(localStorage.getItem(SPIRIT_CONFIG_STORAGE_KEY)).toBe(configBytes);
      expect(screen.queryByRole("button", { name: /撤回上一步/ })).not.toBeInTheDocument();
    }
  } finally {
    app.unmount();
    for (const [key, value] of stored) {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    }
  }
});

test.each([
  ["沙暴", "sandstorm"],
  ["暴风雪", "blizzard"],
])("精简版保留%s天气摘要和可达的调整入口，清除天气不留空条件", async (label, weather) => {
  const snapshot = createInteractiveSnapshot();
  const state = createInitialState(snapshot);
  state.mode = "four";
  const keys = [FIRST_RUN_GUIDE_STORAGE_KEY, VIEW_MODE_STORAGE_KEY, SPIRIT_CONFIG_STORAGE_KEY];
  const stored = keys.map((key) => [key, localStorage.getItem(key)]);
  localStorage.setItem(FIRST_RUN_GUIDE_STORAGE_KEY, "1");
  const app = render(<App initialSnapshot={snapshot} initialWorkspace={{ state, viewMode: "detailed" }} />);
  const user = userEvent.setup();
  try {
    expect(screen.queryByRole("region", { name: "当前非默认高级条件" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "高级选项", exact: true }));
    await user.selectOptions(screen.getByRole("combobox", { name: "天气", exact: true }), weather);
    await user.click(screen.getByRole("button", { name: "高级选项", exact: true }));
    await user.click(screen.getByRole("button", { name: "精简版", exact: true }));

    const conditions = screen.getByRole("region", { name: "当前非默认高级条件" });
    expect(conditions).toHaveTextContent(label);
    const damage = screen.getByTestId("primary-damage").textContent;
    await user.click(within(conditions).getByRole("button", { name: "调整", exact: true }));
    expect(screen.getByRole("button", { name: "具体版", exact: true })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "高级选项", exact: true })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("combobox", { name: "天气", exact: true })).toHaveValue(weather);
    expect(screen.getByTestId("primary-damage")).toHaveTextContent(damage);

    await user.selectOptions(screen.getByRole("combobox", { name: "天气", exact: true }), "none");
    await user.click(screen.getByRole("button", { name: "高级选项", exact: true }));
    await user.click(screen.getByRole("button", { name: "精简版", exact: true }));
    expect(screen.queryByRole("region", { name: "当前非默认高级条件" })).not.toBeInTheDocument();
  } finally {
    app.unmount();
    for (const [key, value] of stored) {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    }
  }
});
