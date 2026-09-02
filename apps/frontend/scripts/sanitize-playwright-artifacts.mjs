import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const summaryPath = resolve("ci-artifacts/failure-summary.txt");

await Promise.all([
  rm(resolve("playwright-report"), { force: true, recursive: true }),
  rm(resolve("test-results"), { force: true, recursive: true }),
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
