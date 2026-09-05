import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";

const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

beforeEach(() => { window.history.replaceState({}, "", "/deep/login-check"); });
afterEach(() => {
  window.history.replaceState({}, "", "/");
  vi.unstubAllGlobals();
});

describe("Kakao-only login check", () => {
  it("offers only Kakao login when the user is signed out", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(reply({}, 401));
    vi.stubGlobal("fetch", fetcher);

    render(<App />);

    expect(await screen.findByRole("link", { name: "카카오 로그인 시작" })).toHaveAttribute(
      "href",
      "/api/v1/auth/kakao/start?returnTo=%2Fdeep%2Flogin-check",
    );
    expect(screen.queryByText(/심사용/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText("비밀번호")).not.toBeInTheDocument();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith(
      "/api/v1/auth/me",
      expect.objectContaining({ credentials: "same-origin" }),
    );
  });

  it("restores a Kakao session and opens the deep flow", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(reply({ userId: "kakao-test-user" })));

    render(<App />);

    expect(await screen.findByText("일반 계정 로그인됨")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "진단 만들기" })).toBeInTheDocument();
    expect(screen.queryByText(/심사용/)).not.toBeInTheDocument();
  });

  it("logs out the Kakao session and returns to the login link", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(reply({ userId: "kakao-test-user" }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetcher);
    render(<App />);
    await screen.findByText("일반 계정 로그인됨");

    await userEvent.click(screen.getByRole("button", { name: "로그아웃" }));

    expect(await screen.findByRole("link", { name: "카카오 로그인 시작" })).toBeInTheDocument();
    expect(fetcher.mock.calls[1]).toEqual([
      "/api/v1/auth/logout",
      expect.objectContaining({ method: "POST", credentials: "same-origin" }),
    ]);
  });

  it("shows a safe connection error without provider details", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(
      reply({ error: { message: "DO_NOT_ECHO_PROVIDER_DETAIL" } }, 503),
    ));

    render(<App />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("로그인 서버에 연결할 수 없습니다.");
    expect(alert).not.toHaveTextContent("DO_NOT_ECHO_PROVIDER_DETAIL");
    await waitFor(() => expect(screen.getByRole("link", { name: "카카오 로그인 시작" })).toBeInTheDocument());
  });
});
