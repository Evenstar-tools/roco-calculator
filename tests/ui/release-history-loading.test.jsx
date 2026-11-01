import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { DataSourceDialog } from "../../src/components/DataSourceDialog.jsx";
import { RuntimeProvider } from "../../src/runtime/RuntimeContext.jsx";
import { FEATURED_USER_RELEASE, USER_RELEASE_NOTES } from "../../src/data/user-release-notes.js";

afterEach(() => vi.unstubAllGlobals());

test("Global keeps its summary without a history request; CN retains the latest notice on error and retries all records", async () => {
  const fetch = vi.fn().mockResolvedValueOnce({ ok: false })
    .mockResolvedValueOnce({ ok: true, json: async () => USER_RELEASE_NOTES });
  vi.stubGlobal("fetch", fetch);
  const panel = serverId => <RuntimeProvider serverId={serverId}><DataSourceDialog open initialView="release" /></RuntimeProvider>;
  const view = render(panel("global"));
  expect(fetch).not.toHaveBeenCalled();
  view.rerender(panel("cn"));
  expect(screen.getByText(FEATURED_USER_RELEASE.version)).toBeVisible();
  expect(await screen.findByRole("alert")).toHaveTextContent("版本记录加载失败");
  expect(screen.getByText(FEATURED_USER_RELEASE.version)).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "重试" }));
  expect(await screen.findByText(USER_RELEASE_NOTES.at(-1).version)).toBeVisible();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(fetch).toHaveBeenCalledTimes(2);
  view.unmount();
  render(panel("cn"));
  expect(screen.getByText(USER_RELEASE_NOTES.at(-1).version)).toBeVisible();
  expect(fetch).toHaveBeenCalledTimes(2);
});
