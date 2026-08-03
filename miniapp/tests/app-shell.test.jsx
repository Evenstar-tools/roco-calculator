import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import IndexPage from "../src/pages/index/index.jsx";

describe("miniapp shell", () => {
  test("renders the calculator title without requesting identity", () => {
    render(<IndexPage />);
    expect(screen.getByText("洛克对战计算器")).toBeInTheDocument();
    expect(screen.queryByText("微信登录")).not.toBeInTheDocument();
  });
});
