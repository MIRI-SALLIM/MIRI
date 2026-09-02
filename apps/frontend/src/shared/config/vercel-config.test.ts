import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const vercelConfigPath = resolve(process.cwd(), "vercel.json");
const productionBackendOrigin = "https://mirisalim-backend-production.up.railway.app";
const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' https://cdn.jsdelivr.net",
  "font-src 'self' https://cdn.jsdelivr.net",
  "connect-src 'self'",
  "img-src 'self' data: blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
].join("; ");

describe("Vercel deployment configuration", () => {
  it("rewrites API requests before the SPA fallback", async () => {
    const config = JSON.parse(await readFile(vercelConfigPath, "utf8")) as {
      rewrites: Array<{ source: string; destination: string }>;
    };

    expect(config.rewrites).toEqual([
      {
        source: "/api/(.*)",
        destination: `${productionBackendOrigin}/api/$1`,
      },
      {
        source: "/(.*)",
        destination: "/index.html",
      },
    ]);
  });

  it("applies the required security headers to every route", async () => {
    const config = JSON.parse(await readFile(vercelConfigPath, "utf8")) as {
      headers: Array<{
        source: string;
        headers: Array<{ key: string; value: string }>;
      }>;
    };
    const allRouteHeaders = config.headers.find(({ source }) => source === "/(.*)");

    expect(allRouteHeaders).toBeDefined();
    expect(allRouteHeaders?.headers).toEqual(
      expect.arrayContaining([
        { key: "Content-Security-Policy", value: contentSecurityPolicy },
        { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "no-referrer" },
      ]),
    );
  });
});
