import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "@playwright/test";

const frontendDirectory = path.dirname(fileURLToPath(import.meta.url));
const externalBaseURL = process.env.PLAYWRIGHT_BASE_URL;
const useMongo = process.env.MIRISALLIM_E2E_USE_MONGO === "1";
const localBackendEnvironment = {
  ...process.env,
  ENVIRONMENT: useMongo ? "development" : "test",
  MONGODB_DATABASE: process.env.MONGODB_DATABASE ?? "mirisallim_e2e",
  MONGODB_URI: process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017",
  PARTICIPANT_TOKEN_PEPPER: process.env.PARTICIPANT_TOKEN_PEPPER ?? "devpepper",
};

export default defineConfig({
  projects: [
    {
      name: "desktop-chromium",
      use: { viewport: { height: 900, width: 1280 } },
    },
    {
      name: "mobile-chromium",
      use: { viewport: { height: 844, width: 390 } },
    },
  ],
  retries: process.env.CI ? 2 : 0,
  testDir: "e2e",
  use: {
    baseURL: externalBaseURL ?? "http://127.0.0.1:4173",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  webServer: externalBaseURL
    ? undefined
    : [
        {
          command: "python -m uvicorn main:app --host 127.0.0.1 --port 8000",
          cwd: path.resolve(frontendDirectory, "../backend"),
          env: localBackendEnvironment,
          name: "backend",
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
          url: "http://127.0.0.1:8000/health",
        },
        {
          command: "npm run dev -- --host 127.0.0.1 --port 4173",
          cwd: frontendDirectory,
          env: {
            ...process.env,
            MIRISALLIM_API_PROXY_TARGET: "http://127.0.0.1:8000",
          },
          name: "vite",
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
          url: "http://127.0.0.1:4173/",
        },
      ],
});
