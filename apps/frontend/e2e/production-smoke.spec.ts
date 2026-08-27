import { expect, test } from "@playwright/test";

import { openReadyPair } from "./support/light-flow";

const productionSmokeEnabled = process.env.RUN_PRODUCTION_SMOKE === "1";

test.describe("production smoke", () => {
  test.skip(
    !productionSmokeEnabled,
    "Set RUN_PRODUCTION_SMOKE=1 and PLAYWRIGHT_BASE_URL to run the production smoke test.",
  );

  test("serves the light flow with the expected security headers", async ({ browser }) => {
    test.setTimeout(90_000);

    const configuredBaseUrl = process.env.PLAYWRIGHT_BASE_URL;
    expect(configuredBaseUrl, "PLAYWRIGHT_BASE_URL must be set for production smoke").toBeTruthy();
    const baseUrl = new URL(configuredBaseUrl as string);
    expect(baseUrl.protocol).toBe("https:");

    const landingContext = await browser.newContext();
    const landingPage = await landingContext.newPage();
    try {
      const landingResponse = await landingPage.goto("/");
      expect(landingResponse?.ok()).toBe(true);
      await expect(landingPage.getByRole("heading", { name: "미리살림" })).toBeVisible();

      const headers = landingResponse?.headers() ?? {};
      for (const headerName of [
        "content-security-policy",
        "strict-transport-security",
        "x-content-type-options",
        "referrer-policy",
      ]) {
        expect(headers[headerName], `Missing ${headerName} response header`).toBeTruthy();
      }
    } finally {
      await landingContext.close();
    }

    const { contextA, contextB, pageA } = await openReadyPair(browser);
    try {
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
});

