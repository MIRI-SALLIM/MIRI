import AxeBuilder from "@axe-core/playwright";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import {
  answerEveryQuestion,
  joinInvitation,
  startLightSession,
  submitLightForm,
} from "./support/light-flow";

const productionSmokeEnabled = Boolean(process.env.PLAYWRIGHT_BASE_URL);
const ASSERTION_TIMEOUT = 10_000;
const REVEAL_DEADLINE_MS = 3_000;

test.use({ screenshot: "off", trace: "off", video: "off" });

const SENSITIVE_WAITING_KEY_PATTERN = /answers|guesses|result|type|score|nickname|participant.?token/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isWaitingGateResponseBody(body: unknown): boolean {
  if (!isRecord(body)) {
    return false;
  }

  const keys = Object.keys(body).sort();
  return (
    keys.length === 2 &&
    keys[0] === "partnerCompleted" &&
    keys[1] === "status" &&
    body.partnerCompleted === false &&
    body.status === "waiting"
  );
}

function containsSensitiveWaitingKeys(body: unknown): boolean {
  if (!isRecord(body)) {
    return true;
  }

  return Object.keys(body).some((key) => SENSITIVE_WAITING_KEY_PATTERN.test(key));
}

function expectSecurityHeaders(response: { headers(): Record<string, string> }): void {
  const headers = response.headers();
  expect(headers["content-security-policy"]).toBeTruthy();
  expect(headers["content-security-policy"]).toContain("default-src 'self'");
  expect(headers["strict-transport-security"]).toContain("max-age=31536000");
  expect(headers["x-content-type-options"]?.toLowerCase()).toBe("nosniff");
  expect(headers["referrer-policy"]?.toLowerCase()).toBe("no-referrer");
}

async function expectNoBlockingAxeViolations(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);

  // Keep color-contrast enabled: production smoke is the release gate for all
  // serious/critical violations, including contrast regressions.
  const results = await new AxeBuilder({ page }).analyze();
  const blockingViolations = results.violations.filter(
    ({ impact }) => impact === "serious" || impact === "critical",
  );

  expect(blockingViolations.map(({ id }) => id)).toEqual([]);
}

function trackSameOriginApiRequests(context: BrowserContext, expectedOrigin: string): {
  hasApiRequest: () => boolean;
  allApiRequestsAreSameOrigin: () => boolean;
} {
  let hasApiRequest = false;
  let allApiRequestsAreSameOrigin = true;

  context.on("request", (request) => {
    const requestUrl = new URL(request.url());
    if (!requestUrl.pathname.startsWith("/api/v1/")) {
      return;
    }

    hasApiRequest = true;
    if (requestUrl.origin !== expectedOrigin) {
      allApiRequestsAreSameOrigin = false;
    }
  });

  return {
    hasApiRequest: () => hasApiRequest,
    allApiRequestsAreSameOrigin: () => allApiRequestsAreSameOrigin,
  };
}

function expectPrivacySafeStorage(page: Page): Promise<void> {
  return page.evaluate(() => {
    const values = [
      ...Object.values(localStorage),
      ...Object.values(sessionStorage),
    ];
    const sensitivePattern = /answers|guesses|result|type|score|nickname|participant.?token/i;

    if (values.some((value) => sensitivePattern.test(value))) {
      throw new Error("Waiting page storage contains a sensitive value.");
    }
  });
}

