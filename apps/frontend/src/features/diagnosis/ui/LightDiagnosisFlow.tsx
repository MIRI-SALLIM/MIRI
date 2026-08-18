import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLightQuestionsQuery, useMyInputQuery } from "@/entities/session";
import { apiClient, parseApiError } from "@/shared/api";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Progress } from "@/shared/ui/progress";

interface LightDiagnosisFlowProps {
  sessionId: string;
}

export function LightDiagnosisFlow({ sessionId }: LightDiagnosisFlowProps) {
  const { data: questionSet, isLoading: isQuestionsLoading } = useLightQuestionsQuery("light-v1");
  const { data: savedInput, isLoading: isInputLoading } = useMyInputQuery(sessionId);

  if (isQuestionsLoading || isInputLoading || !questionSet) {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 text-center animate-fadeup">
        <p className="text-sm font-medium text-ink-muted">진단 질문을 불러오고 있습니다...</p>
      </div>
    );
  }

  const initialAnswers =
    savedInput?.answers && savedInput.answers.length > 0
      ? savedInput.answers
      : [null, null, null, null, null];
  const initialGuesses =
    savedInput?.guesses && savedInput.guesses.length > 0
      ? savedInput.guesses
      : [null, null, null, null, null];

  return (
    <LightDiagnosisForm
      key={sessionId}
      sessionId={sessionId}
      questionSet={questionSet}
      initialAnswers={initialAnswers}
      initialGuesses={initialGuesses}
    />
  );
}

interface LightDiagnosisFormProps {
  sessionId: string;
  questionSet: NonNullable<ReturnType<typeof useLightQuestionsQuery>["data"]>;
  initialAnswers: (0 | 1 | 2 | 3 | null)[];
  initialGuesses: (0 | 1 | 2 | 3 | null)[];
}

