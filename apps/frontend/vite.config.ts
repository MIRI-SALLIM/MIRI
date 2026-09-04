import path from "node:path";
import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { loadEnv } from "vite";
import { configDefaults, defineConfig } from "vitest/config";

const rootDirectory = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, rootDirectory, "");
  const apiTarget = env.MIRISALLIM_API_PROXY_TARGET || "http://127.0.0.1:8000";

  return {
    plugins: [react(), tailwindcss()],
    server: {
      host: "127.0.0.1",
      proxy: {
        "/api": {
          target: apiTarget,
          changeOrigin: true,
        },
      },
    },
    resolve: {
      alias: {
        "@": path.resolve(rootDirectory, "src"),
      },
    },
    test: {
      environment: "jsdom",
      globals: true,
      setupFiles: ["./src/shared/config/test-setup.ts"],
      css: true,
      exclude: [...configDefaults.exclude, "e2e/**"],
      fileParallelism: false,
      pool: "forks",
      maxWorkers: 1,
      minWorkers: 1,
      restoreMocks: true,
    },
  };
});

