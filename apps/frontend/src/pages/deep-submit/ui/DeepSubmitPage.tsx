import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { deepInputQueryKey, fetchDeepInput } from "@/entities/deep-input";
import { deepPlanQueryKey, fetchDeepPlan } from "@/entities/deep-plan";
import { deepQuestionsQueryKey, getDeepQuestions } from "@/entities/deep-question";
import { submitDeepSession } from "@/entities/deep-session";
import { useDeepInputStore } from "@/features/save-deep-input";
import { isApiErrorCode } from "@/shared/api";
import { Button } from "@/shared/ui/button";

const cardClassName = "rounded-card border border-border bg-card p-6 sm:p-8";

const incompleteQuestionIds = (error: unknown): string[] => {
  if (!isApiErrorCode(error, "INPUT_INCOMPLETE")) return [];
  return Object.keys(error.fieldErrors ?? {})
    .filter((key) => key.startsWith("values."))
    .map((key) => key.slice("values.".length))
    .filter((questionId) => questionId !== "");
};

const submitErrorMessage = (error: unknown): string => {
  if (isApiErrorCode(error, "PLAN_VERSION_CONFLICT")) {
    return "최신 계획과 달라요. 공동 계획을 다시 확인한 뒤 제출해 주세요.";
  }
  if (isApiErrorCode(error, "INPUT_LOCKED")) {
    return "입력이 잠겼어요. 최신 세션 상태를 확인해 주세요.";
  }
  return "제출하지 못했어요. 최신 입력을 확인한 뒤 다시 시도해 주세요.";
};

