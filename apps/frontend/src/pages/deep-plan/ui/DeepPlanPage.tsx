import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useParams } from "react-router-dom";

import {
  deepPlanQueryKey,
  fetchDeepPlan,
  type DeepPlanInput,
  type DeepPlanResponse,
} from "@/entities/deep-plan";
import { ConfirmDeepPlanButton } from "@/features/confirm-deep-plan";
import { SaveDeepPlanButton } from "@/features/save-deep-plan";
import { NavigationLink } from "@/shared/ui/navigation-link";
import { PageLoading } from "@/shared/ui/page-loading";
import { Skeleton } from "@/shared/ui/skeleton";
import { DeepPlanForm } from "@/widgets/deep-plan-form";

const cardClassName = "flex flex-col gap-4 rounded-card border border-border bg-card p-6 sm:p-8";

export function DeepPlanPage() {
  const { sessionId = "" } = useParams();
  const queryClient = useQueryClient();
  const [draftState, setDraftState] = useState<DeepPlanInput | null>(null);
  const [draftVersion, setDraftVersion] = useState<number | null>(null);
  const planQuery = useQuery({
    enabled: sessionId !== "",
    queryFn: () => fetchDeepPlan(sessionId),
    queryKey: deepPlanQueryKey(sessionId),
    retry: false,
  });

  const draft = planQuery.data !== undefined && draftVersion === planQuery.data.version
    ? draftState ?? planQuery.data.plan
    : planQuery.data?.plan ?? null;

  const setDraft = (nextDraft: DeepPlanInput) => {
    setDraftVersion(planQuery.data?.version ?? null);
    setDraftState(nextDraft);
  };

  const applyResponse = (response: DeepPlanResponse) => {
    queryClient.setQueryData(deepPlanQueryKey(sessionId), response);
    setDraftVersion(response.version);
    setDraftState(response.plan);
  };

  const refreshAfterConflict = () => {
    void planQuery.refetch();
  };

  if (sessionId === "" || planQuery.isPending) {
    return (
      <PageLoading
        className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 py-12 sm:px-8 sm:py-16"
        eyebrow="15분 모드 · 공동 계획"
        heading="함께 계산할 공동 계획"
        message="공동 계획을 불러오고 있어요."
      >
        <div className="space-y-3">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-4/5" />
        </div>
        <div className="space-y-8 rounded-card border border-border bg-card p-6 sm:p-8">
          <div className="space-y-4">
            <Skeleton className="h-6 w-40" />
            <div className="grid gap-4 sm:grid-cols-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          </div>
          <div className="space-y-4">
            <Skeleton className="h-6 w-48" />
            <div className="grid gap-4 sm:grid-cols-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          </div>
          <div className="border-t border-border-soft pt-5">
            <Skeleton className="h-12 w-32" />
          </div>
        </div>
      </PageLoading>
    );
  }

  if (planQuery.isError || draft === null || planQuery.data === undefined) {
    return (
      <section className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-5 px-5 py-16 sm:px-8">
        <h1 className="text-2xl font-extrabold">함께 계산할 공동 계획</h1>
        <h2 className="text-xl font-extrabold">공동 계획을 불러오지 못했어요.</h2>
        <p className="leading-relaxed text-ink-muted">서버에서 최신 계획을 확인하지 못했어요. 잠시 후 다시 시도해 주세요.</p>
        <button className="min-h-12 w-fit rounded-control border border-border px-5 py-3 font-bold hover:border-purple-strong" onClick={() => void planQuery.refetch()} type="button">다시 확인하기</button>
      </section>
    );
  }

  const { locked, myConfirmed, partnerConfirmed, version } = planQuery.data;
  const isDirty = JSON.stringify(draft) !== JSON.stringify(planQuery.data.plan);

  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 py-12 sm:px-8 sm:py-16">
      <div className="space-y-3">
        <p className="text-sm font-semibold text-purple-strong">15분 모드 · 공동 계획</p>
        <h1 className="text-3xl font-extrabold tracking-[-0.02em]">함께 계산할 공동 계획</h1>
        <p className="leading-relaxed text-ink-muted">같은 계획 버전을 두 사람이 확인해야 다음 단계로 넘어갈 수 있어요. 계획을 고치면 두 사람의 확인이 다시 풀려요.</p>
      </div>

      <div className={cardClassName}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-extrabold">계획 버전 {version}</h2>
          {locked ? <span className="rounded-full bg-purple-tint px-3 py-1 text-sm font-bold text-purple-strong">읽기 전용</span> : null}
        </div>
        {locked ? <p className="text-sm leading-relaxed text-ink-muted">계획이 잠겨 읽기 전용이에요.</p> : null}
        <DeepPlanForm disabled={locked} onChange={setDraft} plan={draft} />
        {!locked ? (
          <div className="flex flex-wrap items-start justify-between gap-4 border-t border-border-soft pt-5">
            <SaveDeepPlanButton
              expectedVersion={version}
              onConflict={refreshAfterConflict}
              onSuccess={applyResponse}
              plan={draft}
              sessionId={sessionId}
            />
            {myConfirmed ? <p className="text-sm font-semibold text-purple-strong">내가 이 계획을 확인했어요.</p> : <ConfirmDeepPlanButton disabled={isDirty} onConflict={refreshAfterConflict} onSuccess={applyResponse} planVersion={version} sessionId={sessionId} />}
            <div className="flex basis-full flex-col items-start gap-2 sm:items-end">
              {isDirty ? <p className="text-sm text-ink-muted">저장한 뒤 이 계획을 확인할 수 있어요.</p> : null}
              <p className="text-sm text-ink-muted">{partnerConfirmed ? "상대도 이 버전을 확인했어요." : "상대의 확인을 기다리고 있어요."}</p>
            </div>
          </div>
        ) : (
          <div className="border-t border-border-soft pt-5">
            <p className="text-sm leading-relaxed text-ink-muted">계획이 잠겨 있어 수정할 수 없지만, 아직 확인하지 않았다면 이 버전을 확인할 수 있어요.</p>
            {myConfirmed ? (
              <p className="mt-3 text-sm font-semibold text-purple-strong">내 확인: 확인했어요 · 상대 확인: {partnerConfirmed ? "확인했어요" : "아직 확인하지 않았어요"}</p>
            ) : (
              <div className="mt-4">
                <ConfirmDeepPlanButton
                  onConflict={refreshAfterConflict}
                  onSuccess={applyResponse}
                  planVersion={version}
                  sessionId={sessionId}
                />
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        {myConfirmed ? (
          <NavigationLink direction="forward" to={`/deep/input/${encodeURIComponent(sessionId)}`}>내 재무 현황으로 가기</NavigationLink>
        ) : (
          <p className="text-sm text-ink-muted">이 계획을 확인하면 내 재무 현황을 입력할 수 있어요.</p>
        )}
        <NavigationLink direction="back" to={`/deep/waiting/${encodeURIComponent(sessionId)}`}>세션 상태로 돌아가기</NavigationLink>
      </div>
    </section>
  );
}
