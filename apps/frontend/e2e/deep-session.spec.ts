import { expect, test } from "@playwright/test";

import { joinDeepSession, loginReviewer, startDeepSession } from "./support/deep-flow";

test("reviewer accounts can create, join, and withdraw a deep session", async ({ browser }) => {
  test.setTimeout(45_000);

  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  try {
    await pageA.goto("/deep");
    const roomCode = await loginReviewer(pageA, "A");
    await pageB.goto("/deep");
    await loginReviewer(pageB, "B", roomCode);

    const created = await startDeepSession(pageA);
    await joinDeepSession(pageB, created.invitationCode);

    expect(new URL(pageB.url()).pathname).toBe(`/deep/waiting/${created.sessionId}`);
    const status = await pageA.request.get(`/api/v1/deep/v3/sessions/${created.sessionId}/status`);
    expect(status.ok()).toBe(true);

    await pageA.getByRole("button", { name: "세션 나가기" }).click();
    await pageA.getByRole("button", { name: "세션 닫기" }).click();
    await expect(pageA.getByRole("heading", { name: "제대로 계산해보기" })).toBeVisible();
  } finally {
    await contextA.close();
    await contextB.close();
  }
});
