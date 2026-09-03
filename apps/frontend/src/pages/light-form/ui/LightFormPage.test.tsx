import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LightFormPage } from "./LightFormPage";
import { useLightFormStore } from "@/features/save-light-answer";

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

const activeSession = {
  createdAt: "2026-08-17T00:00:00Z",
  id: "session-a",
  invitationCode: "INV-A",
  mode: "light",
  myRole: "creator",
  status: "in_progress",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status,
  });
}

function requestFromCall(call: unknown[]): Request {
  const [input, init] = call as [RequestInfo | URL, RequestInit | undefined];
  return input instanceof Request ? input.clone() : new Request(input, init);
}

function storageKeys(storage: Storage) {
  return Array.from({ length: storage.length }, (_, index) => storage.key(index));
}

function WaitingRoute() {
  const navigate = useNavigate();

  return (
    <>
      <h1>상대방을 기다리는 중</h1>
      <button onClick={() => navigate("/light/3")} type="button">
        입력 다시 보기
      </button>
    </>
  );
}

function renderLightForm(path = "/light/1") {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });

  return {
    user: userEvent.setup(),
    ...render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route element={<LightFormPage />} path="/light/:step" />
            <Route element={<WaitingRoute />} path="/waiting/:sessionId" />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    ),
  };
}

function mockSuccessfulApi() {
  fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input.clone() : new Request(input, init);
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/api/v1/light/questions") {
      return jsonResponse(questionSet);
    }

    if (request.method === "GET" && url.pathname === "/api/v1/sessions/session-a/me/input") {
      return jsonResponse({ answers: [null, null, null], guesses: [null, null, null] });
    }

    if (request.method === "GET" && url.pathname === "/api/v1/me/session") {
      return jsonResponse(activeSession);
    }

    if (request.method === "PATCH" && url.pathname === "/api/v1/sessions/session-a/me/input") {
      return jsonResponse(await request.json());
    }

    if (request.method === "POST" && url.pathname === "/api/v1/sessions/session-a/me/submit") {
      return jsonResponse({ completedAt: "2026-08-17T00:03:00Z", status: "submitted" });
    }

    throw new Error(`Unexpected request: ${request.method} ${url.pathname}`);
  });
}

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
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
  mockSuccessfulApi();
});

