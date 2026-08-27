import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LandingPage } from "./LandingPage";

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));

vi.mock("@/shared/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared/api")>();

  return { ...actual, apiClient: actual.createApiClient({ fetch: fetchMock }) };
});

const createdSession = {
  createdAt: "2026-08-17T00:00:00Z",
  id: "session-a",
  invitationCode: "INV-A",
  mode: "light",
  myRole: "creator",
  status: "in_progress",
};

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function storageKeys(storage: Storage) {
  return Array.from({ length: storage.length }, (_, index) => storage.key(index));
}

function renderLanding() {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });

  return {
    user: userEvent.setup(),
    ...render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/"]}>
          <Routes>
            <Route element={<LandingPage />} path="/" />
            <Route element={<h1>라이트 질문</h1>} path="/light/:step" />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    ),
  };
}

async function startSession(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "가볍게 맞춰보기 시작하기" }));
}

function modeCard(title: string) {
  const card = screen.getByRole("heading", { level: 2, name: title }).closest("article");
  expect(card).not.toBeNull();

  return card as HTMLElement;
}

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(jsonResponse(createdSession, 201));
});

describe("LandingPage", () => {
  it("opens with the reference hero copy", () => {
    renderLanding();

    expect(screen.getByText("결혼은 나중에, 살림은 미리")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "서로의 돈을 이해하면 미래가 더 선명해져요",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName === "P" &&
          element.textContent ===
            "두 사람이 함께 살기 전에,서로의 재무를 알아가는 두 가지 방법을 선택해보세요.",
      ),
    ).toBeInTheDocument();

    const points = screen.getByRole("list", { name: "개인정보 안내" });
    expect(within(points).getAllByRole("listitem").map((item) => item.textContent?.trim())).toEqual([
      "초대 코드로 2인 참여",
      "입력 전까지 서로의 정보 비공개",
      "모든 데이터는 7일 후 자동 삭제",
    ]);
  });

  it("presents the light mode card exactly as the reference does", () => {
    renderLanding();

    const card = modeCard("가볍게 맞춰보기");

    expect(within(card).getByText("3분")).toBeInTheDocument();
    expect(within(card).getByText("우리는 서로를 얼마나 알고 있나")).toBeInTheDocument();
    expect(within(card).getAllByRole("listitem").map((item) => item.textContent?.trim())).toEqual([
      "구간 선택으로 간단하게",
      "상호 예측으로 서로 이해도 확인",
      "재무 성향 유형과 저축여력 추정",
    ]);
    expect(
      within(card).getByRole("button", { name: "가볍게 맞춰보기 시작하기" }),
    ).toBeEnabled();
  });

  it("presents the deep mode card with the CTA disabled until the flow exists", () => {
    renderLanding();

    const card = modeCard("제대로 계산해보기");

    expect(within(card).getByText("15분")).toBeInTheDocument();
    expect(within(card).getByText("우리 숫자를 합치면 어떻게 되나")).toBeInTheDocument();
    expect(within(card).getAllByRole("listitem").map((item) => item.textContent?.trim())).toEqual([
      "정확한 금액으로 꼼꼼하게",
      "합가 후 월 현금흐름 시뮬레이션",
      "활용 가능한 정책금융까지",
    ]);
    expect(
      within(card).getByRole("button", { name: "제대로 계산해보기 시작하기" }),
    ).toBeDisabled();
  });

  it("lists the four usage steps with chevrons between them", () => {
    renderLanding();

    expect(screen.getByRole("heading", { level: 2, name: "이용 방법" })).toBeInTheDocument();

    const steps = screen.getByRole("list", { name: "이용 방법" });
    const items = within(steps).getAllByRole("listitem");
    expect(items).toHaveLength(4);
    expect(
      ["1. 세션 생성", "2. 함께 입력", "3. 동시 공개", "4. 함께 이해"].map((title) =>
        within(steps).getByText(title),
      ),
    ).toHaveLength(4);
    expect(within(steps).getByText("초대 코드를 만들고")).toBeInTheDocument();
    expect(within(steps).getByText("상대에게 공유해요")).toBeInTheDocument();
    expect(within(steps).getAllByText("›")).toHaveLength(3);
  });

  it("uses the repository illustrations the reference bundles", () => {
    const { container } = renderLanding();

    expect(screen.getByAltText("노트북을 함께 보고 있는 커플 일러스트")).toHaveAttribute(
      "src",
      "/images/미리살림_사람.png",
    );
    expect(container.querySelector('img[src="/images/미리살림_3분_아이콘.png"]')).toHaveAttribute(
      "alt",
      "",
    );
  });

  it("anchors the header navigation targets", () => {
    const { container } = renderLanding();

    expect(container.querySelector("#about")).not.toBeNull();
    expect(container.querySelector("#how")).not.toBeNull();
  });

  it("creates a light session with no name step and moves to the first question", async () => {
    const { user } = renderLanding();

    await startSession(user);

    expect(await screen.findByRole("heading", { name: "라이트 질문" })).toBeInTheDocument();

    const [request] = fetchMock.mock.calls[0] as [Request];
    expect(request.method).toBe("POST");
    expect(new URL(request.url).pathname).toBe("/api/v1/sessions");
    expect(request.headers.get("Idempotency-Key")).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    await expect(request.json()).resolves.toEqual({ mode: "light" });
  });

  it("never asks the visitor for a name", async () => {
    const { user } = renderLanding();

    await startSession(user);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("닉네임")).not.toBeInTheDocument();
  });

  it("stores only the public session id", async () => {
    const { user } = renderLanding();

    await startSession(user);

    await waitFor(() => expect(sessionStorage.getItem("activeSessionId")).toBe("session-a"));
    expect(storageKeys(sessionStorage)).toEqual(["activeSessionId"]);
    expect(storageKeys(localStorage)).toEqual([]);
  });

  it("keeps the visitor on the landing page when the session request fails", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: { code: "INTERNAL_SERVER_ERROR", message: "실패" } }, 500),
    );

    const { user } = renderLanding();

    await startSession(user);

    expect(
      await screen.findByText("세션을 시작하지 못했어요. 잠시 후 다시 시도해 주세요."),
    ).toBeInTheDocument();
    expect(sessionStorage.getItem("activeSessionId")).toBeNull();
    expect(screen.queryByRole("heading", { name: "라이트 질문" })).not.toBeInTheDocument();
  });
});
