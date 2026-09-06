import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { Link, useParams } from "react-router-dom";

import {
  deepInputQueryKey,
  fetchDeepInput,
} from "@/entities/deep-input";
import { useDeepInputStore } from "@/features/save-deep-input";
import { Button } from "@/shared/ui/button";
import { DeepInputSyncNotice } from "@/widgets/deep-input-sync-notice";
import { DeepInputForm } from "@/widgets/deep-input-form";

const cardClassName = "rounded-card border border-border bg-card p-6 sm:p-8";

export function DeepInputPage() {
  const { sessionId = "" } = useParams();
  const inputQuery = useQuery({
    enabled: sessionId !== "",
    queryFn: () => fetchDeepInput(sessionId),
    queryKey: deepInputQueryKey(sessionId),
    retry: false,
  });
  const draft = useDeepInputStore((state) => state.draft);
  const isHydrated = useDeepInputStore((state) => state.isHydrated);
  const isReadOnly = useDeepInputStore((state) => state.isReadOnly);
  const blockingIssues = useDeepInputStore((state) => state.blockingIssues);
  const syncState = useDeepInputStore((state) => state.syncState);
  const hydrate = useDeepInputStore((state) => state.hydrate);
  const updateDraft = useDeepInputStore((state) => state.updateDraft);
  const flush = useDeepInputStore((state) => state.flush);

  useEffect(() => {
    if (inputQuery.data !== undefined && sessionId !== "") {
      hydrate(inputQuery.data, { sessionId });
    }
  }, [hydrate, inputQuery.data, sessionId]);

  if (inputQuery.isError) {
    return (
      <section className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-5 px-5 py-16 sm:px-8">
        <h1 className="text-3xl font-extrabold tracking-[-0.02em]">각자의 재무 현황</h1>
        <div className={cardClassName} role="alert">
          <h2 className="text-xl font-extrabold">재무 현황을 불러오지 못했어요.</h2>
          <p className="mt-2 leading-relaxed text-ink-muted">서버에서 최신 입력을 확인하지 못했어요. 잠시 후 다시 시도해 주세요.</p>
          <Button className="mt-5" onClick={() => void inputQuery.refetch()} variant="secondary">다시 확인하기</Button>
        </div>
      </section>
    );
  }

  if (sessionId === "" || inputQuery.isPending || !isHydrated || draft === null) {
    return (
      <section className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-5 px-5 py-16 sm:px-8">
        <h1 className="text-3xl font-extrabold tracking-[-0.02em]">각자의 재무 현황</h1>
        <p aria-live="polite" className="text-ink-muted" role="status">내 재무 현황을 불러오고 있어요.</p>
      </section>
    );
  }

  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 py-12 sm:px-8 sm:py-16">
      <div className="space-y-3">
        <p className="text-sm font-semibold text-purple-strong">15분 모드 · 내 입력</p>
        <h1 className="text-3xl font-extrabold tracking-[-0.02em]">각자의 재무 현황</h1>
        <p className="leading-relaxed text-ink-muted">서로의 답변은 공유하기 전까지 보이지 않아요. 지금 확인할 수 있는 내용부터 적고, 모르는 내용은 모름으로 남겨도 돼요.</p>
      </div>

      <DeepInputSyncNotice blockingIssues={blockingIssues} syncState={syncState} />

      <div className={cardClassName}>
        <DeepInputForm
          disabled={isReadOnly}
          draft={draft}
          onBlur={() => void flush()}
          onChange={updateDraft}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <Link className="font-bold text-purple-strong underline" to={`/deep/plan/${encodeURIComponent(sessionId)}`}>공동 계획으로 돌아가기</Link>
        <div className="flex flex-wrap gap-4">
          <Link className="font-bold text-purple-strong underline" to={`/deep/questions/${encodeURIComponent(sessionId)}`}>가치관과 분담 질문으로 가기</Link>
          <Link className="font-bold text-purple-strong underline" to={`/deep/waiting/${encodeURIComponent(sessionId)}`}>세션 상태 보기</Link>
        </div>
      </div>
    </section>
  );
}
