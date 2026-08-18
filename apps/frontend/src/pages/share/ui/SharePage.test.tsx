import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SharePage } from "./SharePage";

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));

vi.mock("@/shared/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared/api")>();

  return { ...actual, apiClient: actual.createApiClient({ fetch: fetchMock }) };
});

const readyResult = {
  status: "ready" as const,
  partnerCompleted: true as const,
  result: {
    discussionTopics: ["함께 이야기해 볼 주제"],
    mutualHitCount: 4,
    myType: {
      mgmt: "joint",
      mgmtDescription: "함께 관리하는 편이에요.",
      mgmtLabel: "공동관리형",
      recommendation: "대화를 이어가 보세요.",
      time: "saver",
      timeDescription: "미래를 준비하는 편이에요.",
      timeLabel: "미래대비형",
      typeCode: "saver_joint",
      typeDescription: "함께 목표를 세우는 유형이에요.",
      typeName: "차곡차곡 지도",
    },
    partnerType: {
      mgmt: "individual",
      mgmtDescription: "각자 관리하는 편이에요.",
      mgmtLabel: "개별관리형",
      recommendation: "서로의 방식을 존중해 보세요.",
      time: "spender",
      timeDescription: "현재를 즐기는 편이에요.",
      timeLabel: "현재중심형",
      typeCode: "spender_individual",
      typeDescription: "각자의 균형을 찾는 유형이에요.",
      typeName: "유연한 나침반",
    },
    questionCount: 7,
    questions: [],
    tagline: "서로의 생각을 이해하고 맞춰가는 첫걸음",
  },
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status,
  });
}

function renderShare(initialEntry = "/result/light/session-a/share") {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route element={<SharePage />} path="/result/light/share" />
          <Route element={<SharePage />} path="/result/light/:sessionId/share" />
          <Route element={<h1>상대방을 기다리는 중</h1>} path="/waiting/:sessionId" />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  localStorage.clear();
  sessionStorage.clear();
});

describe("SharePage", () => {
  it("renders a neutral error card when the session id is missing", () => {
    renderShare("/result/light/share");

    expect(screen.getByRole("heading", { name: "결과 공유" })).toBeInTheDocument();
    expect(screen.getByText("결과를 불러오지 못했어요.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("renders a neutral error card when the result API fails", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: { code: "TEMPORARY", message: "잠시 후 다시 시도해 주세요." } }, 503));

    renderShare();

    expect(await screen.findByText("결과를 불러오지 못했어요.")).toBeInTheDocument();
    expect(screen.queryByTestId("share-card")).not.toBeInTheDocument();
  });

  it("redirects waiting results before creating a share model", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ status: "waiting", partnerCompleted: false }));

    renderShare();

    expect(await screen.findByRole("heading", { name: "상대방을 기다리는 중" })).toBeInTheDocument();
    expect(screen.queryByTestId("share-card")).not.toBeInTheDocument();
    expect(screen.queryByText("차곡차곡 지도")).not.toBeInTheDocument();
  });

  it("renders a ready result as a portrait card by default", async () => {
    fetchMock.mockResolvedValue(jsonResponse(readyResult));

    renderShare();

    const card = await screen.findByTestId("share-card");

    expect(card).toHaveAttribute("data-ratio", "portrait");
    expect(screen.getByRole("button", { name: "세로 9:16" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "정사각형 1:1" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("4 / 7")).toBeInTheDocument();
  });

  it("rebuilds the share model when the ratio button changes", async () => {
    fetchMock.mockResolvedValue(jsonResponse(readyResult));

    renderShare();

    await screen.findByTestId("share-card");
    fireEvent.click(screen.getByRole("button", { name: "정사각형 1:1" }));

    expect(screen.getByTestId("share-card")).toHaveAttribute("data-ratio", "square");
    expect(screen.getByRole("button", { name: "세로 9:16" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "정사각형 1:1" })).toHaveAttribute("aria-pressed", "true");
  });

  it("keeps the financial privacy disclosure outside the share card", async () => {
    fetchMock.mockResolvedValue(jsonResponse(readyResult));

    renderShare();

    const card = await screen.findByTestId("share-card");

    expect(screen.getByText("금액, 부채, 저축액 같은 재무 정보는 카드에 담기지 않아요")).toBeInTheDocument();
    expect(card.textContent).not.toMatch(/금액|소득|부채|저축액/i);
  });

  it("does not write result data to web storage", async () => {
    fetchMock.mockResolvedValue(jsonResponse(readyResult));
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem");

    renderShare();

    await screen.findByTestId("share-card");

    expect(setItemSpy).not.toHaveBeenCalled();
  });
});
