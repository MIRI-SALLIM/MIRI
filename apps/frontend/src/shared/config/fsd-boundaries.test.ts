import path from "node:path";

import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const frontendRoot = path.resolve(import.meta.dirname, "../../..");
const eslint = new ESLint({ cwd: frontendRoot });

async function lintFixture(code: string, relativeFilePath: string) {
  const [result] = await eslint.lintText(code, {
    filePath: path.join(frontendRoot, relativeFilePath),
  });

  return result.messages;
}

describe("FSD boundaries", { timeout: 30_000 }, () => {
  it("rejects an aliased upward dependency from shared to widgets", async () => {
    const messages = await lintFixture(
      'import { AppHeader } from "@/widgets/app-header";\nvoid AppHeader;',
      "src/shared/config/fsd-boundaries.test.ts",
    );

    expect(messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ruleId: "boundaries/dependencies" }),
      ]),
    );
  });

  it("rejects a relative cross-slice import that bypasses the public API", async () => {
    const messages = await lintFixture(
      'import { AppHeader } from "../../app-header/ui/AppHeader";\nvoid AppHeader;',
      "src/widgets/app-shell/ui/AppShell.test.tsx",
    );

    expect(messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ruleId: "boundaries/dependencies" }),
      ]),
    );
  });

  it("allows an aliased downward dependency through a slice public API", async () => {
    const messages = await lintFixture(
      'import { AppHeader } from "@/widgets/app-header";\nvoid AppHeader;',
      "src/app/App.test.tsx",
    );

    expect(messages.filter((message) => message.ruleId?.startsWith("boundaries/"))).toEqual([]);
  });
});
