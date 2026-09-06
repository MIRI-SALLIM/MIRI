import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DeepInputV3 } from "@/entities/deep-input";
import { resetDeepInputStore, useDeepInputStore } from "@/features/save-deep-input";
import { DeepInputPage } from "./DeepInputPage";

const { fetchDeepInputMock, saveDeepInputMock } = vi.hoisted(() => ({
  fetchDeepInputMock: vi.fn(),
  saveDeepInputMock: vi.fn(),
}));

vi.mock("@/entities/deep-input", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/entities/deep-input")>();
  return {
    ...actual,
    fetchDeepInput: fetchDeepInputMock,
    saveDeepInput: saveDeepInputMock,
  };
});

const input = (): DeepInputV3 => ({
  inputVersion: "deep-input-v3",
  assetsStatus: "known",
  debtsStatus: "known",
  livingTogether: false,
  income: { bonusIncludedInMonthlyIncome: false },
});

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/deep/input/session-a"]}>
        <Routes>
          <Route element={<DeepInputPage />} path="/deep/input/:sessionId" />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.useRealTimers();
  resetDeepInputStore();
  fetchDeepInputMock.mockReset();
  saveDeepInputMock.mockReset();
  fetchDeepInputMock.mockResolvedValue({ input: input(), revision: 1 });
  saveDeepInputMock.mockResolvedValue({ input: input(), revision: 2 });
});

describe("DeepInputPage", () => {
  it("hydrates the four input groups and leaves funding screens out", async () => {
    renderPage();

    expect(await screen.findByRole("heading", { name: "생활과 소득" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "생활과 소득" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "월 지출" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "부채" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "자산" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "세후 월 소득 상태" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /재원|정산|배분/ })).not.toBeInTheDocument();
  });

  it("autosaves a living-together answer through the shared store", async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByRole("heading", { name: "생활과 소득" });
    await user.click(screen.getAllByRole("radio", { name: "예" })[0]);
    await useDeepInputStore.getState().flush();

    expect(saveDeepInputMock).toHaveBeenCalledWith(
      "session-a",
      1,
      expect.objectContaining({ livingTogether: true }),
    );
  });

  it("shows the load error instead of staying on the loading screen", async () => {
    fetchDeepInputMock.mockRejectedValueOnce(new Error("network"));
    renderPage();

    expect(await screen.findByRole("heading", { name: "재무 현황을 불러오지 못했어요." })).toBeInTheDocument();
  });
});
