import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { App } from "../../src/App.jsx";

test("renders the calculator title", () => {
  render(<App />);

  expect(
    screen.getByRole("heading", {
      name: "洛克计算器",
    }),
  ).toBeVisible();
});

test("loads the compact runtime snapshot instead of the audit snapshot", () => {
  const fetchMock = vi.fn(() => new Promise(() => {}));
  vi.stubGlobal("fetch", fetchMock);

  render(<App />);

  expect(fetchMock).toHaveBeenCalledWith(
    "/data/runtime.json",
    expect.objectContaining({ signal: expect.any(AbortSignal) }),
  );
  vi.unstubAllGlobals();
});

test("shows the calculator as soon as runtime data is ready without waiting for the avatar manifest", async () => {
  let resolveManifest;
  const manifestPending = new Promise((resolve) => {
    resolveManifest = resolve;
  });
  const runtime = {
    learnsets: [],
    meta: {
      bwikiRevision: 41360,
      id: "s3-fast-start",
      rulesVersion: "1.0.0",
    },
    skills: [],
    spirits: [],
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
    if (url === "/assets/spirits/manifest.json") {
      return manifestPending;
    }
    throw new Error(`unexpected request ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);

  render(<App />);

  expect(
    await screen.findByRole("combobox", { name: "攻击方精灵" }),
  ).toBeVisible();
  resolveManifest({
    json: () => Promise.resolve({ assets: [] }),
    ok: true,
  });
  vi.unstubAllGlobals();
});

test("keeps avatar data when the manifest loads before the runtime snapshot", async () => {
  let resolveRuntime;
  const runtimePending = new Promise((resolve) => {
    resolveRuntime = resolve;
  });
  const manifestJson = vi.fn(() =>
    Promise.resolve({
      assets: [
        {
          id: "sonic-dog",
          localFile: "/assets/spirits/sonic-dog.png",
        },
      ],
    }),
  );
  const runtime = {
    learnsets: [],
    meta: {
      bwikiRevision: 41360,
      id: "s3-avatar-race",
      rulesVersion: "1.0.0",
    },
    skills: [],
    spirits: [
      {
        asset: null,
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
    if (url === "/assets/spirits/manifest.json") {
      return Promise.resolve({
        json: manifestJson,
        ok: true,
      });
    }
    if (url === "/data/runtime.json") return runtimePending;
    throw new Error(`unexpected request ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);

  render(<App />);
  await vi.waitFor(() => expect(manifestJson).toHaveBeenCalledTimes(1));
  await Promise.resolve();
  resolveRuntime({
    json: () => Promise.resolve(runtime),
    ok: true,
  });

  const user = userEvent.setup();
  const picker = await screen.findByRole("combobox", { name: "攻击方精灵" });
  await user.type(picker, "音速犬");
  await user.click(screen.getByRole("option", { name: /音速犬/ }));

  expect(screen.getByRole("img", { name: "音速犬" })).toHaveAttribute(
    "src",
    "/assets/spirits/sonic-dog.png",
  );
  vi.unstubAllGlobals();
});
