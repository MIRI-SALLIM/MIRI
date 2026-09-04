import { expect, test } from "@playwright/test";

import { answerEveryQuestion, startLightSession } from "./support/light-flow";

test("a waiting result response exposes only the gate fields", async ({ page }) => {
  test.setTimeout(30_000);

  await page.goto("/");
  await startLightSession(page);
  await answerEveryQuestion(page);

  const sessionResponse = await page.request.get("/api/v1/me/session");
  expect(sessionResponse.ok()).toBe(true);
  const session = (await sessionResponse.json()) as { id: string };

  const waitingResponse = page.waitForResponse(
    (response) =>
      response.ok() &&
      response.request().method() === "GET" &&
      response.url().endsWith(`/api/v1/sessions/${session.id}/result`),
    { timeout: 10_000 },
  );
  await page.getByRole("button", { name: "입력 완료하기" }).click();
  await expect(page.getByRole("heading", { name: "상대방을 기다리는 중" })).toBeVisible();
  await page.goto(`/result/light/${session.id}`);

  const body = (await (await waitingResponse).json()) as Record<string, unknown>;

  expect(Object.keys(body).sort()).toEqual(["partnerCompleted", "status"]);
  expect(body).toEqual({ partnerCompleted: false, status: "waiting" });
  expect(JSON.stringify(body)).not.toMatch(/answers|guesses|result|type|score/i);

  await expect(page.getByRole("heading", { name: "상대방을 기다리는 중" })).toBeVisible();
  const visibleText = await page.locator("body").innerText();
  expect(visibleText).not.toMatch(/라이트 결과|파트너 유형|서로 맞힌 답/);

  const storage = await page.evaluate(() => ({
    local: Object.fromEntries(Object.entries(localStorage)),
    session: Object.fromEntries(Object.entries(sessionStorage)),
  }));
  expect(JSON.stringify(storage)).not.toMatch(/answers|guesses|result|type|score|nickname|participant token/i);
});
