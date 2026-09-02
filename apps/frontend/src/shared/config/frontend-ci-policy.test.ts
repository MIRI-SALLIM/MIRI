import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const frontendDirectory = resolve(import.meta.dirname, "../../../");
const repositoryDirectory = resolve(frontendDirectory, "..", "..");
const workflowSource = readFileSync(
  resolve(repositoryDirectory, ".github/workflows/frontend.yml"),
  "utf8",
);
const playwrightConfigSource = readFileSync(resolve(frontendDirectory, "playwright.config.ts"), "utf8");
const viteConfigSource = readFileSync(resolve(frontendDirectory, "vite.config.ts"), "utf8");

describe("frontend CI release policy", () => {
  it("uploads only a sanitized failure summary with seven-day retention", () => {
    expect(workflowSource).toContain("if: failure()");
    expect(workflowSource).toContain("retention-days: 7");
    expect(workflowSource).toContain("path: apps/frontend/ci-artifacts/failure-summary.txt");
    expect(workflowSource).not.toContain("path: apps/frontend/playwright-report");
    expect(workflowSource).not.toContain("path: apps/frontend/test-results");
    expect(workflowSource).toContain("sanitize-playwright-artifacts.mjs");
    expect(readFileSync(resolve(frontendDirectory, "scripts/sanitize-playwright-artifacts.mjs"), "utf8")).toContain(
      'rm(resolve("test-results"), { force: true, recursive: true })',
    );
  });

  it("prevents Playwright attachments in CI and carries Task 6 config behavior", () => {
    expect(playwrightConfigSource).toContain('screenshot: process.env.CI ? "off" : "only-on-failure"');
    expect(playwrightConfigSource).toContain('trace: process.env.CI ? "off" : "retain-on-failure"');
    expect(playwrightConfigSource).toContain('video: process.env.CI ? "off" : "retain-on-failure"');
    expect(playwrightConfigSource).toContain("shouldUseManagedWebServers");
  });

  it("runs the default Vitest command with one worker and no file parallelism", () => {
    expect(viteConfigSource).toContain("fileParallelism: false");
    expect(viteConfigSource).toContain("maxWorkers: 1");
    expect(viteConfigSource).toContain("minWorkers: 1");
  });
});
