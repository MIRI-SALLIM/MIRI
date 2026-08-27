import { expect, test } from "@playwright/test";

// Horizontal-overflow coverage lives in responsive.spec.ts, scoped to the
// viewports where the reference-matched landing layout is expected not to
// overflow. Duplicating it here risked drifting out of sync with that decision.
test("landing page renders the hero heading and eyebrow", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "서로의 돈을 이해하면 미래가 더 선명해져요" }),
  ).toBeVisible();
  await expect(page.getByText("결혼은 나중에, 살림은 미리")).toBeVisible();
});
