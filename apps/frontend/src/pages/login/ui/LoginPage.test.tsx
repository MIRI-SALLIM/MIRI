import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

const useAccount = vi.hoisted(() => vi.fn());

vi.mock("@/entities/account", () => ({ useAccount }));

import { LoginPage } from "./LoginPage";

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/login"]}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/deep" element={<h1>딥모드 입구</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("LoginPage", () => {
  it("offers Kakao login to an unauthenticated account", () => {
    useAccount.mockReturnValue({ state: "unauthenticated", userId: null });
    renderPage();

    expect(screen.getByRole("heading", { name: "카카오 로그인" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "카카오로 로그인" })).toBeEnabled();
  });

  it("does not offer navigation when the authentication feature is disabled", () => {
    useAccount.mockReturnValue({ state: "disabled", userId: null });
    renderPage();

    expect(screen.getByRole("button", { name: "카카오로 로그인" })).toBeDisabled();
    expect(screen.getByText(/현재 로그인 기능을 사용할 수 없어요/)).toBeInTheDocument();
  });

  it("announces loading account status", () => {
    useAccount.mockReturnValue({ state: "loading", userId: null });
    renderPage();

    expect(screen.getByRole("status")).toHaveTextContent("로그인 상태를 확인하고 있어요.");
  });

  it("announces an account lookup error", () => {
    useAccount.mockReturnValue({ state: "error", userId: null });
    renderPage();

    expect(screen.getByRole("alert")).toHaveTextContent("로그인 상태를 확인할 수 없어요.");
  });

  it("redirects an authenticated account to the deep entry", () => {
    useAccount.mockReturnValue({ state: "authenticated", userId: "account-user" });
    renderPage();

    expect(screen.getByRole("heading", { name: "딥모드 입구" })).toBeInTheDocument();
  });
});
