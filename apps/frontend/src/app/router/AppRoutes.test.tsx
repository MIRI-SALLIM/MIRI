import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { AppRoutes } from "./AppRoutes";

function renderRoute(path: string) {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const routeCases = [
  ["/", "서로의 돈을 이해하면 미래가 더 선명해져요"],
  ["/light/1", "가볍게 맞춰보기"],
  ["/invite/INV-A", "초대 참여"],
  ["/waiting/session-a", "상대방을 기다리는 중"],
  ["/result/light/session-a", "라이트 결과"],
  ["/result/light/session-a/share", "결과 공유"],
  ["/deep/invite/INV-A", "딥 모드 초대 참여"],
  ["/deep/waiting/session-a", "딥 세션이 열렸어요"],
  ["/deep/plan/session-a", "함께 계산할 공동 계획"],
  ["/deep/input/session-a", "각자의 재무 현황"],
] as const;

// React.lazy를 통한 첫 모듈 변환은 개발/CI 콜드 캐시에 따라 1초를 넘을 수 있다.
// 이는 라우트 로딩을 실패로 판정할 시간 제한이 아니라, fallback이 끝날 때까지 기다리는 테스트 한정 여유다.
const routeLoadTimeout = 10000;

describe("AppRoutes", () => {
  it.each(routeCases)("renders the matching lazy page for %s", async (path, heading) => {
    renderRoute(path);

    expect(await screen.findByRole("heading", { name: heading }, { timeout: routeLoadTimeout })).toBeInTheDocument();
  });

  it("renders a neutral error page for an unknown path", async () => {
    renderRoute("/unknown");

    expect(await screen.findByRole("heading", { name: "페이지를 찾을 수 없어요" })).toBeInTheDocument();
  });
});