test.describe("production smoke", () => {
  test.skip(
    !productionSmokeEnabled,
    "Set PLAYWRIGHT_BASE_URL to run the production smoke test.",
  );

  test("serves the privacy-safe light flow with the expected security headers", async ({ browser }) => {
    test.setTimeout(120_000);

    const configuredBaseUrl = process.env.PLAYWRIGHT_BASE_URL;
    expect(configuredBaseUrl, "PLAYWRIGHT_BASE_URL must be set for production smoke").toBeTruthy();
    const baseUrl = new URL(configuredBaseUrl as string);
    expect(baseUrl.protocol).toBe("https:");

    const landingContext = await browser.newContext();
    const landingPage = await landingContext.newPage();
    try {
      const landingResponse = await landingPage.goto("/", { waitUntil: "domcontentloaded" });
      expect(landingResponse?.ok()).toBe(true);
      expect(new URL(landingPage.url()).origin).toBe(baseUrl.origin);
      await expect(
        landingPage.getByRole("heading", { name: "서로의 돈을 이해하면 미래가 더 선명해져요" }),
      ).toBeVisible({ timeout: ASSERTION_TIMEOUT });
      await expectNoBlockingAxeViolations(landingPage);
      if (landingResponse === null) {
        throw new Error("The production landing page did not return a document response.");
      }
      expectSecurityHeaders(landingResponse);
    } finally {
      await landingContext.close();
    }

    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();
    const apiRequestsA = trackSameOriginApiRequests(contextA, baseUrl.origin);
    const apiRequestsB = trackSameOriginApiRequests(contextB, baseUrl.origin);

    try {
      await pageA.goto("/");
      await startLightSession(pageA);
      await answerEveryQuestion(pageA, 0, 0);

      const sessionResponse = await pageA.request.get("/api/v1/me/session");
      expect(sessionResponse.ok()).toBe(true);
      const session = (await sessionResponse.json()) as { id: string; invitationCode: string };
      expect(session.id).toBeTruthy();
      expect(session.invitationCode).toBeTruthy();

      const invitationUrl = new URL(`/invite/${session.invitationCode}`, baseUrl).toString();
      await joinInvitation(pageB, invitationUrl);
      const partnerAnswerSentinel = await pageB
        .getByRole("group", { name: "내 답", exact: true })
        .getByRole("button")
        .nth(1)
        .innerText();

      const waitingResultResponse = pageA.waitForResponse(
        (response) =>
          response.ok() &&
          response.request().method() === "GET" &&
          response.url().endsWith(`/api/v1/sessions/${session.id}/result`),
        { timeout: ASSERTION_TIMEOUT },
      );

      await submitLightForm(pageA);
      await pageA.getByRole("link", { name: "상대방을 기다리러 가기" }).click();
      await expect(pageA.getByRole("heading", { name: "상대방을 기다리는 중" })).toBeVisible({
        timeout: ASSERTION_TIMEOUT,
      });
      await expectNoBlockingAxeViolations(pageA);

      await pageA.goto(`/result/light/${session.id}`);
      const waitingResultBody = await (await waitingResultResponse).json();
      expect(isWaitingGateResponseBody(waitingResultBody)).toBe(true);
      expect(containsSensitiveWaitingKeys(waitingResultBody)).toBe(false);

      const partnerAnswerIsVisible = await pageA.evaluate((sentinel) => {
        const visibleText = document.body.innerText;
        return visibleText.includes(sentinel);
      }, partnerAnswerSentinel.trim());
      expect(partnerAnswerIsVisible).toBe(false);
      await expectPrivacySafeStorage(pageA);

      await answerEveryQuestion(pageB, 1, 1);
      await submitLightForm(pageB);
      const revealDeadline = Date.now() + REVEAL_DEADLINE_MS;
      const timeoutUntilRevealDeadline = (): number => Math.max(1, revealDeadline - Date.now());
      await pageB.getByRole("link", { name: "상대방을 기다리러 가기" }).click();
      await expect(pageB.getByRole("heading", { name: "상대방을 기다리는 중" })).toBeVisible({
        timeout: timeoutUntilRevealDeadline(),
      });

      const resultLinkA = pageA.getByRole("link", { name: "결과 보기" });
      const resultLinkB = pageB.getByRole("link", { name: "결과 보기" });
      await Promise.all([
        expect(resultLinkA).toBeVisible({ timeout: timeoutUntilRevealDeadline() }),
        expect(resultLinkB).toBeVisible({ timeout: timeoutUntilRevealDeadline() }),
      ]);
      expect(Date.now()).toBeLessThanOrEqual(revealDeadline);
      await Promise.all([resultLinkA.click(), resultLinkB.click()]);
      await Promise.all([
        expect(pageA.getByRole("heading", { name: "라이트 결과" })).toBeVisible({
          timeout: timeoutUntilRevealDeadline(),
        }),
        expect(pageB.getByRole("heading", { name: "라이트 결과" })).toBeVisible({
          timeout: timeoutUntilRevealDeadline(),
        }),
      ]);
      expect(Date.now()).toBeLessThanOrEqual(revealDeadline);

      const scoreA = await pageA.getByText(/^\d+ \/ \d+$/).first().innerText();
      const scoreB = await pageB.getByText(/^\d+ \/ \d+$/).first().innerText();
      expect(scoreA).toBe(scoreB);
      await expectNoBlockingAxeViolations(pageA);
      await expectNoBlockingAxeViolations(pageB);

      await pageA.getByRole("link", { name: "결과 공유" }).click();
      await expect(pageA.getByRole("heading", { name: "결과 공유" })).toBeVisible({
        timeout: ASSERTION_TIMEOUT,
      });
      const shareCard = pageA.getByTestId("share-card");
      await expect(shareCard).toBeVisible({ timeout: ASSERTION_TIMEOUT });
      const shareCardText = await shareCard.innerText();
      expect(shareCardText).not.toMatch(/(?:소득|부채|저축액|대출|\d[\d,]*\s*(?:만원|만 원|원))/i);

      const squareRatio = pageA.getByRole("button", { name: "정사각형 1:1" });
      await squareRatio.click();
      await expect(squareRatio).toHaveAttribute("aria-pressed", "true");
      await expect(shareCard).toHaveAttribute("data-ratio", "square");
      await expectNoBlockingAxeViolations(pageA);

      const download = pageA.waitForEvent("download", { timeout: ASSERTION_TIMEOUT });
      await pageA.getByRole("button", { name: "이미지 저장" }).click();
      const downloadedFile = await download;
      expect(downloadedFile.suggestedFilename()).toMatch(/\.png$/i);
    } finally {
      await contextA.close();
      await contextB.close();
    }

    expect(apiRequestsA.hasApiRequest()).toBe(true);
    expect(apiRequestsB.hasApiRequest()).toBe(true);
    expect(apiRequestsA.allApiRequestsAreSameOrigin()).toBe(true);
    expect(apiRequestsB.allApiRequestsAreSameOrigin()).toBe(true);
  });
});
