import { act, renderHook } from "@testing-library/react";
import { useLayoutEffect } from "react";
import { beforeEach, describe, expect, it } from "vitest";

import { useWindowWidth } from "./use-window-width";

describe("useWindowWidth", () => {
  beforeEach(() => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 899,
      writable: true,
    });
  });

  it("updates at the exact 900px desktop breakpoint", () => {
    const { result } = renderHook(() => useWindowWidth());
    expect(result.current).toBe(899);

    act(() => {
      window.innerWidth = 900;
      window.dispatchEvent(new Event("resize"));
    });

    expect(result.current).toBe(900);
  });

  it("captures a width change between render and effect setup", () => {
    const widthAfterRender = 900;
    let observedResult: { current: number | null } | undefined;

    act(() => {
      observedResult = renderHook(() => {
        const width = useWindowWidth();

        useLayoutEffect(() => {
          window.innerWidth = widthAfterRender;
          window.dispatchEvent(new Event("resize"));
        }, []);

        return width;
      }).result;
    });

    expect(observedResult?.current).toBe(widthAfterRender);
  });
});
