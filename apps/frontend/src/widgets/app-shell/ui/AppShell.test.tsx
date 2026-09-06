import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { AppShell } from "./AppShell";

describe("AppShell", () => {
  it("wraps page content with header, main, and footer landmarks", () => {
    render(
      <MemoryRouter>
        <AppShell>
          <h1>페이지 제목</h1>
        </AppShell>
      </MemoryRouter>,
    );

    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("main")).toContainElement(
      screen.getByRole("heading", { name: "페이지 제목" }),
    );
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
  });
});
