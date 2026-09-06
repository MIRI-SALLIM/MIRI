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
  await expect(page.getByTestId("deep-invite-url")).toBeVisible();

  const url = new URL(page.url());
  const sessionId = url.pathname.split("/").at(-1);
  expect(url.search).toBe("");

  // Derive the code from the URL rendered by the application. Assembling it here would
  // allow the E2E to pass while the copy/share link itself is broken.
  const inviteUrl = (await page.getByTestId("deep-invite-url").innerText()).trim();
  const invitationUrl = new URL(inviteUrl);
  const invitationCode = invitationUrl.pathname.split("/").at(-1);
  if (!sessionId || !invitationCode) {
    throw new Error("Deep waiting screen did not expose its public session id and invitation link.");
  }

  return {
    inviteUrl,
    invitationCode: decodeURIComponent(invitationCode),
    sessionId: decodeURIComponent(sessionId),
  };
}

/** 실제로 복사되는 링크를 그대로 연다. URL을 직접 조립하면 복사 결함을 우회하게 된다. */
export async function joinDeepSession(page: Page, inviteUrl: string): Promise<void> {
  await page.goto(inviteUrl);
  await expect(page.getByRole("heading", { name: "딥 모드 초대 참여" })).toBeVisible();
  await page.getByRole("button", { name: "딥 세션 참여하기" }).click();
  await expect(page.getByRole("heading", { name: "딥 세션에 참여했어요" })).toBeVisible();

  const waitingUrl = new URL(page.url());
  expect(waitingUrl.search).toBe("");
  await expect(page.getByRole("heading", { name: "상대를 초대해요" })).toHaveCount(0);
  await expect(page.getByTestId("deep-invite-url")).toHaveCount(0);
}
