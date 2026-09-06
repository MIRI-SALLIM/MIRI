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

export async function startDeepSession(page: Page): Promise<{ inviteUrl: string; invitationCode: string; sessionId: string }> {
  await page.goto("/deep");
  await expect(page.getByRole("button", { name: "딥 세션 시작하기" })).toBeVisible();
  await page.getByRole("button", { name: "딥 세션 시작하기" }).click();
  await expect(page.getByRole("heading", { name: "딥 세션이 열렸어요" })).toBeVisible();

  const url = new URL(page.url());
  const sessionId = url.pathname.split("/").at(-1);
  const invitationCode = url.searchParams.get("inviteCode");
  if (!sessionId || !invitationCode) {
    throw new Error("Deep waiting URL did not expose its public session id and invitation code.");
  }

  // 화면이 실제로 보여 주는 초대 링크를 그대로 쓴다. 여기서 URL을 조립하면
  // 복사 링크가 잘못돼도 E2E가 통과해 버린다.
  const inviteUrl = (await page.getByTestId("deep-invite-url").innerText()).trim();

  return { inviteUrl, invitationCode, sessionId: decodeURIComponent(sessionId) };
}

/** 실제로 복사되는 링크를 그대로 연다. URL을 직접 조립하면 복사 결함을 우회하게 된다. */
export async function joinDeepSession(page: Page, inviteUrl: string): Promise<void> {
  await page.goto(inviteUrl);
  await expect(page.getByRole("heading", { name: "딥 모드 초대 참여" })).toBeVisible();
  await page.getByRole("button", { name: "딥 세션 참여하기" }).click();
  await expect(page.getByRole("heading", { name: "딥 세션이 열렸어요" })).toBeVisible();
}
