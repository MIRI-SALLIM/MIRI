import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { useParams, useSearchParams } from "react-router-dom";

import { deepInputQueryKey, fetchDeepInput } from "@/entities/deep-input";
import { deepQuestionsQueryKey, getDeepQuestions } from "@/entities/deep-question";
import { useDeepInputStore } from "@/features/save-deep-input";
import { Button } from "@/shared/ui/button";
import { NavigationLink } from "@/shared/ui/navigation-link";
import { PageLoading } from "@/shared/ui/page-loading";
import { Skeleton } from "@/shared/ui/skeleton";
import { DeepInputSyncNotice } from "@/widgets/deep-input-sync-notice";
import { DeepQuestionsForm } from "@/widgets/deep-questions-form";

const cardClassName = "rounded-card border border-border bg-card p-6 sm:p-8";

export function DeepQuestionsPage() {
  const { sessionId = "" } = useParams();
  const [searchParams] = useSearchParams();
  const incompleteQuestionIds = searchParams.getAll("incompleteQuestion");
  const questionsQuery = useQuery({
    enabled: sessionId !== "",
    queryFn: () => getDeepQuestions(sessionId),
    queryKey: deepQuestionsQueryKey(sessionId),
    retry: false,
  });
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

  const incompleteQuestions = questionsQuery.data?.valueQuestions.filter(
    (question) => incompleteQuestionIds.includes(question.id),
  ) ?? [];
  const firstIncompleteQuestionId = incompleteQuestionIds[0] ?? null;

  useEffect(() => {
    if (firstIncompleteQuestionId === null || questionsQuery.data === undefined) return;
    const target = document.getElementById(`deep-value-heading-${firstIncompleteQuestionId}`);
    target?.scrollIntoView({ block: "center" });
    target?.focus();
  }, [firstIncompleteQuestionId, questionsQuery.data]);

  useEffect(() => {
    if (inputQuery.data !== undefined && sessionId !== "") {
      hydrate(inputQuery.data, { sessionId });
    }
  }, [hydrate, inputQuery.data, sessionId]);

  if (questionsQuery.isError || inputQuery.isError) {
    return (
      <section className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-5 px-5 py-16 sm:px-8">
        <h1 className="text-3xl font-extrabold tracking-[-0.02em]">가치관과 분담 질문</h1>
        <div className={cardClassName} role="alert">
          <h2 className="text-xl font-extrabold">가치관과 분담 질문을 불러오지 못했어요.</h2>
          <p className="mt-2 leading-relaxed text-ink-muted">서버에서 최신 질문과 입력을 확인하지 못했어요. 잠시 후 다시 시도해 주세요.</p>
          <Button className="mt-5" onClick={() => { void questionsQuery.refetch(); void inputQuery.refetch(); }} variant="secondary">다시 확인하기</Button>
        </div>
      </section>
    );
  }

  if (sessionId === "" || questionsQuery.isPending || inputQuery.isPending || questionsQuery.data === undefined || !isHydrated || draft === null) {
    return (
      <PageLoading
        className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 py-12 sm:px-8 sm:py-16"
        eyebrow="15분 모드 · 가치관과 분담"
        heading="가치관과 분담 질문"
        message="가치관과 분담 질문을 불러오고 있어요."
      >
        <div className="space-y-3">
          <Skeleton className="h-4 w-44" />
          <Skeleton className="h-7 w-4/5" />
          <Skeleton className="h-5 w-full" />
        </div>
        <div className="space-y-8 rounded-card border border-border bg-card p-6 sm:p-8">
          <div className="space-y-4">
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
          <div className="space-y-4">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        </div>
      </PageLoading>
    );
  }

  const encodedSessionId = encodeURIComponent(sessionId);
  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 py-12 sm:px-8 sm:py-16">
      <div className="space-y-3">
        <p className="text-sm font-semibold text-purple-strong">15분 모드 · 가치관과 분담</p>
        <h1 className="text-3xl font-extrabold tracking-[-0.02em]">{questionsQuery.data.title}</h1>
        <p className="leading-relaxed text-ink-muted">서버가 보내 준 문항만 보여 드려요. 서로의 답변은 공유하기 전까지 보이지 않아요.</p>
      </div>

      <DeepInputSyncNotice blockingIssues={blockingIssues} syncState={syncState} />

      {incompleteQuestionIds.length > 0 ? (
        <div className={`${cardClassName} border-amber-300 bg-amber-50`} role="alert">
          <p className="font-bold">확인이 필요한 질문으로 돌아왔어요.</p>
          {incompleteQuestions.length > 0 ? (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed text-ink">
              {incompleteQuestions.map((question) => <li key={question.id}>{question.text}</li>)}
            </ul>
          ) : (
            <p className="mt-2 text-sm leading-relaxed text-ink">응답이 필요한 질문을 확인해 주세요.</p>
          )}
        </div>
      ) : null}

      <div className={cardClassName}>
        <DeepQuestionsForm
          disabled={isReadOnly}
          draft={draft}
          onBlur={() => void flush()}
          onChange={updateDraft}
          questions={questionsQuery.data}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <NavigationLink direction="back" to={`/deep/input/${encodedSessionId}`}>재무 현황으로 돌아가기</NavigationLink>
        <div className="flex flex-wrap gap-4">
          <NavigationLink direction="forward" to={`/deep/submit/${encodedSessionId}`}>제출 전 확인하기</NavigationLink>
          <NavigationLink direction="forward" to={`/deep/waiting/${encodedSessionId}`}>세션 상태 보기</NavigationLink>
        </div>
      </div>
    </section>
  );
}
