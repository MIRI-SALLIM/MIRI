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
] as const;

describe("AppRoutes", () => {
  it.each(routeCases)("renders the matching lazy page for %s", async (path, heading) => {
    renderRoute(path);

    expect(await screen.findByRole("heading", { name: heading })).toBeInTheDocument();
  });

  it("renders a neutral error page for an unknown path", async () => {
    renderRoute("/unknown");

    expect(await screen.findByRole("heading", { name: "페이지를 찾을 수 없어요" })).toBeInTheDocument();
  });
});
