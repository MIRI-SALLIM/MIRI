import { expect, test } from "@playwright/test";

import { joinDeepSession, loginReviewer, startDeepSession } from "./support/deep-flow";

// 심사용 로그인은 세션을 DB에 쓰므로 MongoDB가 필요하다(auth/dependencies.py가 DB 없이는
// 503 AUTH_UNAVAILABLE을 낸다). 관리형 서버를 쓰면서 Mongo 플래그가 없으면 백엔드가
// 인메모리로 뜨고 이 스펙만 불투명한 503으로 죽는다. 이유를 밝히고 건너뛴다.
const usesManagedBackend = !process.env.PLAYWRIGHT_BASE_URL;
const hasMongo = process.env.MIRISALLIM_E2E_USE_MONGO === "1";

test.skip(
  usesManagedBackend && !hasMongo,
  "심사용 로그인은 MongoDB가 필요해요. MIRISALLIM_E2E_USE_MONGO=1과 실행 중인 Mongo가 있어야 해요.",
);

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
    await joinDeepSession(pageB, created.inviteUrl);

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
