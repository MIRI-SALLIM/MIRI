import {
  expect,
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
  type Response,
} from "@playwright/test";

const ASSERTION_TIMEOUT = 10_000;

async function waitForLightForm(page: Page): Promise<void> {
  await expect(page.getByRole("heading", { name: "가볍게 맞춰보기" })).toBeVisible({
    timeout: ASSERTION_TIMEOUT,
  });
  await expect(page.getByRole("progressbar", { name: "진행률" })).toBeVisible({
    timeout: ASSERTION_TIMEOUT,
  });
  await expect(page.getByRole("group", { name: "내 답", exact: true })).toBeVisible({
    timeout: ASSERTION_TIMEOUT,
  });
  await expect(page.getByRole("group", { name: "상대 예측", exact: true })).toBeVisible({
    timeout: ASSERTION_TIMEOUT,
  });
}

async function chooseOption(group: Locator, groupName: string, optionIndex: number): Promise<void> {
  // 그룹 안에는 선택지 칩만 남는다. 건너뛰기는 카드 하단 내비게이션으로 옮겼다.
  const optionButtons = group.getByRole("button");
  const optionCount = await optionButtons.count();

  if (optionCount === 0) {
    throw new Error(`No selectable options were rendered in the ${groupName} group.`);
  }

  if (!Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex >= optionCount) {
    throw new Error(
      `Option index ${String(optionIndex)} is out of range for the ${groupName} group; ` +
        `${optionCount} selectable options were rendered.`,
    );
  }

  const indexedOption = optionButtons.nth(optionIndex);
  const optionName = (await indexedOption.innerText()).trim();
  await expect(indexedOption).toHaveAccessibleName(optionName, { timeout: ASSERTION_TIMEOUT });

  const namedOption = group.getByRole("button", { name: optionName, exact: true });
  await expect(namedOption).toHaveCount(1, { timeout: ASSERTION_TIMEOUT });
  await namedOption.click();
  await expect(namedOption).toHaveAttribute("aria-pressed", "true", { timeout: ASSERTION_TIMEOUT });
}

function matchesInputSave(
  response: Response,
  questionCount: number,
  questionIndex: number,
  expectedAnswerIndex: number,
  expectedGuessIndex: number,
  requireComplete: boolean,
): boolean {
  if (!response.ok() || response.request().method() !== "PATCH" || !response.url().endsWith("/me/input")) {
    return false;
  }

  let payload: { answers?: unknown; guesses?: unknown };
  try {
    payload = response.request().postDataJSON() as { answers?: unknown; guesses?: unknown };
  } catch {
    return false;
  }

  if (!Array.isArray(payload.answers) || !Array.isArray(payload.guesses)) {
    return false;
  }

  const answers = payload.answers;
  const guesses = payload.guesses;

  return (
    answers.length === questionCount &&
    guesses.length === questionCount &&
    answers[questionIndex] === expectedAnswerIndex &&
    guesses[questionIndex] === expectedGuessIndex &&
    (!requireComplete || (!answers.includes(null) && !guesses.includes(null)))
  );
}

export async function startLightSession(page: Page): Promise<void> {
  await page.getByRole("button", { name: "가볍게 맞춰보기 시작하기" }).click();
  await waitForLightForm(page);
}

export async function joinInvitation(page: Page, invitationUrl: string): Promise<void> {
  await page.goto(invitationUrl);
  await page.getByRole("button", { name: "참여하고 시작하기" }).click();
  await waitForLightForm(page);
}

export async function answerEveryQuestion(
  page: Page,
  answerOptionIndex = 0,
  guessOptionIndex = 0,
): Promise<void> {
  const progress = page.getByRole("progressbar", { name: "진행률" });
  await expect(progress).toBeVisible({ timeout: ASSERTION_TIMEOUT });
  const questionCountValue = await progress.getAttribute("aria-valuemax");
  const questionCount = Number(questionCountValue);

  if (!Number.isInteger(questionCount) || questionCount < 1) {
    throw new Error("Rendered question progress did not expose a valid question count.");
  }

  const submitButton = page.getByRole("button", { name: "입력 완료하기" });
  for (let questionIndex = 0; questionIndex < questionCount; questionIndex += 1) {
    const expectedStep = questionIndex + 1;
    await expect(progress).toHaveAttribute("aria-valuenow", String(expectedStep), {
      timeout: ASSERTION_TIMEOUT,
    });

    const inputSave = page.waitForResponse(
      (response) =>
        matchesInputSave(
          response,
          questionCount,
          questionIndex,
          answerOptionIndex,
          guessOptionIndex,
          questionIndex === questionCount - 1,
        ),
      { timeout: ASSERTION_TIMEOUT },
    );

    await chooseOption(
      page.getByRole("group", { name: "내 답", exact: true }),
      "내 답",
      answerOptionIndex,
    );
    await chooseOption(
      page.getByRole("group", { name: "상대 예측", exact: true }),
      "상대 예측",
      guessOptionIndex,
    );
    await inputSave;

    if (questionIndex < questionCount - 1) {
      await page.getByRole("button", { name: "다음 질문", exact: true }).click();
      await expect(progress).toHaveAttribute("aria-valuenow", String(expectedStep + 1), {
        timeout: ASSERTION_TIMEOUT,
      });
    }
  }

  await expect(progress).toHaveAttribute("aria-valuenow", String(questionCount), {
    timeout: ASSERTION_TIMEOUT,
  });
  await expect(submitButton).toBeVisible({ timeout: ASSERTION_TIMEOUT });
}

export async function submitLightForm(page: Page): Promise<void> {
  const [submitResponse] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.request().method() === "POST" && response.url().endsWith("/me/submit"),
      { timeout: ASSERTION_TIMEOUT },
    ),
    page.getByRole("button", { name: "입력 완료하기" }).click(),
  ]);
  expect(submitResponse.ok()).toBe(true);
  await expect(page.getByRole("heading", { name: "제출 완료" })).toBeVisible({
    timeout: ASSERTION_TIMEOUT,
  });
}

export async function openReadyPair(browser: Browser): Promise<{
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
