import { useQuery } from "@tanstack/react-query";

import type { LightResult } from "@/entities/light-result";
import { isTerminalApiError } from "@/shared/api";

import { fetchLightResult, lightResultQueryKey } from "../api/get-light-result";

export type LightResultView =
  | { error: unknown; state: "error" }
  | { result: LightResult; state: "ready" }
  | { state: "loading" }
  | { state: "waiting" };

/**
 * 결과 화면의 분기는 방금 서버에서 확인한 값으로만 결정한다.
 * 대기 중에 결과 URL을 방문하면 waiting 응답이 캐시에 남는데, 그 값을 그대로 믿고
 * 리다이렉트하면 결과가 준비된 뒤에도 대기 화면으로 되튕긴다.
 */
export function useLightResult(sessionId: string): LightResultView {
  const resultQuery = useQuery({
    enabled: sessionId !== "",
    queryFn: () => fetchLightResult(sessionId),
    queryKey: lightResultQueryKey(sessionId),
    // staleTime 전역 설정이 바뀌어도 마운트마다 다시 확인하도록 고정한다.
    refetchOnMount: "always",
    retry: false,
  });

  if (sessionId === "") {
    return { error: new Error("Missing session id"), state: "error" };
  }

  const data = resultQuery.data;
  const staleReady = data !== undefined && data.status === "ready" ? data.result : undefined;

  if (data === undefined) {
    return resultQuery.isError
      ? { error: resultQuery.error, state: "error" }
      : { state: "loading" };
  }

  if (resultQuery.isError) {
    // 완성된 결과를 이미 받아 둔 뒤의 일시적 실패로 화면을 무너뜨리지 않는다.
    if (staleReady !== undefined && !isTerminalApiError(resultQuery.error)) {
      return { result: staleReady, state: "ready" };
    }

    return { error: resultQuery.error, state: "error" };
  }

  if (data.status === "waiting") {
    // 재검증이 끝나기 전에 대기 화면으로 되돌리면 무한 왕복이 된다.
    return resultQuery.isFetching ? { state: "loading" } : { state: "waiting" };
  }

  return { result: data.result, state: "ready" };
}
