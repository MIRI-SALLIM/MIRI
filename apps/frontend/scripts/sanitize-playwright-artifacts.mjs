import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const frontendDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const summaryPath = resolve(frontendDirectory, "ci-artifacts/failure-summary.txt");

await Promise.all([
  rm(resolve(frontendDirectory, "playwright-report"), { force: true, recursive: true }),
  rm(resolve(frontendDirectory, "test-results"), { force: true, recursive: true }),
]);

await mkdir(dirname(summaryPath), { recursive: true });
await writeFile(
  summaryPath,
  [
    "Playwright failure evidence",
    "",
    "The frontend E2E gate failed.",
    "Raw Playwright reports, traces, videos, screenshots, cookies, tokens, answers, guesses, and response payloads are intentionally not retained.",
  ].join("\n"),
  "utf8",
);
