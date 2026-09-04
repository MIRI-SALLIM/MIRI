import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useLightFormStore } from "@/features/save-light-answer";
import { LightFormPage } from "./LightFormPage";

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));

vi.mock("@/shared/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared/api")>();

  return { ...actual, apiClient: actual.createApiClient({ fetch: fetchMock }) };
});

const questionSet = {
  description: "세 문항으로 서로의 돈 감각을 맞춰봐요.",
  questions: [
    {
      category: "가치관",
      id: "question-1",
      options: [
        { label: "첫 번째 선택", value: "first" },
        { label: "두 번째 선택", value: "second" },
      ],
      order: 1,
      subText: null,
      target: "self",
      text: "첫 번째 질문이에요.",
      type: "single_choice",
    },
    {
      category: "저축",
      id: "question-2",
      options: [
        { label: "세 번째 선택", value: "third" },
        { label: "네 번째 선택", value: "fourth" },
      ],
      order: 2,
      subText: "두 번째 질문 보조 문구",
      target: "self",
      text: "두 번째 질문이에요.",
      type: "single_choice",
    },
    {
      category: "대화",
      id: "question-3",
      options: [
        { label: "다섯 번째 선택", value: "fifth" },
        { label: "여섯 번째 선택", value: "sixth" },
      ],
      order: 3,
      subText: null,
      target: "self",
      text: "세 번째 질문이에요.",
      type: "single_choice",
    },
  ],
  title: "세 문항 질문 세트",
  version: "light-v1",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status,
  });
}

function newQueryClient() {
  return new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
}

function renderLightForm(queryClient: QueryClient) {
  return {
    user: userEvent.setup(),
    ...render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/light/1"]}>
          <Routes>
            <Route element={<LightFormPage />} path="/light/:step" />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    ),
  };
}

function mockRefetchScenario({
  isSubmitted = () => false,
  saveError = false,
}: { isSubmitted?: () => boolean; saveError?: boolean } = {}) {
  let inputRequestCount = 0;
  let statusRequestCount = 0;

  fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input.clone() : new Request(input, init);
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/api/v1/light/questions") {
      return jsonResponse(questionSet);
    }

    if (request.method === "GET" && url.pathname === "/api/v1/sessions/session-a/me/input") {
      inputRequestCount += 1;
      return jsonResponse({
        answers: [inputRequestCount === 1 ? null : 1, null, null],
        guesses: [null, null, null],
      });
    }

    if (request.method === "GET" && url.pathname === "/api/v1/sessions/session-a/status") {
      statusRequestCount += 1;
      return jsonResponse({
        expiresAt: null,
        meCompleted: isSubmitted(),
        partnerCompleted: false,
        partnerJoined: false,
        partnerNudgedAt: null,
      });
    }

    if (request.method === "PATCH") {
      if (saveError) {
        return jsonResponse({ error: { code: "INTERNAL_SERVER_ERROR" } }, 503);
      }
      return new Promise<Response>(() => undefined);
    }

    throw new Error(`Unexpected request: ${request.method} ${url.pathname}`);
  });

  return {
    getInputRequestCount: () => inputRequestCount,
    getStatusRequestCount: () => statusRequestCount,
  };
}

function chooseFirstAnswer() {
  return within(screen.getByRole("group", { name: "내 답" })).getByRole("button", {
    name: "첫 번째 선택",
  });
}

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  sessionStorage.setItem("activeSessionId", "session-a");
  useLightFormStore.setState({
    answers: [],
    currentStep: 0,
    guesses: [],
    isHydrated: false,
    isReadOnly: false,
    saveStatus: "idle",
    sessionId: null,
  });
  fetchMock.mockReset();
});

describe("LightFormPage hydration", () => {
  it("preserves unsaved local edits when the input query is manually refetched", async () => {
    const scenario = mockRefetchScenario();
    const queryClient = newQueryClient();
    const { user } = renderLightForm(queryClient);

    await screen.findByRole("heading", { name: "첫 번째 질문이에요." });
    const choice = chooseFirstAnswer();
    await user.click(choice);

    await queryClient.refetchQueries({ queryKey: ["light-input", "session-a"] });

    await waitFor(() => expect(scenario.getInputRequestCount()).toBe(2));
    await waitFor(() => expect(choice).toHaveAttribute("aria-pressed", "true"));
  });

  it("preserves unsaved local edits when the input query is invalidated", async () => {
    const scenario = mockRefetchScenario();
    const queryClient = newQueryClient();
    const { user } = renderLightForm(queryClient);

    await screen.findByRole("heading", { name: "첫 번째 질문이에요." });
    const choice = chooseFirstAnswer();
    await user.click(choice);

    await queryClient.invalidateQueries({
      queryKey: ["light-input", "session-a"],
      refetchType: "active",
    });

    await waitFor(() => expect(scenario.getInputRequestCount()).toBe(2));
    await waitFor(() => expect(choice).toHaveAttribute("aria-pressed", "true"));
  });

  it("preserves unsaved local edits when remounting with the same query client", async () => {
    const scenario = mockRefetchScenario();
    const queryClient = newQueryClient();
    const firstRender = renderLightForm(queryClient);

    await screen.findByRole("heading", { name: "첫 번째 질문이에요." });
    await firstRender.user.click(chooseFirstAnswer());
    firstRender.unmount();

    renderLightForm(queryClient);

    await waitFor(() => expect(scenario.getInputRequestCount()).toBe(2));
    await waitFor(() => expect(chooseFirstAnswer()).toHaveAttribute("aria-pressed", "true"));
  });

  it("hydrates and locks the form when a submitted status arrives during unsaved edits", async () => {
    let submitted = false;
    const scenario = mockRefetchScenario({ isSubmitted: () => submitted, saveError: true });
    const queryClient = newQueryClient();
    const firstRender = renderLightForm(queryClient);

    await screen.findByRole("heading", { name: "첫 번째 질문이에요." });
    await firstRender.user.click(chooseFirstAnswer());
    await screen.findByText("저장되지 않음 · 다시 시도");
    firstRender.unmount();
    submitted = true;

    renderLightForm(queryClient);

    await waitFor(() => expect(scenario.getInputRequestCount()).toBe(2));
    await waitFor(() => expect(scenario.getStatusRequestCount()).toBe(2));
    await waitFor(() => {
      const selfAnswers = screen.getByRole("group", { name: "내 답" });
      expect(within(selfAnswers).getByRole("button", { name: "두 번째 선택" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      expect(within(selfAnswers).getByRole("button", { name: "첫 번째 선택" })).toBeDisabled();
      expect(within(selfAnswers).getByRole("button", { name: "두 번째 선택" })).toBeDisabled();
    });
  });

});
