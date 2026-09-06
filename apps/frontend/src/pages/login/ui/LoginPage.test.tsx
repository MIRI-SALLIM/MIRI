import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

const useAccount = vi.hoisted(() => vi.fn());
const useAuthProviders = vi.hoisted(() => vi.fn());

vi.mock("@/entities/account", () => ({ useAccount, useAuthProviders }));

import { LoginPage } from "./LoginPage";

function renderPage(providers: { kakao: boolean | null } = { kakao: true }) {
  useAuthProviders.mockReturnValue(providers);

  return render(
    <MemoryRouter initialEntries={["/login"]}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/deep" element={<h1>딥모드 입구</h1>} />
        <Route path="/" element={<h1>랜딩</h1>} />
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

  it("sends an authenticated account to the landing page, not into deep mode", () => {
    // 헤더의 "로그인"은 모든 화면에 있다. 여기서 /deep으로 보내면 결과 화면이 없는 동안에도
    // 두 번의 클릭으로 실세션을 만들 수 있게 된다. 갈 곳은 returnTo로만 지정한다.
    useAccount.mockReturnValue({ state: "authenticated", userId: "account-user" });
    renderPage();

    expect(screen.getByRole("heading", { name: "랜딩" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "딥모드 입구" })).not.toBeInTheDocument();
  });
});
