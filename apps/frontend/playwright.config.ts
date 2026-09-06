import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "@playwright/test";

const frontendDirectory = path.dirname(fileURLToPath(import.meta.url));
const externalBaseURL = process.env.PLAYWRIGHT_BASE_URL;
const isProductionSmokeRun = process.argv.some((argument) => argument.endsWith("production-smoke.spec.ts"));
const shouldUseManagedWebServers = !externalBaseURL && !isProductionSmokeRun;
const useMongo = process.env.MIRISALLIM_E2E_USE_MONGO === "1";
const localBackendEnvironment = {
  ...process.env,
  ENVIRONMENT: useMongo ? "development" : "test",
  DEEP_MODE_ENABLED: "true",
  KAKAO_LOGIN_ENABLED: "false",
  REVIEWER_LOGIN_ENABLED: "true",
  PUBLIC_APP_ORIGIN: "http://127.0.0.1:4173",
  AUTH_SESSION_PEPPER: "local-e2e-auth-session-pepper-32-chars",
  REVIEWER_A_PASSWORD_HASH:
    "pbkdf2_sha256$600000$0102030405060708090a0b0c0d0e0f10$43b00c561fa871495c366aa7e8f0fe5a6f7ea907ddc63cd62f9d635eecd90d1c",
  REVIEWER_B_PASSWORD_HASH:
    "pbkdf2_sha256$600000$0102030405060708090a0b0c0d0e0f10$96eed2bbafc9d179d2247123ff909a10cdc9b6148ab98f807b1214ac87ed53ec",
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
    screenshot: process.env.CI ? "off" : "only-on-failure",
    trace: process.env.CI ? "off" : "retain-on-failure",
    video: process.env.CI ? "off" : "retain-on-failure",
  },
  webServer: shouldUseManagedWebServers
    ? [
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
      ]
    : undefined,
});