export function DeepSubmitPage() {
  const { sessionId = "" } = useParams();
  const navigate = useNavigate();
  const [shareFinance, setShareFinance] = useState(false);
  const [shareValues, setShareValues] = useState(false);
  const flush = useDeepInputStore((state) => state.flush);

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
  const planQuery = useQuery({
    enabled: sessionId !== "",
    queryFn: () => fetchDeepPlan(sessionId),
    queryKey: deepPlanQueryKey(sessionId),
    retry: false,
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      await flush();
      const [latestInput, latestPlan] = await Promise.all([inputQuery.refetch(), planQuery.refetch()]);
      if (latestInput.data === undefined || latestPlan.data === undefined) {
        throw new Error("latest submit values unavailable");
      }

      return submitDeepSession(sessionId, {
        consentVersion: questionsQuery.data?.consent.version ?? "deep-sharing-v2",
        expectedRevision: latestInput.data.revision,
        planVersion: latestPlan.data.version,
        shareFinance,
        shareValues,
      });
    },
    onError: (error) => {
      const questionIds = incompleteQuestionIds(error);
      if (questionIds.length > 0) {
        const searchParams = new URLSearchParams();
        questionIds.forEach((questionId) => searchParams.append("incompleteQuestion", questionId));
        navigate(`/deep/questions/${encodeURIComponent(sessionId)}?${searchParams.toString()}`);
        return;
      }
      if (isApiErrorCode(error, "PLAN_VERSION_CONFLICT")) {
        navigate(`/deep/plan/${encodeURIComponent(sessionId)}`);
      }
    },
    onSuccess: () => {
      navigate(`/deep/result/${encodeURIComponent(sessionId)}`);
    },
  });

  if (
    sessionId === "" ||
    questionsQuery.isPending ||
    inputQuery.isPending ||
    planQuery.isPending
  ) {
    return (
      <section className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-5 px-5 py-16 sm:px-8">
        <h1 className="text-3xl font-extrabold tracking-[-0.02em]">제출 전 확인</h1>
        <p aria-live="polite" className="text-ink-muted" role="status">제출에 필요한 최신 정보를 확인하고 있어요.</p>
      </section>
    );
  }

  if (
    questionsQuery.isError ||
    inputQuery.isError ||
    planQuery.isError ||
    questionsQuery.data === undefined ||
    inputQuery.data === undefined ||
    planQuery.data === undefined
  ) {
    return (
      <section className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-5 px-5 py-16 sm:px-8">
        <h1 className="text-3xl font-extrabold tracking-[-0.02em]">제출 전 확인</h1>
        <div className={cardClassName} role="alert">
          <h2 className="text-xl font-extrabold">제출 정보를 확인하지 못했어요.</h2>
          <p className="mt-2 leading-relaxed text-ink-muted">최신 질문과 입력을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.</p>
          <Button
            className="mt-5"
            onClick={() => {
              void questionsQuery.refetch();
              void inputQuery.refetch();
              void planQuery.refetch();
            }}
            variant="secondary"
          >
            다시 확인하기
          </Button>
        </div>
      </section>
    );
  }

  const values = inputQuery.data.input.values ?? {};
  const skippedQuestionIds = inputQuery.data.input.skippedQuestionIds ?? [];
  const skippedQuestionIdSet = new Set<string>(skippedQuestionIds);
  const incompleteQuestions = questionsQuery.data.valueQuestions.filter(
    (question) =>
      (values[question.id] === undefined || values[question.id] === null) &&
      !skippedQuestionIdSet.has(question.id),
  );

  return (
    <section className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-5 py-12 sm:px-8 sm:py-16">
      <div className="space-y-3">
        <p className="text-sm font-semibold text-purple-strong">15분 모드 · 제출</p>
        <h1 className="text-3xl font-extrabold tracking-[-0.02em]">제출 전 확인</h1>
        <p className="leading-relaxed text-ink-muted">입력한 내용을 확인하고, 함께 볼 범위를 선택해 주세요. 선택하지 않은 내용은 공동 리포트에 포함하지 않아요.</p>
      </div>

      <div className={cardClassName}>
        <h2 className="text-xl font-extrabold">아직 확인하지 않은 질문</h2>
        {incompleteQuestions.length === 0 ? (
          <p className="mt-3 text-sm leading-relaxed text-ink-muted">모든 가치관 질문에 답했거나 건너뛰었어요.</p>
        ) : (
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-ink">
            {incompleteQuestions.map((question) => <li key={question.id}>{question.text}</li>)}
          </ul>
        )}
      </div>

      <div className={`${cardClassName} space-y-5`}>
        <div>
          <h2 className="text-xl font-extrabold">함께 볼 범위</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">두 분 모두 같은 범위를 공유해야 해당 계산과 질문을 확인할 수 있어요.</p>
        </div>
        <label className="flex items-start gap-3 text-sm leading-relaxed">
          <input
            aria-label="재무 정보 공유"
            checked={shareFinance}
            className="mt-1 size-4 accent-purple-strong"
            onChange={(event) => setShareFinance(event.currentTarget.checked)}
            type="checkbox"
          />
          <span><strong>재무 정보 공유</strong><br />{questionsQuery.data.consent.finance}</span>
        </label>
        <label className="flex items-start gap-3 text-sm leading-relaxed">
          <input
            aria-label="가치관 정보 공유"
            checked={shareValues}
            className="mt-1 size-4 accent-purple-strong"
            onChange={(event) => setShareValues(event.currentTarget.checked)}
            type="checkbox"
          />
          <span><strong>가치관 정보 공유</strong><br />{questionsQuery.data.consent.values}</span>
        </label>
        <p className="border-t border-border-soft pt-4 text-sm leading-relaxed text-ink-muted">{questionsQuery.data.consent.privateNotes}</p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <Link className="font-bold text-purple-strong underline" to={`/deep/questions/${encodeURIComponent(sessionId)}`}>질문으로 돌아가기</Link>
        <Button disabled={submitMutation.isPending} onClick={() => submitMutation.mutate()}>
          {submitMutation.isPending ? "제출하는 중이에요" : "제출하기"}
        </Button>
      </div>
      {submitMutation.isError && incompleteQuestionIds(submitMutation.error).length === 0 ? (
        <p aria-live="polite" className="text-sm font-semibold text-red-700" role="alert">{submitErrorMessage(submitMutation.error)}</p>
      ) : null}
    </section>
  );
}
