import { expect, type Page } from "@playwright/test";

const REVIEWER_PASSWORDS = {
  A: "synthetic-password-a",
  B: "synthetic-password-b",
} as const;

export async function loginReviewer(page: Page, role: "A" | "B", roomCode?: string): Promise<string> {
  const response = await page.request.post("/api/v1/auth/reviewer/login", {
    data: {
      password: REVIEWER_PASSWORDS[role],
      ...(roomCode === undefined ? {} : { roomCode }),
      username: role === "A" ? "judge-a" : "judge-b",
    },
    headers: { Origin: new URL(page.url()).origin },
  });
  expect(response.ok()).toBe(true);
  const context = (await response.json()) as { roomCode: string; role: string };
  expect(context.role).toBe(role);
  return context.roomCode;
}

export async function startDeepSession(page: Page): Promise<{ invitationCode: string; sessionId: string }> {
  await page.goto("/deep");
  await expect(page.getByRole("button", { name: "딥 세션 시작하기" })).toBeVisible();
  await page.getByRole("button", { name: "딥 세션 시작하기" }).click();
  await expect(page.getByRole("heading", { name: "딥 세션을 기다리는 중" })).toBeVisible();

  const url = new URL(page.url());
  const sessionId = url.pathname.split("/").at(-1);
  const invitationCode = url.searchParams.get("inviteCode");
  if (!sessionId || !invitationCode) {
    throw new Error("Deep waiting URL did not expose its public session id and invitation code.");
  }

  return { invitationCode, sessionId: decodeURIComponent(sessionId) };
}

export async function joinDeepSession(page: Page, invitationCode: string): Promise<void> {
  await page.goto(`/deep/invite/${encodeURIComponent(invitationCode)}`);
  await expect(page.getByRole("heading", { name: "딥 모드 초대 참여" })).toBeVisible();
  await page.getByRole("button", { name: "딥 세션 참여하기" }).click();
  await expect(page.getByRole("heading", { name: "딥 세션을 기다리는 중" })).toBeVisible();
}
