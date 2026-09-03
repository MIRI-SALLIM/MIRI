import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  answerEveryQuestion,
  openReadyPair,
  startLightSession,
  submitLightForm,
} from "./support/light-flow";

async function expectNoSeriousOrCriticalViolations(page: Page, state: string): Promise<void> {
  await page.waitForLoadState("networkidle");
  await expect
    .poll(
      () =>
        page.evaluate(
          () => document.getAnimations().filter((animation) => animation.playState === "running").length,
        ),
      { message: `${state}: animations did not settle`, timeout: 10_000 },
    )
    .toBe(0);
  await page.evaluate(async () => {
    await Promise.all(document.getAnimations().map((animation) => animation.finished));
  });
  await page.evaluate(() => document.fonts.ready);
  const results = await new AxeBuilder({ page }).analyze();
  const blockingViolations = results.violations.filter(
    ({ impact }) => impact === "serious" || impact === "critical",
  );

  expect(blockingViolations, `${state}: ${blockingViolations.map(({ id }) => id).join(", ")}`).toEqual([]);
}

async function tabUntilFocused(page: Page, target: Locator, maxTabs = 80): Promise<void> {
  for (let tabCount = 0; tabCount < maxTabs; tabCount += 1) {
    await page.keyboard.press("Tab");
    if (await target.evaluate((element) => document.activeElement === element)) {
      return;
    }
  }

  throw new Error(`Could not reach ${await target.getAttribute("aria-label")} with Tab.`);
}

test("reachable light states have no serious or critical accessibility violations", async ({ browser }) => {
  test.setTimeout(120_000);

  // fadeup(opacity 0 -> 1)이 도는 중간 상태를 axe가 샘플하면 글자색이 배경과 섞여
  // 대비가 기준에 못 미치는 것으로 잡힌다. globals.css가 prefers-reduced-motion에서
  // 모든 애니메이션을 0.01ms로 줄이므로, 이 설정으로 중간 상태 자체를 없앤다.
  // 대비는 정착 상태에서만 의미가 있고, 이 경로는 실제 사용자 설정이기도 하다.
  const contextA = await browser.newContext({ reducedMotion: "reduce" });
  const contextB = await browser.newContext({ reducedMotion: "reduce" });
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  try {
    await pageA.goto("/");
    await expectNoSeriousOrCriticalViolations(pageA, "landing");

    await startLightSession(pageA);
    await expectNoSeriousOrCriticalViolations(pageA, "light form");
    await answerEveryQuestion(pageA, 0, 0);

    const sessionResponse = await pageA.request.get("/api/v1/me/session");
    expect(sessionResponse.ok()).toBe(true);
    const session = (await sessionResponse.json()) as { id: string; invitationCode: string };
    const invitationUrl = new URL(`/invite/${session.invitationCode}`, pageA.url()).toString();

    await pageB.goto(invitationUrl);
    await expect(pageB.getByText("파트너가 함께 해보자고 초대했어요")).toBeVisible();
    await expectNoSeriousOrCriticalViolations(pageB, "invite");

    await submitLightForm(pageA);
    await expect(pageA.getByRole("heading", { name: "상대방을 기다리는 중" })).toBeVisible();
    await expect(pageA.getByRole("heading", { name: "아직 상대가 들어오지 않았어요" })).toBeVisible();
    await expect(pageA.getByRole("button", { name: "초대 링크 복사" })).toBeVisible();
    await expectNoSeriousOrCriticalViolations(pageA, "waiting");

    await pageB.getByRole("button", { name: "참여하고 시작하기" }).click();
    await expect(pageB.getByRole("heading", { name: "가볍게 맞춰보기" })).toBeVisible();
    await answerEveryQuestion(pageB, 1, 1);
    await submitLightForm(pageB);

    await expect(pageA.getByRole("link", { name: "결과 보기" })).toBeVisible({ timeout: 15_000 });
    await pageA.getByRole("link", { name: "결과 보기" }).click();
    await expect(pageA.getByRole("heading", { name: "라이트 결과" })).toBeVisible();
    await expectNoSeriousOrCriticalViolations(pageA, "ready result");

    await pageA.getByRole("link", { name: "결과 공유" }).click();
    await expect(pageA.getByRole("heading", { name: "결과 공유" })).toBeVisible();
    await expectNoSeriousOrCriticalViolations(pageA, "share");
  } finally {
    await contextA.close();
    await contextB.close();
  }
});

