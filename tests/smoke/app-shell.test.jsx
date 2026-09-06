import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { App } from "../../src/App.jsx";
import { AppHeader } from "../../src/components/AppHeader.jsx";

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
