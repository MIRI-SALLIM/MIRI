import { expect, type Locator, type Page } from "@playwright/test";

async function chooseFirstOption(group: Locator): Promise<void> {
  await group.getByRole("button").first().click();
}

export async function startLightSession(page: Page): Promise<void> {
  await page.getByRole("button", { name: "가볍게 맞춰보기" }).click();
  await expect(page.getByRole("heading", { name: "라이트 질문" })).toBeVisible();
}

export async function joinInvitation(page: Page, invitationUrl: string): Promise<void> {
  await page.goto(invitationUrl);
  await page.getByRole("button", { name: "참여하고 시작하기" }).click();
  await expect(page.getByRole("heading", { name: "라이트 질문" })).toBeVisible();
}

export async function answerEveryQuestion(page: Page): Promise<void> {
  const progress = page.getByRole("progressbar", { name: "진행률" });
  const questionCountValue = await progress.getAttribute("aria-valuemax");
  const questionCount = Number(questionCountValue);

  if (!Number.isInteger(questionCount) || questionCount < 1) {
    throw new Error("Rendered question progress did not expose a valid question count.");
  }

  const submitButton = page.getByRole("button", { name: "입력 완료하기" });
  let answeredQuestionCount = 0;

  while (!(await submitButton.isVisible())) {
    await chooseFirstOption(page.getByRole("group", { name: "내 답" }));
    await chooseFirstOption(page.getByRole("group", { name: "상대 예측" }));
    answeredQuestionCount += 1;

    if (await submitButton.isVisible()) {
      break;
    }

    if (answeredQuestionCount >= questionCount) {
      throw new Error("Rendered question progress ended before the submit button appeared.");
    }

    await page.getByRole("button", { name: "다음", exact: true }).click();
  }

  await expect(submitButton).toBeVisible();
}

export async function submitLightForm(page: Page): Promise<void> {
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.request().method() === "POST" && response.url().endsWith("/me/submit"),
    ),
    page.getByRole("button", { name: "입력 완료하기" }).click(),
  ]);
  await expect(page.getByRole("heading", { name: "제출 완료" })).toBeVisible();
}
