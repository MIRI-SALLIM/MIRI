import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";

const room = "a".repeat(64);
const context = { userId: "reviewer-user-a", role: "A", roomCode: room, expiresAt: "2026-09-04T00:00:00Z", demo: true };
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

beforeEach(() => { window.history.replaceState({}, "", "/deep/login-check"); });
afterEach(() => {
  window.history.replaceState({}, "", "/");
  vi.unstubAllGlobals();
});

describe("minimal login check", () => {
  it("recognizes a normal account when reviewer context is unavailable", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(reply({}, 403)).mockResolvedValueOnce(reply({ userId: "kakao-test-user" }));
    vi.stubGlobal("fetch", fetcher);
    render(<App />);
    expect(await screen.findByText("일반 계정 로그인됨")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "진단 만들기" })).toBeInTheDocument();
    expect(fetcher.mock.calls[1][0]).toBe("/api/v1/auth/me");
    expect(screen.getByRole("link", { name: "카카오 로그인 시작" })).toHaveAttribute("href", "/api/v1/auth/kakao/start?returnTo=%2Fdeep%2Flogin-check");
  });

  it("requires explicit reset confirmation and clears the old diagnostic context", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(reply(context)).mockResolvedValueOnce(reply({ id: "old-session" }))
      .mockResolvedValueOnce(reply({ ...context, userId: "new-user", roomCode: "b".repeat(64) }));
    vi.stubGlobal("fetch", fetcher);
    render(<App />);
    await screen.findByText("로그인됨 · A");
    await userEvent.click(screen.getByRole("button", { name: "진단 만들기" }));
    expect(await screen.findByLabelText("현재 진단 ID")).toHaveValue("old-session");
    expect(screen.getByRole("button", { name: "새 체험방으로 초기화" })).toBeDisabled();
    await userEvent.click(screen.getByLabelText("기존 체험방과 두 사람의 로그인·진단을 종료하고 초기화합니다"));
    await userEvent.click(screen.getByRole("button", { name: "새 체험방으로 초기화" }));
    await waitFor(() => expect(screen.getByLabelText("현재 체험방 코드")).toHaveValue("b".repeat(64)));
    expect(screen.queryByLabelText("현재 진단 ID")).not.toBeInTheDocument();
    expect(JSON.parse(fetcher.mock.calls[2][1].body)).toEqual({ confirm: true });
  });
  it("logs in A without a room code, clears the password and logs out", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(reply({}, 401))
      .mockResolvedValueOnce(reply(context)).mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetcher);
    render(<App />);
    await userEvent.type(await screen.findByLabelText("비밀번호"), "synthetic-password-a");
    await userEvent.click(screen.getByRole("button", { name: "심사용 로그인" }));
    expect(await screen.findByText("로그인됨 · A")).toBeInTheDocument();
    const [, options] = fetcher.mock.calls[1];
    expect(JSON.parse(options.body)).toEqual({ username: "judge-a", password: "synthetic-password-a" });
    expect(options.credentials).toBe("same-origin");
    expect(screen.queryByLabelText("비밀번호")).not.toBeInTheDocument();
    expect(screen.getByLabelText("현재 체험방 코드")).toHaveValue(room);
    await userEvent.click(screen.getByRole("button", { name: "로그아웃" }));
    expect(await screen.findByLabelText("비밀번호")).toHaveValue("");
    expect(screen.queryByLabelText("현재 체험방 코드")).not.toBeInTheDocument();
  });

  it("passes B's room code only in the POST body and never saves credentials", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(reply({}, 401)).mockResolvedValueOnce(reply({ ...context, role: "B", userId: "reviewer-user-b" }));
    vi.stubGlobal("fetch", fetcher);
    const storage = vi.spyOn(Storage.prototype, "setItem");
    render(<App />);
    await userEvent.selectOptions(await screen.findByLabelText("계정"), "judge-b");
    await userEvent.type(screen.getByLabelText("비밀번호"), "synthetic-password-b");
    await userEvent.type(screen.getByLabelText("체험방 코드 (선택)"), room);
    await userEvent.click(screen.getByRole("button", { name: "심사용 로그인" }));
    expect(await screen.findByText("로그인됨 · B")).toBeInTheDocument();
    expect(fetcher.mock.calls[1][0]).toBe("/api/v1/auth/reviewer/login");
    expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({ username: "judge-b", password: "synthetic-password-b", roomCode: room });
    expect(window.location.search).toBe("");
    expect(storage).not.toHaveBeenCalled();
  });

  it.each([401, 404, 503])("shows a safe error and clears the password on HTTP %s", async (status) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(reply({}, 401))
      .mockResolvedValueOnce(reply({ error: { message: "DO_NOT_ECHO_PROVIDER_DETAIL" } }, status)));
    render(<App />);
    await userEvent.type(await screen.findByLabelText("비밀번호"), "synthetic-password-a");
    await userEvent.click(screen.getByRole("button", { name: "심사용 로그인" }));
    expect(await screen.findByRole("alert")).not.toHaveTextContent("DO_NOT_ECHO_PROVIDER_DETAIL");
    expect(screen.getByLabelText("비밀번호")).toHaveValue("");
    expect(screen.queryByText(/로그인됨/)).not.toBeInTheDocument();
  });

  it("restores an existing cookie session and clears stale room data after expiry", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(reply(context)).mockResolvedValueOnce(reply({}, 401));
    vi.stubGlobal("fetch", fetcher);
    render(<App />);
    expect(await screen.findByText("로그인됨 · A")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "로그인 상태 확인" }));
    await waitFor(() => expect(screen.queryByLabelText("현재 체험방 코드")).not.toBeInTheDocument());
    expect(await screen.findByLabelText("비밀번호")).toBeInTheDocument();
  });
});
