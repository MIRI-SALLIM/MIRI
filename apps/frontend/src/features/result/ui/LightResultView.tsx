import { useNavigate } from "react-router-dom";
import {
  type LightComparisonResultData,
  type QuestionComparisonItem,
  useSessionResultQuery,
} from "@/entities/session";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";

interface LightResultViewProps {
  sessionId: string;
}

export function LightResultView({ sessionId }: LightResultViewProps) {
  const navigate = useNavigate();
  const { data: resultResponse, isLoading, error } = useSessionResultQuery(sessionId);

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-border bg-card p-12 text-center animate-fadeup">
        <div className="mx-auto size-12 rounded-full border-4 border-green border-t-transparent animate-spin mb-4" />
        <h2 className="text-xl font-bold text-ink">결과를 계산하고 있습니다</h2>
        <p className="mt-2 text-sm text-ink-muted">두 분의 생각을 맞춰보는 중이에요...</p>
      </div>
    );
  }

  if (error || !resultResponse) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50/50 p-8 text-center animate-fadeup">
        <h2 className="text-xl font-bold text-ink">결과를 불러올 수 없습니다</h2>
        <p className="mt-2 text-sm text-ink-muted">잠시 후 다시 시도해 주세요.</p>
        <Button variant="secondary" className="mt-6" onClick={() => navigate("/")}>
          홈으로 이동
        </Button>
      </div>
    );
  }

  if (resultResponse.status === "waiting") {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 text-center animate-fadeup">
        <Badge tone="purple">대기 중</Badge>
        <h2 className="mt-4 text-xl font-bold text-ink">상대방의 제출을 기다리고 있습니다</h2>
        <Button className="mt-6" onClick={() => navigate(`/waiting/${sessionId}`)}>
          대기 화면으로 돌아가기
        </Button>
      </div>
    );
  }

  const result: LightComparisonResultData = resultResponse.result;
  const { myType, partnerType, discussionTopics = [], questions = [], mutualHitCount, tagline } = result;

  return (
    <div className="space-y-8 animate-fadeup">
      {/* 1. 상단 히어로: 텔레파시 적중 및 태그라인 */}
      <div className="relative overflow-hidden rounded-3xl border border-border bg-card p-6 text-center shadow-sm sm:p-10">
        <div aria-hidden="true" className="absolute -inset-10 -z-10 rounded-full bg-green-tint/60 blur-3xl" />
        <Badge tone="green">3분 진단 결과</Badge>

        <h1 className="mt-4 text-3xl font-black tracking-tight text-ink sm:text-4xl">
          {tagline}
        </h1>

        <div className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-purple-tint/70 border border-purple-strong/15 px-5 py-3">
          <span className="text-lg">🎯</span>
          <span className="text-sm font-extrabold text-purple-strong">
            상호 예측 텔레파시 적중: {mutualHitCount}개 문항 일치!
          </span>
        </div>
      </div>

      {/* 2. 4대 성향 비교 카드 */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* 내 성향 */}
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-7">
          <div className="flex items-center justify-between">
            <span className="rounded-lg bg-green-tint px-2.5 py-1 text-xs font-bold text-green-strong">
              나의 재무 성향
            </span>
            <span className="text-xs font-medium text-ink-muted">{myType.timeLabel}</span>
          </div>
          <h2 className="mt-4 text-2xl font-black text-ink">{myType.typeName}</h2>
          <p className="mt-2 text-sm text-ink-muted leading-relaxed">
            {myType.typeDescription}
          </p>

          <div className="mt-6 space-y-2.5 rounded-xl bg-canvas p-4 text-xs">
            <div className="flex justify-between">
              <span className="text-ink-muted">소비 관점</span>
              <span className="font-bold text-ink">{myType.timeLabel}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-muted">통장 관리</span>
              <span className="font-bold text-ink">{myType.mgmtLabel}</span>
            </div>
          </div>
        </div>

        {/* 상대방 성향 */}
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-7">
          <div className="flex items-center justify-between">
            <span className="rounded-lg bg-purple-tint px-2.5 py-1 text-xs font-bold text-purple-strong">
              상대방의 재무 성향
            </span>
            <span className="text-xs font-medium text-ink-muted">{partnerType.timeLabel}</span>
          </div>
          <h2 className="mt-4 text-2xl font-black text-ink">{partnerType.typeName}</h2>
          <p className="mt-2 text-sm text-ink-muted leading-relaxed">
            {partnerType.typeDescription}
          </p>

          <div className="mt-6 space-y-2.5 rounded-xl bg-canvas p-4 text-xs">
            <div className="flex justify-between">
              <span className="text-ink-muted">소비 관점</span>
              <span className="font-bold text-ink">{partnerType.timeLabel}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-muted">통장 관리</span>
              <span className="font-bold text-ink">{partnerType.mgmtLabel}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. 가치관 문항별 상세 비교 */}
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
        <h2 className="text-xl font-extrabold tracking-tight text-ink">
          서로의 생각 맞춰보기
        </h2>
        <p className="mt-1 text-xs text-ink-muted">
          두 분이 직접 선택한 답변과 서로에 대한 예측 결과를 비교해 보세요.
        </p>

        <div className="mt-6 space-y-4">
          {questions.map((q: QuestionComparisonItem) => (
            <div
              key={q.questionId}
              className="rounded-xl border border-border bg-canvas p-5 transition-all"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-bold text-ink">{q.questionText}</span>
                <div className="flex items-center gap-1.5">
                  {q.isMatch && (
                    <span className="rounded-md bg-green-tint px-2 py-0.5 text-xs font-bold text-green-strong">
                      생각 일치 ✨
                    </span>
                  )}
                  {q.isHit && (
                    <span className="rounded-md bg-purple-tint px-2 py-0.5 text-xs font-bold text-purple-strong">
                      내 예측 적중 🎯
                    </span>
                  )}
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 text-xs">
                <div className="rounded-lg bg-card border border-border p-3">
                  <span className="text-ink-muted block mb-1">내 답변</span>
                  <span className="font-bold text-ink text-sm">
                    {q.myAnswerLabel ?? "미선택"}
                  </span>
                </div>
                <div className="rounded-lg bg-card border border-border p-3">
                  <span className="text-ink-muted block mb-1">상대방 답변</span>
                  <span className="font-bold text-ink text-sm">
                    {q.partnerAnswerLabel ?? "미선택"}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 4. 우리 부부를 위한 추천 대화 주제 */}
      <div className="rounded-2xl border border-green/30 bg-green-tint/30 p-6 sm:p-8">
        <div className="flex items-center gap-2">
          <span className="text-xl">💬</span>
          <h2 className="text-xl font-extrabold text-ink">오늘 밤 함께 나눌 이야기</h2>
        </div>
        <p className="mt-1 text-xs text-ink-muted">
          두 분의 성향 궁합을 바탕으로 추천하는 실천 대화 주제입니다.
        </p>

        <ul className="mt-5 space-y-3">
          {discussionTopics.map((topic: string, idx: number) => (
            <li
              key={idx}
              className="flex items-start gap-3 rounded-xl bg-card border border-border/80 p-4 shadow-2xs"
            >
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-green text-xs font-bold text-white">
                {idx + 1}
              </span>
              <p className="text-sm font-medium text-ink leading-relaxed pt-0.5">
                {topic}
              </p>
            </li>
          ))}
        </ul>

        {/* 맞춤 실천 조언 */}
        {myType.recommendation && (
          <div className="mt-6 rounded-xl bg-card border border-border p-4 text-xs leading-relaxed text-ink-muted">
            <span className="font-bold text-ink block mb-1">💡 실천 가이드</span>
            {myType.recommendation}
          </div>
        )}
      </div>

      {/* 하단 홈 이동 버튼 */}
      <div className="text-center pt-4">
        <Button variant="secondary" onClick={() => navigate("/")}>
          처음 화면으로 돌아가기
        </Button>
      </div>
    </div>
  );
}