function LightDiagnosisForm({
  sessionId,
  questionSet,
  initialAnswers,
  initialGuesses,
}: LightDiagnosisFormProps) {
  const navigate = useNavigate();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<(0 | 1 | 2 | 3 | null)[]>(initialAnswers);
  const [guesses, setGuesses] = useState<(0 | 1 | 2 | 3 | null)[]>(initialGuesses);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const questions = questionSet.questions ?? [];
  const currentQuestion = questions[currentIndex];
  const totalQuestions = questions.length || 5;

  // 실시간 임시 저장 (PATCH)
  const saveProgress = async (
    nextAnswers: (0 | 1 | 2 | 3 | null)[],
    nextGuesses: (0 | 1 | 2 | 3 | null)[]
  ) => {
    try {
      await apiClient.PATCH("/api/v1/sessions/{session_id}/me/input", {
        params: { path: { session_id: sessionId } },
        body: {
          answers: nextAnswers,
          guesses: nextGuesses,
        },
      });
    } catch {
      // 자동 저장은 백그라운드에서 조용히 실패 허용
    }
  };

  const handleSelectAnswer = (optionIndex: 0 | 1 | 2 | 3) => {
    const updated = [...answers];
    updated[currentIndex] = optionIndex;
    setAnswers(updated);
    void saveProgress(updated, guesses);
  };

  const handleSelectGuess = (optionIndex: 0 | 1 | 2 | 3) => {
    const updated = [...guesses];
    updated[currentIndex] = optionIndex;
    setGuesses(updated);
    void saveProgress(answers, updated);
  };

  const isCurrentQuestionAnswered =
    answers[currentIndex] !== null && guesses[currentIndex] !== null;

  const isAllAnswered =
    answers.length === totalQuestions &&
    guesses.length === totalQuestions &&
    answers.every((a) => a !== null) &&
    guesses.every((g) => g !== null);

  const handleSubmit = async () => {
    if (!isAllAnswered) {
      setErrorMessage("모든 문항의 본인 답변과 상대방 예측을 완료해 주세요.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const { data, error, response } = await apiClient.POST(
        "/api/v1/sessions/{session_id}/me/submit",
        {
          params: { path: { session_id: sessionId } },
        }
      );

      if (error || !data) {
        throw parseApiError(error, response.status);
      }

      navigate(`/waiting/${sessionId}`);
    } catch (err) {
      const parsed = parseApiError(err);
      setErrorMessage(parsed.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!currentQuestion) {
    return null;
  }

  const options = currentQuestion.options ?? [];

  return (
    <div className="space-y-6">
      {/* 진행 상황 프로그레스 */}
      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <Badge tone="green">3분 라이트 진단</Badge>
          <span className="text-xs font-bold text-ink">
            {currentIndex + 1} / {totalQuestions} 문항
          </span>
        </div>
        <Progress label="진단 진행률" value={currentIndex + 1} max={totalQuestions} />
      </div>

      {/* 질문 카드 */}
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8 animate-fadeup">
        <div className="flex items-center gap-2">
          <span className="rounded-md bg-green-tint px-2.5 py-1 text-xs font-bold text-green-strong">
            {currentQuestion.category}
          </span>
          <span className="text-xs text-ink-muted">Q{currentIndex + 1}</span>
        </div>

        <h2 className="mt-4 text-xl font-extrabold tracking-tight text-ink sm:text-2xl">
          {currentQuestion.text}
        </h2>
        {currentQuestion.subText && (
          <p className="mt-2 text-sm text-ink-muted leading-relaxed">
            {currentQuestion.subText}
          </p>
        )}

        {/* 1. 본인 답변 선택 영역 */}
        <div className="mt-8 space-y-3">
          <p className="text-sm font-bold text-ink flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-green" />
            나는 어떻게 생각하나요?
          </p>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {options.map((opt, idx) => {
              const optIndex = idx as 0 | 1 | 2 | 3;
              const isSelected = answers[currentIndex] === optIndex;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleSelectAnswer(optIndex)}
                  className={`flex flex-col items-start rounded-xl border p-4 text-left transition-all ${
                    isSelected
                      ? "border-green bg-green-tint/40 shadow-sm ring-2 ring-green/20"
                      : "border-border bg-canvas hover:border-ink-muted/30"
                  }`}
                >
                  <span
                    className={`text-sm font-bold ${
                      isSelected ? "text-green-strong" : "text-ink"
                    }`}
                  >
                    {opt.label}
                  </span>
                  {opt.description && (
                    <span className="mt-1 text-xs text-ink-muted leading-snug">
                      {opt.description}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* 2. 상대방 예측 선택 영역 (보라색 강조) */}
        <div className="mt-8 rounded-2xl bg-purple-tint/50 border border-purple-strong/10 p-5 sm:p-6">
          <p className="text-sm font-bold text-purple-strong flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-purple-strong" />
            상대방은 어떻게 답할까요? (예측)
          </p>
          <p className="mt-1 text-xs text-ink-muted">
            상대의 답변을 맞히면 최종 결과에서 텔레파시 적중 카드를 획득해요!
          </p>

          <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
            {options.map((opt, idx) => {
              const optIndex = idx as 0 | 1 | 2 | 3;
              const isSelected = guesses[currentIndex] === optIndex;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleSelectGuess(optIndex)}
                  className={`flex flex-col items-start rounded-xl border p-3.5 text-left transition-all ${
                    isSelected
                      ? "border-purple-strong bg-card shadow-sm ring-2 ring-purple-strong/20"
                      : "border-purple-strong/15 bg-card/70 hover:border-purple-strong/40"
                  }`}
                >
                  <span
                    className={`text-sm font-bold ${
                      isSelected ? "text-purple-strong" : "text-ink"
                    }`}
                  >
                    {opt.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {errorMessage && (
          <p className="mt-6 text-xs font-medium text-red-500 animate-fadeup">{errorMessage}</p>
        )}

        {/* 네비게이션 버튼 */}
        <div className="mt-8 flex items-center justify-between gap-3 border-t border-border pt-6">
          <Button
            type="button"
            variant="secondary"
            onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
            disabled={currentIndex === 0}
          >
            이전 문항
          </Button>

          {currentIndex < totalQuestions - 1 ? (
            <Button
              type="button"
              onClick={() => setCurrentIndex((prev) => Math.min(totalQuestions - 1, prev + 1))}
              disabled={!isCurrentQuestionAnswered}
            >
              다음 문항
            </Button>
          ) : (
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={!isAllAnswered || isSubmitting}
            >
              {isSubmitting ? "제출하는 중..." : "답변 최종 제출"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
