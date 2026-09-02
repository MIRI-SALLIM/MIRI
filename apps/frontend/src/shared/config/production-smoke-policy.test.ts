import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const frontendDirectory = resolve(import.meta.dirname, "../../../");
const productionSmokeSource = readFileSync(
  resolve(frontendDirectory, "e2e/production-smoke.spec.ts"),
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

  it("checks both participants against one three-second reveal deadline", () => {
    expect(productionSmokeSource).toContain("const REVEAL_DEADLINE_MS = 3_000;");
    expect(productionSmokeSource).toContain("const revealDeadline = Date.now() + REVEAL_DEADLINE_MS;");
    expect(productionSmokeSource).toContain("Promise.all([");
    expect(productionSmokeSource).not.toContain("timeout: 15_000");
    expect(productionSmokeSource).toContain("expect(Date.now()).toBeLessThanOrEqual(revealDeadline);");
  });
});
