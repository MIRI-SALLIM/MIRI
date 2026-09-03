import { expect, test } from "@playwright/test";

import {
  answerEveryQuestion,
  joinInvitation,
  startLightSession,
  submitLightForm,
} from "./support/light-flow";

test("two independent participants can complete the light flow and download a share card", async ({ browser }) => {
  test.setTimeout(45_000);

  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  try {
    await pageA.goto("/");
    await startLightSession(pageA);
    await answerEveryQuestion(pageA, 0, 0);

    const sessionResponse = await pageA.request.get("/api/v1/me/session");
    expect(sessionResponse.ok()).toBe(true);
    const session = (await sessionResponse.json()) as { id: string; invitationCode: string };
    const invitationUrl = new URL(`/invite/${session.invitationCode}`, pageA.url()).toString();

    await joinInvitation(pageB, invitationUrl);
    await submitLightForm(pageA);
    await expect(pageA.getByRole("heading", { name: "제출 완료" })).toBeVisible();
    await pageA.getByRole("link", { name: "상대방을 기다리러 가기" }).click();
    await expect(pageA.getByRole("heading", { name: "상대방을 기다리는 중" })).toBeVisible();

    // 대기 중 결과 URL 방문이 waiting 응답을 캐시에 남긴다. goto가 부팅한 SPA 안에서
    // 클라이언트 리다이렉트로 /waiting에 닿으므로, 이후 reload 없이 진행해야 캐시가 남는다.
    await pageA.goto(`/result/light/${session.id}`);
    await expect(pageA.getByRole("heading", { name: "상대방을 기다리는 중" })).toBeVisible();

    await answerEveryQuestion(pageB, 1, 1);
    await submitLightForm(pageB);
    await pageB.getByRole("link", { name: "상대방을 기다리러 가기" }).click();
    await expect(pageB.getByRole("heading", { name: "상대방을 기다리는 중" })).toBeVisible();

    const resultLinkA = pageA.getByRole("link", { name: "결과 보기" });
    const resultLinkB = pageB.getByRole("link", { name: "결과 보기" });
    await expect(resultLinkA).toBeVisible({ timeout: 15_000 });
    await expect(resultLinkB).toBeVisible({ timeout: 15_000 });
    await Promise.all([resultLinkA.click(), resultLinkB.click()]);

    await expect(pageA.getByRole("heading", { name: "라이트 결과" })).toBeVisible();
    await expect(pageB.getByRole("heading", { name: "라이트 결과" })).toBeVisible();

    const scoreA = await pageA.getByText(/^\d+ \/ \d+$/).first().innerText();
    const scoreB = await pageB.getByText(/^\d+ \/ \d+$/).first().innerText();
    expect(scoreA).toBe(scoreB);

    await pageA.getByRole("link", { name: "결과 공유" }).click();
    await expect(pageA.getByRole("heading", { name: "결과 공유" })).toBeVisible();
    const download = pageA.waitForEvent("download");
    await pageA.getByRole("button", { name: "이미지 저장" }).click();
    await expect(download).resolves.toBeTruthy();
  } finally {
    await contextA.close();
    await contextB.close();
  }
});
