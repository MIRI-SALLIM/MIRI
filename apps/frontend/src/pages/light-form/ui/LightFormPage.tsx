import { useMutation, useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";

import {
  ACTIVE_SESSION_STORAGE_KEY,
  activeSessionQueryKey,
} from "@/features/create-session";
import { fetchSessionStatus, sessionStatusQueryKey } from "@/features/poll-session-status";
import {
  getActiveSession,
  getLightInput,
  getLightQuestions,
  saveLightInput,
  useLightFormStore,
  type LightInput,
} from "@/features/save-light-answer";
import { submitLightForm } from "@/features/submit-light-form";
import { LightQuestionCard } from "@/widgets/light-question-card";
import { ApiError } from "@/shared/api";
import type { LightAnswerValue } from "@/entities/light-answer";
import { LIGHT_QUESTION_VERSION } from "@/entities/light-question";
import { Button } from "@/shared/ui/button";
import { SubmitLightButton } from "@/features/submit-light-form";

const pageErrorMessage = "질문을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.";

function parseStep(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

function normalizeInput(input: NonNullable<Awaited<ReturnType<typeof getLightInput>>>, questionCount: number): LightInput {
  return {
    answers: Array.from({ length: questionCount }, (_, index) => input.answers?.[index] ?? null),
    guesses: Array.from({ length: questionCount }, (_, index) => input.guesses?.[index] ?? null),
  };
}

type LightFormHydrationState = "failed-data" | "pending-input" | "pending-status" | "ready";

function getLightFormHydrationState({
  hasInput,
  inputFetched,
  isReadOnly,
  questionCount,
  sessionId,
  statusReady,
}: {
  hasInput: boolean;
  inputFetched: boolean;
  isReadOnly: boolean;
  questionCount: number;
  sessionId: string | null;
  statusReady: boolean;
}): LightFormHydrationState {
  if (sessionId === null || !inputFetched) {
    return "pending-input";
  }

  if (!statusReady && !isReadOnly) {
    return "pending-status";
  }

  if (!hasInput || questionCount === 0) {
    return "failed-data";
  }

  return "ready";
}

function shouldHydrateLightForm({
  hydratedSessionId,
  isHydrated,
  isReadOnly,
  serverReadOnly,
  sessionId,
  state,
}: {
  hydratedSessionId: string | null;
  isHydrated: boolean;
  isReadOnly: boolean;
  serverReadOnly: boolean | undefined;
  sessionId: string | null;
  state: LightFormHydrationState;
}): boolean {
  if (state !== "ready") {
    return false;
  }

  if (!isHydrated || hydratedSessionId !== sessionId) {
    return true;
  }

  // The backend only changes completedAt from null to a timestamp: submit sets it,
  // and PATCH rejects an already-submitted participant; no API path clears it.
  // Keep the server value authoritative when it is explicit, while hydrate's session
  // comparison resets a stale lock when a different session is opened.
  return !isReadOnly || serverReadOnly === false;
}

export function LightFormPage() {
  const navigate = useNavigate();
  const { step } = useParams<{ step: string }>();
  const requestedStep = parseStep(step);
  const storedSessionId = sessionStorage.getItem(ACTIVE_SESSION_STORAGE_KEY);
  const saveTimerRef = useRef<number | null>(null);

  const activeSessionQuery = useQuery({
    enabled: storedSessionId === null,
    queryFn: getActiveSession,
    queryKey: activeSessionQueryKey,
    retry: false,
  });
  const sessionId = storedSessionId ?? activeSessionQuery.data?.id ?? null;

  useEffect(() => {
    if (activeSessionQuery.data?.id) {
      sessionStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, activeSessionQuery.data.id);
    }
  }, [activeSessionQuery.data?.id]);

  const questionQuery = useQuery({
    queryFn: getLightQuestions,
    queryKey: ["light-questions", LIGHT_QUESTION_VERSION],
    retry: false,
  });
  const inputQuery = useQuery({
    enabled: sessionId !== null,
    queryFn: () => getLightInput(sessionId!),
    queryKey: ["light-input", sessionId],
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    retry: false,
  });
  const sessionStatusQuery = useQuery({
    enabled: sessionId !== null,
    queryFn: () => fetchSessionStatus(sessionId!),
    queryKey: sessionId === null ? ["session-status", "disabled"] : sessionStatusQueryKey(sessionId),
    retry: false,
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const answers = useLightFormStore((state) => state.answers);
  const guesses = useLightFormStore((state) => state.guesses);
  const isHydrated = useLightFormStore((state) => state.isHydrated);
  const isReadOnly = useLightFormStore((state) => state.isReadOnly);
  const hydratedSessionId = useLightFormStore((state) => state.sessionId);
  const saveStatus = useLightFormStore((state) => state.saveStatus);
  const hydrate = useLightFormStore((state) => state.hydrate);
  const setAnswer = useLightFormStore((state) => state.setAnswer);
  const setCurrentStep = useLightFormStore((state) => state.setCurrentStep);
  const setGuess = useLightFormStore((state) => state.setGuess);
  const setReadOnly = useLightFormStore((state) => state.setReadOnly);
  const setSaveStatus = useLightFormStore((state) => state.setSaveStatus);

  const saveMutation = useMutation({
    mutationFn: ({ input, session }: { input: LightInput; session: string }) => saveLightInput(session, input),
    onError: async (error) => {
      if (error instanceof ApiError && error.kind === "conflict" && sessionId) {
        try {
          const serverInput = await getLightInput(sessionId);
          hydrate(serverInput);
          setReadOnly(true);
          setSaveStatus("saved");
          return;
        } catch {
          // Keep the in-memory input and show the ordinary save failure state.
        }
      }

      setSaveStatus("error");
    },
    onSuccess: () => setSaveStatus("saved"),
    retry: false,
  });

  const queueSave = useCallback(
    (input: LightInput) => {
      if (!sessionId || isReadOnly) {
        return;
      }

      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
      }

      setSaveStatus("saving");
      saveTimerRef.current = window.setTimeout(() => {
        saveMutation.mutate({ input, session: sessionId });
        saveTimerRef.current = null;
      }, 350);
    },
    [isReadOnly, saveMutation, sessionId, setSaveStatus],
  );

  useEffect(
    () => () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
      }
    },
    [],
  );

  const questions = questionQuery.data?.questions;
  const questionCount = questions?.length ?? 0;
  const boundedStep = questionCount === 0 ? 0 : Math.min(Math.max(requestedStep - 1, 0), questionCount - 1);
  const statusHydrationReady =
    sessionStatusQuery.isFetchedAfterMount && (sessionStatusQuery.isSuccess || sessionStatusQuery.isError);
  const serverReadOnly =
    statusHydrationReady && sessionStatusQuery.isSuccess ? sessionStatusQuery.data.meCompleted : undefined;
  const hydrationState = getLightFormHydrationState({
    hasInput: inputQuery.data !== undefined,
    inputFetched: inputQuery.isFetchedAfterMount,
    isReadOnly,
    questionCount,
    sessionId,
    statusReady: statusHydrationReady,
  });
  const shouldHydrate = shouldHydrateLightForm({
    hydratedSessionId,
    isHydrated,
    isReadOnly,
    serverReadOnly,
    sessionId,
    state: hydrationState,
  });

  useEffect(() => {
    if (!shouldHydrate || !inputQuery.data || sessionId === null) {
      return;
    }

    hydrate(normalizeInput(inputQuery.data, questionCount), {
      isReadOnly: serverReadOnly,
      sessionId,
    });
  }, [
    hydrate,
    inputQuery.data,
    questionCount,
    sessionId,
    serverReadOnly,
    shouldHydrate,
  ]);

  useEffect(() => {
    if (questionCount > 0) {
      setCurrentStep(boundedStep);
    }
  }, [boundedStep, questionCount, setCurrentStep]);

  const updateAnswer = useCallback(
    (kind: "answer" | "guess", value: LightAnswerValue) => {
      if (isReadOnly || !sessionId) {
        return;
      }

      const state = useLightFormStore.getState();
      const nextAnswers = [...state.answers];
      const nextGuesses = [...state.guesses];

      if (kind === "answer") {
        nextAnswers[boundedStep] = value;
        setAnswer(boundedStep, value);
      } else {
        nextGuesses[boundedStep] = value;
        setGuess(boundedStep, value);
      }

      queueSave({ answers: nextAnswers, guesses: nextGuesses });
    },
    [boundedStep, isReadOnly, queueSave, sessionId, setAnswer, setGuess],
  );

  const submitMutation = useMutation({
    mutationFn: () => submitLightForm(sessionId!),
    onError: () => setSaveStatus("error"),
    onSuccess: () => {
      setReadOnly(true);
      navigate(`/waiting/${sessionId}`);
    },
    retry: false,
  });

  const goToStep = (nextStep: number) => {
    setCurrentStep(nextStep);
    navigate(`/light/${nextStep + 1}`);
  };

  const saveStatusMessage =
    saveStatus === "saving"
      ? "저장 중..."
      : saveStatus === "saved"
        ? "저장됨"
        : saveStatus === "error"
          ? "저장되지 않음 · 다시 시도"
          : null;

  const isLastStep = questionCount > 0 && boundedStep === questionCount - 1;
  const isHydrationPending =
    sessionId !== null && (hydrationState === "pending-input" || hydrationState === "pending-status");
  // `failed-data` already implies that input fetched; the question guard remains
  // because questionCount defaults to zero while its fetch is still pending.
  const hasFailedData = hydrationState === "failed-data" && questionQuery.isFetchedAfterMount;
  // These render-blocking reads use retry:false, so an error is final: another read
  // still pending cannot turn the page into a usable form. Show the error first.
  const hasActiveSessionError = storedSessionId === null && activeSessionQuery.isError;
  const hasPageError = hasActiveSessionError || questionQuery.isError || inputQuery.isError || hasFailedData;
  const hasNoSession = sessionId === null && activeSessionQuery.isSuccess && activeSessionQuery.isFetchedAfterMount;
  const isPageLoading =
    !hasPageError && (questionQuery.isPending || inputQuery.isPending || isHydrationPending || !isHydrated);

  return (
    <section className="mx-auto flex w-full max-w-[760px] flex-1 flex-col justify-center px-6 pb-[clamp(10px,2vh,48px)] pt-[clamp(9px,1.5vh,36px)] [line-height:normal]">
      <div className="flex flex-wrap items-center justify-between gap-3.5">
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-green-tint px-3 py-[5px] text-[13px] font-semibold text-green-strong">
            3분
          </span>
          <h1 className="text-2xl font-extrabold tracking-[-0.02em] text-ink">가볍게 맞춰보기</h1>
        </div>
        <button
          className="inline-flex min-h-10 items-center rounded-xl border border-border bg-card px-4 text-sm text-ink-muted transition-colors duration-[160ms] ease-smooth hover:border-arrow hover:text-ink focus-visible:shadow-focus"
          onClick={() => navigate("/")}
          type="button"
        >
          나가기
        </button>
      </div>

      {hasPageError || hasNoSession ? (
        <p className="rounded-card border border-border bg-card p-6 text-red-700" role="alert">
          {pageErrorMessage}
        </p>
      ) : isPageLoading ? (
        <p aria-live="polite" className="rounded-card border border-border bg-card p-6 text-ink-muted" role="status">
          질문을 불러오는 중...
        </p>
      ) : questions === undefined || questions.length === 0 ? (
        <p className="rounded-card border border-border bg-card p-6 text-red-700" role="alert">
          {pageErrorMessage}
        </p>
      ) : (
        <>
          <div className="mt-[clamp(7px,1.1vh,24px)] flex items-center gap-3.5">
            <div
              aria-label="진행률"
              aria-valuemax={questionCount}
              aria-valuemin={0}
              aria-valuenow={boundedStep + 1}
              className="flex flex-auto gap-1.5"
              role="progressbar"
            >
              {Array.from({ length: questionCount }, (_, index) => (
                <span
                  className={`h-[5px] flex-1 rounded-full ${
                    index <= boundedStep ? "bg-green-strong" : "bg-[#EDEDEB]"
                  }`}
                  key={index}
                />
              ))}
            </div>
            <span className="shrink-0 text-[13px] text-ink-muted">
              {boundedStep + 1} / {questionCount}
            </span>
          </div>

          <LightQuestionCard
            answer={answers[boundedStep] ?? null}
            disabled={isReadOnly}
            footer={
              <>
                <Button
                  className="!min-h-[52px] !rounded-[14px] !px-[22px] !py-0 !text-base !font-semibold hover:!border-arrow disabled:!border-border-soft disabled:!text-[#BBBBBB] disabled:!opacity-55"
                  disabled={boundedStep === 0}
                  onClick={() => goToStep(Math.max(0, boundedStep - 1))}
                  variant="secondary"
                >
                  이전
                </Button>

                {isLastStep ? (
                  <SubmitLightButton
                    disabled={isReadOnly || sessionId === null}
                    isPending={submitMutation.isPending}
                    onClick={() => submitMutation.mutate()}
                  />
                ) : (
                  <Button
                    className="!min-h-[52px] !flex-[1_1_200px] !gap-2.5 !rounded-[14px] !border-transparent !bg-green-strong !px-5 !py-0 !text-[16.5px] !font-bold !text-white hover:!brightness-[.94] active:!translate-y-px"
                    onClick={() => goToStep(boundedStep + 1)}
                  >
                    다음 질문
                    <span aria-hidden="true" className="text-[18px]">
                      →
                    </span>
                  </Button>
                )}

                {isLastStep ? null : (
                  <button
                    className="inline-flex min-h-[52px] items-center rounded-md px-3.5 text-sm text-ink-muted transition-colors duration-[160ms] ease-smooth hover:text-ink focus-visible:shadow-focus"
                    onClick={() => goToStep(boundedStep + 1)}
                    type="button"
                  >
                    건너뛰기
                  </button>
                )}
              </>
            }
            guess={guesses[boundedStep] ?? null}
            onAnswerChange={(value) => updateAnswer("answer", value)}
            onGuessChange={(value) => updateAnswer("guess", value)}
            question={questions[boundedStep]}
          />

          {saveStatusMessage ? (
            <p
              aria-live="polite"
              className={saveStatus === "error" ? "text-sm font-semibold text-red-700" : "text-sm text-ink-muted"}
              role={saveStatus === "error" ? "alert" : "status"}
            >
              {saveStatusMessage}
            </p>
          ) : null}
          {submitMutation.isError ? (
            <p className="text-sm font-semibold text-red-700" role="alert">
              제출하지 못했어요. 입력을 확인한 뒤 다시 시도해 주세요.
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
