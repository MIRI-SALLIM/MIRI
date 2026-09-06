import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { LoginPage } from "./LoginPage";

const { useAccountMock, useAuthProvidersMock } = vi.hoisted(() => ({
  useAccountMock: vi.fn(),
  useAuthProvidersMock: vi.fn(),
}));

vi.mock("@/entities/account", () => ({ useAccount: useAccountMock, useAuthProviders: useAuthProvidersMock }));

function renderLogin(path: string) {
  useAuthProvidersMock.mockReturnValue({ kakao: true });

  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<LoginPage />} path="/login" />
        <Route element={<h1>랜딩</h1>} path="/" />
        <Route element={<h1>딥 허브</h1>} path="/deep" />
        <Route element={<h1>초대 참여</h1>} path="/deep/invite/:code" />
      </Routes>
    </MemoryRouter>,
  );
}

describe("LoginPage returnTo", () => {
  it("보내 준 곳이 없으면 딥이 아니라 랜딩으로 돌려보낸다", () => {
    // 헤더의 "로그인"은 모든 화면에 있다. 기본값이 /deep이면 결과 화면이 없는 동안에도
    // 두 번의 클릭으로 실세션을 만들 수 있게 된다.
    useAccountMock.mockReturnValue({ state: "authenticated", userId: "u1" });
    renderLogin("/login");

    expect(screen.getByRole("heading", { name: "랜딩" })).toBeInTheDocument();
  });

  it("초대처럼 갈 곳이 분명하면 그 자리로 돌려보낸다", () => {
    useAccountMock.mockReturnValue({ state: "authenticated", userId: "u1" });
    renderLogin(`/login?returnTo=${encodeURIComponent("/deep/invite/INV-1")}`);

    expect(screen.getByRole("heading", { name: "초대 참여" })).toBeInTheDocument();
  });

  it.each(["//evil.com", "https://evil.com", "/result/light/abc", "/deep/../../result", "javascript:alert(1)"])(
    "%s 는 랜딩으로 접는다",
    (returnTo) => {
      useAccountMock.mockReturnValue({ state: "authenticated", userId: "u1" });
      renderLogin(`/login?returnTo=${encodeURIComponent(returnTo)}`);

      expect(screen.getByRole("heading", { name: "랜딩" })).toBeInTheDocument();
    },
  );
});
