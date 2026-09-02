import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";

import {
  answerEveryQuestion,
  joinInvitation,
  startLightSession,
  submitLightForm,
} from "./support/light-flow";

async function expectNoSeriousOrCriticalViolations(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
  const results = await new AxeBuilder({ page }).analyze();
  const blockingViolations = results.violations.filter(
    ({ impact }) => impact === "serious" || impact === "critical",
  );

  expect(blockingViolations, blockingViolations.map(({ id }) => id).join(", ")).toEqual([]);
}

async function openReadyPair(browser: Browser): Promise<{
  contextA: BrowserContext;
  contextB: BrowserContext;
  pageA: Page;
  pageB: Page;
}> {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  await pageA.goto("/");
  await startLightSession(pageA);
  await answerEveryQuestion(pageA, 0, 0);

  const sessionResponse = await pageA.request.get("/api/v1/me/session");
  expect(sessionResponse.ok()).toBe(true);
  const session = (await sessionResponse.json()) as { invitationCode: string };
  await joinInvitation(pageB, new URL(`/invite/${session.invitationCode}`, pageA.url()).toString());

  await submitLightForm(pageA);
  await pageA.getByRole("link", { name: "상대방을 기다리러 가기" }).click();
  await expect(pageA.getByRole("heading", { name: "상대방을 기다리는 중" })).toBeVisible();

  await answerEveryQuestion(pageB, 1, 1);
  await submitLightForm(pageB);
  await pageB.getByRole("link", { name: "상대방을 기다리러 가기" }).click();
  await expect(pageB.getByRole("heading", { name: "상대방을 기다리는 중" })).toBeVisible();

  await expect(pageA.getByRole("link", { name: "결과 보기" })).toBeVisible({ timeout: 15_000 });
  await pageA.getByRole("link", { name: "결과 보기" }).click();
  await expect(pageA.getByRole("heading", { name: "라이트 결과" })).toBeVisible();

  return { contextA, contextB, pageA, pageB };
}

test("reachable light states have no serious or critical accessibility violations", async ({ browser }) => {
  test.setTimeout(90_000);

  const landingContext = await browser.newContext();
  const landingPage = await landingContext.newPage();
  await landingPage.goto("/");
  await expectNoSeriousOrCriticalViolations(landingPage);

  await startLightSession(landingPage);
  await expectNoSeriousOrCriticalViolations(landingPage);
  await landingContext.close();

  const { contextA, contextB, pageA } = await openReadyPair(browser);
  try {
    await expectNoSeriousOrCriticalViolations(pageA);

    await pageA.getByRole("link", { name: "결과 공유" }).click();
    await expect(pageA.getByRole("heading", { name: "결과 공유" })).toBeVisible();
    await expectNoSeriousOrCriticalViolations(pageA);
  } finally {
    await contextA.close();
    await contextB.close();
  }
});

test("core light controls remain keyboard reachable with visible focus", async ({ page }) => {
  await page.goto("/");

  const startButton = page.getByRole("button", { name: "가볍게 맞춰보기 시작하기" });
  await startButton.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "가볍게 맞춰보기" })).toBeVisible();

  const answerButton = page.getByRole("group", { name: "내 답" }).getByRole("button").first();
  await answerButton.focus();
  await page.keyboard.press("Space");
  await expect(answerButton).toHaveAttribute("aria-pressed", "true");

  const guessButton = page.getByRole("group", { name: "상대 예측" }).getByRole("button").first();
  await guessButton.focus();
  await page.keyboard.press("Space");
  await expect(guessButton).toHaveAttribute("aria-pressed", "true");

  const nextButton = page.getByRole("button", { name: "다음 질문", exact: true });
  await nextButton.focus();
  expect(await nextButton.evaluate((element) => document.activeElement === element)).toBe(true);

  const questionCount = Number(
    await page.getByRole("progressbar", { name: "진행률" }).getAttribute("aria-valuemax"),
  );
  await page.goto(`/light/${questionCount}`);
  const submitButton = page.getByRole("button", { name: "입력 완료하기" });
  await expect(submitButton).toBeVisible();
  await submitButton.focus();
  const focusStyle = await submitButton.evaluate((element) => {
    const style = getComputedStyle(element);
    return { outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth };
  });
  expect(focusStyle.outlineStyle).not.toBe("none");
  expect(Number.parseFloat(focusStyle.outlineWidth)).toBeGreaterThan(0);
});

test("share ratio controls expose pressed state to the keyboard", async ({ browser }) => {
  test.setTimeout(90_000);
  const { contextA, contextB, pageA } = await openReadyPair(browser);

  try {
    await pageA.getByRole("link", { name: "결과 공유" }).click();
    await expect(pageA.getByRole("heading", { name: "결과 공유" })).toBeVisible();

    const squareRatio = pageA.getByRole("button", { name: "정사각형 1:1" });
    await squareRatio.focus();
    await pageA.keyboard.press("Space");
    await expect(squareRatio).toHaveAttribute("aria-pressed", "true");
  } finally {
    await contextA.close();
    await contextB.close();
  }
});
