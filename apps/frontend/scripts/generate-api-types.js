import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const openapiTypescriptRoot = path.dirname(require.resolve("openapi-typescript/package.json"));
const openapiTypescriptCli = path.join(openapiTypescriptRoot, "bin", "cli.js");

execFileSync(process.execPath, [openapiTypescriptCli, "openapi.json", "-o", "src/shared/api/schema.d.ts"], {
  cwd: frontendRoot,
  stdio: "inherit",
});