test("core light controls remain keyboard reachable with visible focus", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/");

  const startButton = page.getByRole("button", { name: "가볍게 맞춰보기 시작하기" });
  await tabUntilFocused(page, startButton);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "가볍게 맞춰보기" })).toBeVisible();
  const progress = page.getByRole("progressbar", { name: "진행률" });
  await expect(progress).toBeVisible();

  const answerButton = page.getByRole("group", { name: "내 답" }).getByRole("button").first();
  await tabUntilFocused(page, answerButton);
  await page.keyboard.press("Space");
  await expect(answerButton).toHaveAttribute("aria-pressed", "true");

  const guessButton = page.getByRole("group", { name: "상대 예측" }).getByRole("button").first();
  await tabUntilFocused(page, guessButton);
  await page.keyboard.press("Space");
  await expect(guessButton).toHaveAttribute("aria-pressed", "true");

  const nextButton = page.getByRole("button", { name: "다음 질문", exact: true });
  await tabUntilFocused(page, nextButton);
  await expect(nextButton).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(progress).toHaveAttribute("aria-valuenow", "2");

  const previousButton = page.getByRole("button", { name: "이전", exact: true });
  await tabUntilFocused(page, previousButton);
  await expect(previousButton).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(progress).toHaveAttribute("aria-valuenow", "1");

  await tabUntilFocused(page, nextButton);
  await page.keyboard.press("Enter");
  await expect(progress).toHaveAttribute("aria-valuenow", "2");

  const questionCount = Number(
    await progress.getAttribute("aria-valuemax"),
  );
  for (let questionIndex = 1; questionIndex < questionCount; questionIndex += 1) {
    const currentAnswerButton = page.getByRole("group", { name: "내 답" }).getByRole("button").first();
    const currentGuessButton = page
      .getByRole("group", { name: "상대 예측" })
      .getByRole("button")
      .first();
    await tabUntilFocused(page, currentAnswerButton);
    await page.keyboard.press("Space");
    await tabUntilFocused(page, currentGuessButton);
    await page.keyboard.press("Space");

    if (questionIndex < questionCount - 1) {
      const currentNextButton = page.getByRole("button", { name: "다음 질문", exact: true });
      await tabUntilFocused(page, currentNextButton);
      await page.keyboard.press("Enter");
      await expect(progress).toHaveAttribute("aria-valuenow", String(questionIndex + 2));
    }
  }

  const submitButton = page.getByRole("button", { name: "입력 완료하기" });
  await tabUntilFocused(page, submitButton);
  await expect(submitButton).toBeFocused();
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
    const portraitRatio = pageA.getByRole("button", { name: "세로 9:16" });
    await tabUntilFocused(pageA, squareRatio);
    await expect(squareRatio).toBeFocused();
    await pageA.keyboard.press("Space");
    await expect(squareRatio).toHaveAttribute("aria-pressed", "true");
    await expect(portraitRatio).toHaveAttribute("aria-pressed", "false");

    await tabUntilFocused(pageA, portraitRatio);
    await expect(portraitRatio).toBeFocused();
    await pageA.keyboard.press("Enter");
    await expect(portraitRatio).toHaveAttribute("aria-pressed", "true");
    await expect(squareRatio).toHaveAttribute("aria-pressed", "false");
  } finally {
    await contextA.close();
    await contextB.close();
  }
});
