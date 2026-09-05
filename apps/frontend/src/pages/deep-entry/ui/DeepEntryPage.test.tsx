import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

const useAccount = vi.hoisted(() => vi.fn());

vi.mock("@/entities/account", () => ({ useAccount }));

import { DeepEntryPage } from "./DeepEntryPage";

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/deep"]}>
      <DeepEntryPage />
    </MemoryRouter>,
  );
}

describe("DeepEntryPage", () => {
  it("shows the preparation message for an authenticated account", () => {
    useAccount.mockReturnValue({ state: "authenticated", userId: "account-user" });
    renderPage();

    expect(screen.getByRole("heading", { name: "제대로 계산해보기" })).toBeInTheDocument();
    expect(screen.getByText(/딥모드는 아직 준비 중이에요/)).toBeInTheDocument();
  });

  it("links an unauthenticated visitor to the login page", () => {
    useAccount.mockReturnValue({ state: "unauthenticated", userId: null });
    renderPage();

    expect(screen.getByRole("link", { name: "카카오로 로그인하기" })).toHaveAttribute("href", "/login");
  });

  it("does not offer login when the authentication feature is disabled", () => {
    useAccount.mockReturnValue({ state: "disabled", userId: null });
    renderPage();

    expect(screen.getByRole("alert")).toHaveTextContent("현재 딥모드를 사용할 수 없어요.");
    expect(screen.queryByRole("link", { name: "카카오로 로그인하기" })).not.toBeInTheDocument();
  });

  it("announces account loading", () => {
    useAccount.mockReturnValue({ state: "loading", userId: null });
    renderPage();

    expect(screen.getByRole("status")).toHaveTextContent("로그인 상태를 확인하고 있어요.");
  });
});
