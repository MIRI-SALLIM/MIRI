import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { AppRoutes } from "./AppRoutes";

const routeCases = [
  ["/", "미리살림 랜딩"],
  ["/light/1", "라이트 질문"],
  ["/done", "제출 완료"],
  ["/invite/INV-A", "초대 참여"],
  ["/waiting/session-a", "상대방을 기다리는 중"],
  ["/result/light/session-a", "라이트 결과"],
  ["/result/light/session-a/share", "결과 공유"],
] as const;

describe("AppRoutes", () => {
  it.each(routeCases)("renders the matching lazy page for %s", async (path, heading) => {
    render(
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: heading })).toBeInTheDocument();
  });

  it("renders a neutral error page for an unknown path", async () => {
    render(
      <MemoryRouter initialEntries={["/unknown"]}>
        <AppRoutes />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "페이지를 찾을 수 없어요" })).toBeInTheDocument();
  });
});