describe("LightFormPage", () => {
  it("derives progress, navigation, and save payload length from a three-question set", async () => {
    sessionStorage.setItem("activeSessionId", "session-a");
    const { user } = renderLightForm();

    expect(await screen.findByText("1 / 3")).toBeInTheDocument();
    expect(screen.queryByText(/\/5/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "다음 질문" }));
    expect(await screen.findByText("2 / 3")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "다음 질문" }));
    expect(await screen.findByText("3 / 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "입력 완료하기" })).toHaveClass("!bg-green-strong");
    expect(screen.queryByRole("button", { name: "다음 질문" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "이전" }));
    const selfAnswers = screen.getByRole("group", { name: "내 답" });
    await user.click(within(selfAnswers).getByRole("button", { name: "세 번째 선택" }));

    await waitFor(async () => {
      const patchCalls = fetchMock.mock.calls.filter((call) => {
        const request = requestFromCall(call);
        return request.method === "PATCH";
      });

      expect(patchCalls).not.toHaveLength(0);
      const patchRequest = requestFromCall(patchCalls.at(-1)!);
      expect(patchRequest.headers.get("Idempotency-Key")).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
      await expect(patchRequest.json()).resolves.toEqual({
        answers: [null, 0, null],
        guesses: [null, null, null],
      });
    });
  });

  it("uses green and purple pressed chips, supports keyboard selection, and can skip to null", async () => {
    sessionStorage.setItem("activeSessionId", "session-a");
    const { user } = renderLightForm();
    await screen.findByRole("heading", { name: "첫 번째 질문이에요." });

    expect(screen.getByText("가치관")).toHaveClass("text-green-strong");

    const selfAnswers = screen.getByRole("group", { name: "내 답" });
    const guesses = screen.getByRole("group", { name: "상대 예측" });
    const selfChoice = within(selfAnswers).getByRole("button", { name: "첫 번째 선택" });
    const guessChoice = within(guesses).getByRole("button", { name: "두 번째 선택" });

    selfChoice.focus();
    await user.keyboard("{Enter}");
    await user.click(guessChoice);

    expect(selfChoice).toHaveAttribute("aria-pressed", "true");
    expect(guessChoice).toHaveAttribute("aria-pressed", "true");
    expect(await screen.findByText("저장됨")).toBeInTheDocument();

    // 선택 해제는 고른 칩을 다시 눌러서 한다.
    await user.click(selfChoice);
    expect(selfChoice).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "이전" })).toBeInTheDocument();
  });

  it("autosaves the selected answer and partner guess together", async () => {
    sessionStorage.setItem("activeSessionId", "session-a");
    const { user } = renderLightForm();
    await screen.findByRole("heading", { name: "첫 번째 질문이에요." });

    await user.click(
      within(screen.getByRole("group", { name: "내 답" })).getByRole("button", {
        name: "첫 번째 선택",
      }),
    );
    await user.click(
      within(screen.getByRole("group", { name: "상대 예측" })).getByRole("button", {
        name: "두 번째 선택",
      }),
    );

    await waitFor(async () => {
      const patchCalls = fetchMock.mock.calls.filter((call) => {
        const request = requestFromCall(call);
        return request.method === "PATCH";
      });

      expect(patchCalls).not.toHaveLength(0);
      await expect(requestFromCall(patchCalls.at(-1)!).json()).resolves.toEqual({
        answers: [0, null, null],
        guesses: [1, null, null],
      });
    });
  });

  it("preserves earlier answers and guesses while navigating between questions", async () => {
    sessionStorage.setItem("activeSessionId", "session-a");
    const { user } = renderLightForm();
    await screen.findByRole("heading", { name: "첫 번째 질문이에요." });

    await user.click(
      within(screen.getByRole("group", { name: "내 답" })).getByRole("button", {
        name: "첫 번째 선택",
      }),
    );
    await user.click(
      within(screen.getByRole("group", { name: "상대 예측" })).getByRole("button", {
        name: "두 번째 선택",
      }),
    );
    await waitFor(() => {
      expect(fetchMock.mock.calls.some((call) => requestFromCall(call).method === "PATCH")).toBe(true);
    });

    await user.click(screen.getByRole("button", { name: "다음 질문" }));
    await user.click(
      within(screen.getByRole("group", { name: "내 답" })).getByRole("button", {
        name: "세 번째 선택",
      }),
    );
    await user.click(
      within(screen.getByRole("group", { name: "상대 예측" })).getByRole("button", {
        name: "네 번째 선택",
      }),
    );

    await waitFor(async () => {
      const patchCalls = fetchMock.mock.calls.filter((call) => requestFromCall(call).method === "PATCH");
      expect(patchCalls.length).toBeGreaterThan(1);
      await expect(requestFromCall(patchCalls.at(-1)!).json()).resolves.toEqual({
        answers: [0, 0, null],
        guesses: [1, 1, null],
      });
    });
  });

  it("hydrates from the active session API without storing answers or guesses", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = input instanceof Request ? input.clone() : new Request(input, init);
      const url = new URL(request.url);

      if (request.method === "GET" && url.pathname === "/api/v1/me/session") {
        return jsonResponse(activeSession);
      }

      if (request.method === "GET" && url.pathname === "/api/v1/light/questions") {
        return jsonResponse(questionSet);
      }

      if (request.method === "GET" && url.pathname === "/api/v1/sessions/session-a/me/input") {
        return jsonResponse({ answers: [1, 0, null], guesses: [0, 1, null] });
      }

      throw new Error(`Unexpected request: ${request.method} ${url.pathname}`);
    });

    renderLightForm("/light/2");

    expect(await screen.findByText("2 / 3")).toBeInTheDocument();
    expect(
      within(screen.getByRole("group", { name: "내 답" })).getByRole("button", {
        name: "세 번째 선택",
      }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(storageKeys(sessionStorage)).toEqual(["activeSessionId"]);
    expect(storageKeys(localStorage)).toEqual([]);
  });

  it("keeps the selected value and reports a failed autosave", async () => {
    sessionStorage.setItem("activeSessionId", "session-a");
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = input instanceof Request ? input.clone() : new Request(input, init);
      const url = new URL(request.url);

      if (request.method === "GET" && url.pathname === "/api/v1/light/questions") {
        return jsonResponse(questionSet);
      }

      if (request.method === "GET" && url.pathname === "/api/v1/sessions/session-a/me/input") {
        return jsonResponse({ answers: [null, null, null], guesses: [null, null, null] });
      }

      if (request.method === "PATCH") {
        return jsonResponse({ error: { code: "INTERNAL_SERVER_ERROR" } }, 503);
      }

      throw new Error(`Unexpected request: ${request.method} ${url.pathname}`);
    });

    const { user } = renderLightForm();
    await screen.findByRole("heading", { name: "첫 번째 질문이에요." });
    const choice = within(screen.getByRole("group", { name: "내 답" })).getByRole("button", {
      name: "첫 번째 선택",
    });

    await user.click(choice);

    expect(await screen.findByText("저장되지 않음 · 다시 시도")).toBeInTheDocument();
    expect(choice).toHaveAttribute("aria-pressed", "true");
    expect(storageKeys(localStorage)).toEqual([]);
  });

  it("hydrates the server value and locks the form after a submitted-state conflict", async () => {
    sessionStorage.setItem("activeSessionId", "session-a");
    let inputRequestCount = 0;
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = input instanceof Request ? input.clone() : new Request(input, init);
      const url = new URL(request.url);

      if (request.method === "GET" && url.pathname === "/api/v1/light/questions") {
        return jsonResponse(questionSet);
      }

      if (request.method === "GET" && url.pathname === "/api/v1/sessions/session-a/me/input") {
        inputRequestCount += 1;
        return jsonResponse(
          inputRequestCount === 1
            ? { answers: [null, null, null], guesses: [null, null, null] }
            : { answers: [1, null, null], guesses: [null, null, null] },
        );
      }

      if (request.method === "PATCH") {
        return jsonResponse({ error: { code: "SUBMISSION_ALREADY_COMPLETED" } }, 409);
      }

      throw new Error(`Unexpected request: ${request.method} ${url.pathname}`);
    });

    const { user } = renderLightForm();
    await screen.findByRole("heading", { name: "첫 번째 질문이에요." });
    const serverChoice = within(screen.getByRole("group", { name: "내 답" })).getByRole("button", {
      name: "두 번째 선택",
    });

    await user.click(
      within(screen.getByRole("group", { name: "내 답" })).getByRole("button", {
        name: "첫 번째 선택",
      }),
    );

    expect(await screen.findByText("저장됨")).toBeInTheDocument();
    expect(serverChoice).toHaveAttribute("aria-pressed", "true");
    expect(serverChoice).toBeDisabled();
  });

  it("routes to WaitingPage only after the submit response succeeds", async () => {
    sessionStorage.setItem("activeSessionId", "session-a");
    let resolveSubmit!: (response: Response) => void;
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = input instanceof Request ? input.clone() : new Request(input, init);
      const url = new URL(request.url);

      if (request.method === "GET" && url.pathname === "/api/v1/light/questions") {
        return jsonResponse(questionSet);
      }

      if (request.method === "GET" && url.pathname === "/api/v1/sessions/session-a/me/input") {
        return jsonResponse({ answers: [null, null, null], guesses: [null, null, null] });
      }

      if (request.method === "POST" && url.pathname === "/api/v1/sessions/session-a/me/submit") {
        return new Promise<Response>((resolve) => {
          resolveSubmit = resolve;
        });
      }

      if (request.method === "PATCH") {
        return jsonResponse(await request.json());
      }

      throw new Error(`Unexpected request: ${request.method} ${url.pathname}`);
    });

    const { user } = renderLightForm("/light/3");
    expect(await screen.findByText("3 / 3")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "입력 완료하기" }));
    await waitFor(() => {
      const submitCalls = fetchMock.mock.calls.filter((call) => {
        const request = requestFromCall(call);
        return request.method === "POST" && new URL(request.url).pathname.endsWith("/me/submit");
      });

      expect(submitCalls).not.toHaveLength(0);
    });
    expect(screen.queryByRole("heading", { name: "상대방을 기다리는 중" })).not.toBeInTheDocument();

    resolveSubmit(jsonResponse({ completedAt: "2026-08-17T00:03:00Z", status: "submitted" }));
    expect(await screen.findByRole("heading", { name: "상대방을 기다리는 중" })).toBeInTheDocument();
  });

  it("keeps the form read-only when remounting after submission", async () => {
    sessionStorage.setItem("activeSessionId", "session-a");
    let statusRequestCount = 0;
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = input instanceof Request ? input.clone() : new Request(input, init);
      const url = new URL(request.url);

      if (request.method === "GET" && url.pathname === "/api/v1/light/questions") {
        return jsonResponse(questionSet);
      }

      if (request.method === "GET" && url.pathname === "/api/v1/sessions/session-a/me/input") {
        return jsonResponse({ answers: [null, null, null], guesses: [null, null, null] });
      }

      if (request.method === "GET" && url.pathname === "/api/v1/sessions/session-a/status") {
        statusRequestCount += 1;
        return jsonResponse({
          expiresAt: null,
          meCompleted: statusRequestCount > 1,
          partnerCompleted: false,
          partnerJoined: true,
          partnerNudgedAt: null,
        });
      }

      if (request.method === "POST" && url.pathname === "/api/v1/sessions/session-a/me/submit") {
        return jsonResponse({ completedAt: "2026-08-17T00:03:00Z", status: "submitted" });
      }

      throw new Error(`Unexpected request: ${request.method} ${url.pathname}`);
    });

    const { user } = renderLightForm("/light/3");
    expect(await screen.findByText("3 / 3")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "입력 완료하기" }));
    expect(await screen.findByRole("heading", { name: "상대방을 기다리는 중" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "입력 다시 보기" }));
    expect(await screen.findByText("3 / 3")).toBeInTheDocument();
    await waitFor(() => {
      expect(statusRequestCount).toBe(2);
      expect(
        within(screen.getByRole("group", { name: "내 답" })).getByRole("button", {
          name: "다섯 번째 선택",
        }),
      ).toBeDisabled();
      expect(
        within(screen.getByRole("group", { name: "상대 예측" })).getByRole("button", {
          name: "여섯 번째 선택",
        }),
      ).toBeDisabled();
      expect(screen.getByRole("button", { name: "입력 완료하기" })).toBeDisabled();
    });
  });
});
