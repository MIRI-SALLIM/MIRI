import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { DeepCheck } from "../pages/login-check";

const own = { round: 1, planVersion: 2, revision: 1, answers: null, consent: null,
  questions: [], consentVersion: "money-meeting-consent-v2", consentNotice: "합성 데이터 외부 처리 안내" };
function setup() {
  const fetcher = vi.fn(async (url: string, options?: RequestInit) => {
    let data: unknown = {};
    if (url.endsWith("/sessions")) data = { id: "session-a", invitationCode: "invite-a", role: "A" };
    if (url.endsWith("/meeting/me")) data = own;
    if (url.endsWith("/explanation")) data = { status: "ready", source: "template", reason: "disabled",
      cards: [{ issueId: "contribution_gap", explanation: "부족분을 논의하세요", question: "무엇을 조정할까요?" }], brief: { facts: [] } };
    return new Response(JSON.stringify(data), { status: options?.method === "POST" && url.endsWith("/sessions") ? 201 : 200 });
  });
  vi.stubGlobal("fetch", fetcher);
  render(<DeepCheck />);
  return fetcher;
}
afterEach(() => vi.unstubAllGlobals());

it("does not request or grant consent on mount; AI POST needs a separate explicit click", async () => {
  const fetcher = setup();
  expect(fetcher).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: "진단 만들기" }));
  expect(screen.getByLabelText("재무·가치관 공유 동의")).not.toBeChecked();
  await userEvent.click(screen.getByRole("button", { name: "추가 질문 불러오기" }));
  expect(await screen.findByText("합성 데이터 외부 처리 안내")).toBeInTheDocument();
  expect(screen.getByLabelText("AI 처리 동의")).not.toBeChecked();
  await userEvent.click(screen.getByRole("button", { name: "해설 조회 (생성 안 함)" }));
  expect(await screen.findByText("부족분을 논의하세요")).toBeInTheDocument();
  expect(fetcher.mock.calls.filter(([url, init]) => url.endsWith("/explanation") && init?.method === "POST")).toHaveLength(0);
  await userEvent.click(screen.getByLabelText("유료 AI 요청 가능성을 이해했습니다"));
  await userEvent.click(screen.getByRole("button", { name: "AI 생성 요청" }));
  expect(fetcher.mock.calls.filter(([url, init]) => url.endsWith("/explanation") && init?.method === "POST")).toHaveLength(1);
  await userEvent.click(screen.getByRole("button", { name: "해설 동의 철회" }));
  expect(screen.queryByText("부족분을 논의하세요")).not.toBeInTheDocument();
});

it("clears stale output and does not retry a conflict", async () => {
  const fetcher = setup();
  await userEvent.click(screen.getByRole("button", { name: "진단 만들기" }));
  await userEvent.click(screen.getByRole("button", { name: "해설 조회 (생성 안 함)" }));
  await screen.findByText("부족분을 논의하세요");
  fetcher.mockResolvedValueOnce(new Response("PRIVATE_DETAIL", { status: 409 }));
  const before = fetcher.mock.calls.length;
  await userEvent.click(screen.getByRole("button", { name: "공동 리포트 조회" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("새로 조회");
  expect(screen.queryByText("부족분을 논의하세요")).not.toBeInTheDocument();
  expect(fetcher.mock.calls).toHaveLength(before + 1);
});
