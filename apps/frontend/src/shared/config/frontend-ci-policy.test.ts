import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
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
  });

  it("sanitizes frontend artifacts when invoked from the repository root", () => {
    const frontendArtifacts = ["playwright-report", "test-results"];
    const artifactPaths = frontendArtifacts.map((directory) => resolve(frontendDirectory, directory));
    const summaryPath = resolve(frontendDirectory, "ci-artifacts/failure-summary.txt");
    const scriptPath = resolve(frontendDirectory, "scripts/sanitize-playwright-artifacts.mjs");

    try {
      for (const artifactPath of artifactPaths) {
        mkdirSync(artifactPath, { recursive: true });
        writeFileSync(resolve(artifactPath, "sensitive-fixture.txt"), "participant-token=fixture");
      }

      const result = spawnSync(process.execPath, [scriptPath], {
        cwd: repositoryDirectory,
        encoding: "utf8",
      });

      expect(result.status, result.stderr).toBe(0);
      expect(artifactPaths.every((artifactPath) => !existsSync(artifactPath))).toBe(true);
      expect(existsSync(summaryPath)).toBe(true);
      expect(readFileSync(summaryPath, "utf8")).toContain("Raw Playwright reports");
    } finally {
      for (const artifactPath of artifactPaths) {
        rmSync(artifactPath, { force: true, recursive: true });
      }
      rmSync(resolve(frontendDirectory, "ci-artifacts"), { force: true, recursive: true });
      rmSync(resolve(repositoryDirectory, "ci-artifacts"), { force: true, recursive: true });
    }
  });

  it("prevents Playwright attachments in CI and carries Task 6 config behavior", () => {
    expect(playwrightConfigSource).toContain('screenshot: process.env.CI ? "off" : "only-on-failure"');
    expect(playwrightConfigSource).toContain('trace: process.env.CI ? "off" : "retain-on-failure"');
    expect(playwrightConfigSource).toContain('video: process.env.CI ? "off" : "retain-on-failure"');
    expect(playwrightConfigSource).toContain("shouldUseManagedWebServers");
  });

  it("runs the default Vitest command with one worker and no file parallelism", () => {
    expect(viteConfigSource).toContain("fileParallelism: false");
    expect(viteConfigSource).toContain('pool: "forks"');
    expect(viteConfigSource).toContain("maxWorkers: 1");
    expect(viteConfigSource).toContain("minWorkers: 1");
  });
});
