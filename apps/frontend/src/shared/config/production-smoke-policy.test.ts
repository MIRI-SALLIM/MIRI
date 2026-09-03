import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const frontendDirectory = resolve(import.meta.dirname, "../../../");
const productionSmokeSource = readFileSync(
  resolve(frontendDirectory, "e2e/production-smoke.spec.ts"),
  "utf8",
);
const playwrightConfigSource = readFileSync(
  resolve(frontendDirectory, "playwright.config.ts"),
  "utf8",
);
const deploymentDocument = readFileSync(
  resolve(frontendDirectory, "..", "..", "docs/operations/frontend-deployment.md"),
  "utf8",
);
const legacyProductionSmokeFlag = ["RUN", "PRODUCTION", "SMOKE"].join("_");

describe("production smoke release policy", () => {
  it("opts in from PLAYWRIGHT_BASE_URL alone and documents the planned command", () => {
    expect(productionSmokeSource).toContain(
      "const productionSmokeEnabled = Boolean(process.env.PLAYWRIGHT_BASE_URL);",
    );
    expect(productionSmokeSource).not.toContain(legacyProductionSmokeFlag);
    expect(deploymentDocument).toContain(
      'npx.cmd playwright test e2e/production-smoke.spec.ts',
    );
    expect(deploymentDocument).not.toContain(legacyProductionSmokeFlag);
  });

  it("keeps waiting payloads and production artifacts out of assertions", () => {
    expect(productionSmokeSource).toContain("function isWaitingGateResponseBody");
    expect(productionSmokeSource).toContain(
      "expect(isWaitingGateResponseBody(waitingResultBody)).toBe(true);",
    );
    expect(productionSmokeSource).not.toMatch(/expect\(\s*waitingResultBody\s*\)/);
    expect(productionSmokeSource).not.toContain("JSON.stringify");
    expect(productionSmokeSource).toContain(
      'test.use({ screenshot: "off", trace: "off", video: "off" });',
    );
    expect(deploymentDocument).toMatch(
      /production smoke disables trace,\s+screenshot, and video retention/i,
    );
  });

  it("applies one three-second deadline until both reveal links are visible", () => {
    expect(productionSmokeSource).toContain("const REVEAL_DEADLINE_MS = 3_000;");
    expect(productionSmokeSource).toContain("const bSubmitResponse = pageB.waitForResponse(");
    expect(productionSmokeSource).toContain("const bSubmitForm = submitLightForm(pageB);");
    expect(productionSmokeSource).toContain("const bSubmitResponseReceived = await bSubmitResponse;");
    expect(productionSmokeSource).toContain("const revealDeadline = Date.now() + REVEAL_DEADLINE_MS;");
    expect(productionSmokeSource).toContain("await bSubmitForm;");
    const responseAwaitIndex = productionSmokeSource.indexOf(
      "const bSubmitResponseReceived = await bSubmitResponse;",
    );
    const deadlineIndex = productionSmokeSource.indexOf(
      "const revealDeadline = Date.now() + REVEAL_DEADLINE_MS;",
    );
    const helperAwaitIndex = productionSmokeSource.indexOf("await bSubmitForm;");
    expect(responseAwaitIndex).toBeGreaterThanOrEqual(0);
    expect(deadlineIndex).toBeGreaterThan(responseAwaitIndex);
    expect(deadlineIndex).toBeLessThan(helperAwaitIndex);
    expect(productionSmokeSource).toContain("Promise.all([");
    expect(productionSmokeSource).not.toContain("timeout: 15_000");
    expect(productionSmokeSource).toContain("expect(Date.now()).toBeLessThanOrEqual(revealDeadline);");
    const resultLinkAwaitIndex = productionSmokeSource.indexOf(
      'expect(resultLinkA).toBeVisible({ timeout: ASSERTION_TIMEOUT }),',
    );
    const secondResultLinkAwaitIndex = productionSmokeSource.indexOf(
      'expect(resultLinkB).toBeVisible({ timeout: ASSERTION_TIMEOUT }),',
    );
    const clockAssertionIndex = productionSmokeSource.indexOf(
      "expect(Date.now()).toBeLessThanOrEqual(revealDeadline);",
    );
    const resultHeadingAwaitIndex = productionSmokeSource.indexOf(
      'expect(pageA.getByRole("heading", { name: "라이트 결과" })).toBeVisible({',
    );
    expect(resultLinkAwaitIndex).toBeGreaterThanOrEqual(0);
    expect(secondResultLinkAwaitIndex).toBeGreaterThan(resultLinkAwaitIndex);
    expect(clockAssertionIndex).toBeGreaterThan(resultLinkAwaitIndex);
    expect(clockAssertionIndex).toBeGreaterThan(secondResultLinkAwaitIndex);
    expect(resultHeadingAwaitIndex).toBeGreaterThan(clockAssertionIndex);
    expect(
      productionSmokeSource.match(
        /expect\(Date\.now\(\)\)\.toBeLessThanOrEqual\(revealDeadline\);/g,
      ) ?? [],
    ).toHaveLength(1);
    expect(productionSmokeSource).not.toContain("timeoutUntilRevealDeadline");
    expect(productionSmokeSource).toMatch(
      /getByRole\("heading", \{ name: "라이트 결과" \}\)\)\.toBeVisible\(\{\s+timeout: ASSERTION_TIMEOUT,/,
    );
    expect(
      productionSmokeSource.match(
        /getByRole\("heading", \{ name: "라이트 결과" \}\)\)\.toBeVisible\(\{\s+timeout: ASSERTION_TIMEOUT,/g,
      ) ?? [],
    ).toHaveLength(2);
    expect(productionSmokeSource).toMatch(
      /pageB\.getByRole\("heading", \{ name: "상대방을 기다리는 중" \}\)\)\.toBeVisible\(\{\s+timeout: ASSERTION_TIMEOUT,/,
    );
  });

  it("reduces share-card privacy checks to a redacted boolean", () => {
    expect(productionSmokeSource).toContain(
      "async function hasSensitiveShareCardText(card: Locator): Promise<boolean>",
    );
    expect(productionSmokeSource).toContain(
      "const shareCardContainsSensitiveText = await hasSensitiveShareCardText(shareCard);",
    );
    expect(productionSmokeSource).toContain("expect(shareCardContainsSensitiveText).toBe(false);");
    expect(productionSmokeSource).not.toContain("const shareCardText =");
    expect(productionSmokeSource).not.toContain("shareCard.innerText()");
    expect(productionSmokeSource).toContain("function isShareCardVisible(page: Page): Promise<boolean>");
    expect(productionSmokeSource).toContain("const shareCardIsVisible = await isShareCardVisible(pageA);");
    expect(productionSmokeSource).toContain("expect(shareCardIsVisible).toBe(true);");
    expect(productionSmokeSource).toContain("function hasShareCardRatio(page: Page): Promise<boolean>");
    expect(productionSmokeSource).toContain("const shareCardHasSquareRatio = await hasShareCardRatio(pageA);");
    expect(productionSmokeSource).toContain("expect(shareCardHasSquareRatio).toBe(true);");
    expect(productionSmokeSource).not.toContain("expect(shareCard).toBeVisible");
    expect(productionSmokeSource).not.toContain("expect(shareCard).toHaveAttribute");
  });

  it("does not start managed local servers for a no-URL production smoke listing", () => {
    expect(playwrightConfigSource).toContain(
      'const isProductionSmokeRun = process.argv.some((argument) => argument.endsWith("production-smoke.spec.ts"));',
    );
    expect(playwrightConfigSource).toContain(
      "const shouldUseManagedWebServers = !externalBaseURL && !isProductionSmokeRun;",
    );
    expect(playwrightConfigSource).toMatch(/webServer:\s+shouldUseManagedWebServers\s+\? \[/);
  });
});
