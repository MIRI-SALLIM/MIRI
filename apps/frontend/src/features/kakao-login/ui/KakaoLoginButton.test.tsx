import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { KakaoLoginButton, startKakaoLogin } from "@/features/kakao-login";

describe("KakaoLoginButton", () => {
  it("renders its brand mark inline and exposes a disabled reason", () => {
    const { container } = render(
      <KakaoLoginButton disabled disabledReason="로그인 기능을 사용할 수 없어요." />,
    );

    expect(screen.getByRole("button", { name: "카카오로 로그인" })).toBeDisabled();
    expect(screen.getByText("로그인 기능을 사용할 수 없어요.")).toBeInTheDocument();
    expect(container.querySelector("svg")).toBeInTheDocument();
    expect(container.querySelector("img")).not.toBeInTheDocument();
  });

  it("encodes the safe return path when starting Kakao login", () => {
    const assign = vi.fn();
    const originalLocation = window.location;
    Object.defineProperty(window, "location", { configurable: true, value: { assign } });

    startKakaoLogin("/deep/ready");

    expect(assign).toHaveBeenCalledWith("/api/v1/auth/kakao/start?returnTo=%2Fdeep%2Fready");
    Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
  });
});
