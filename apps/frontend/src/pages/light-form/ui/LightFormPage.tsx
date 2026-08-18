import { useMutation, useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";

import {
  ACTIVE_SESSION_STORAGE_KEY,
  activeSessionQueryKey,
} from "@/features/create-session";
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
import { Progress } from "@/shared/ui/progress";
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
    retry: false,
  });

  const answers = useLightFormStore((state) => state.answers);
  const guesses = useLightFormStore((state) => state.guesses);
  const isHydrated = useLightFormStore((state) => state.isHydrated);
  const isReadOnly = useLightFormStore((state) => state.isReadOnly);
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

  const questionCount = questionQuery.data?.questions.length ?? 0;
  const boundedStep = questionCount === 0 ? 0 : Math.min(Math.max(requestedStep - 1, 0), questionCount - 1);

  useEffect(() => {
    if (inputQuery.data && questionCount > 0) {
      hydrate(normalizeInput(inputQuery.data, questionCount));
      setCurrentStep(boundedStep);
    }
  }, [boundedStep, hydrate, inputQuery.data, questionCount, setCurrentStep]);

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
      navigate("/done");
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

  return (
    <section className="mx-auto flex max-w-3xl flex-col gap-7 px-5 py-12 sm:px-8 sm:py-16">
      <div className="flex flex-col gap-3">
        <p className="text-sm font-bold text-green-strong">3분 모드</p>
        <h1 className="text-2xl font-extrabold tracking-[-0.02em] text-ink">라이트 질문</h1>
      </div>

      {questionQuery.isPending || inputQuery.isPending || !isHydrated ? (
        <p aria-live="polite" className="rounded-card border border-border bg-card p-6 text-ink-muted" role="status">
          질문을 불러오는 중...
        </p>
      ) : questionQuery.isError || inputQuery.isError || sessionId === null ? (
        <p className="rounded-card border border-border bg-card p-6 text-red-700" role="alert">
          {pageErrorMessage}
        </p>
      ) : questionCount === 0 ? (
        <p className="rounded-card border border-border bg-card p-6 text-red-700" role="alert">
          {pageErrorMessage}
        </p>
      ) : (
        <>
          <Progress label="진행률" max={questionCount} value={boundedStep + 1} />
          <LightQuestionCard
            answer={answers[boundedStep] ?? null}
            disabled={isReadOnly}
            guess={guesses[boundedStep] ?? null}
            onAnswerChange={(value) => updateAnswer("answer", value)}
            onGuessChange={(value) => updateAnswer("guess", value)}
            question={questionQuery.data.questions[boundedStep]}
          />

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-2">
              <Button
                disabled={boundedStep === 0}
                onClick={() => goToStep(Math.max(0, boundedStep - 1))}
                variant="secondary"
              >
                이전
              </Button>
              {boundedStep < questionCount - 1 ? (
                <Button onClick={() => goToStep(boundedStep + 1)} variant="secondary">
                  다음
                </Button>
              ) : null}
            </div>
            {boundedStep === questionCount - 1 ? (
              <SubmitLightButton
                disabled={isReadOnly || sessionId === null}
                isPending={submitMutation.isPending}
                onClick={() => submitMutation.mutate()}
              />
            ) : null}
          </div>

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
