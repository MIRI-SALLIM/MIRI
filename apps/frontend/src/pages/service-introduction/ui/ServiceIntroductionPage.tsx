import { Badge } from "@/shared/ui/badge";

const steps = [
  ["1. 세션 생성", "초대 코드를 만들고 상대에게 공유해요"],
  ["2. 함께 입력", "각자 정보를 입력해요. 상대의 답은 보이지 않아요"],
  ["3. 동시 공개", "둘 다 완료해야 결과를 볼 수 있어요"],
  ["4. 함께 이해", "같은 자료를 보며 대화를 시작해요"],
] as const;

export function ServiceIntroductionPage() {
  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-12 px-5 py-14 sm:px-8 sm:py-20 [line-height:normal]">
      <div className="max-w-2xl space-y-4">
        <p className="text-sm font-semibold text-green-strong">결혼은 나중에, 살림은 미리</p>
        <h1 className="text-3xl font-extrabold tracking-[-0.03em] text-ink sm:text-4xl">서비스 소개</h1>
        <p className="text-base leading-relaxed text-ink-muted">
          두 사람이 함께 살기 전에, 서로의 재무를 알아가는 두 가지 방법을 선택해보세요.
        </p>
      </div>

      <section aria-labelledby="service-modes-heading" className="space-y-5">
        <div>
          <h2 className="text-2xl font-extrabold tracking-[-0.02em] text-ink" id="service-modes-heading">
            두 가지 방법
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">
            지금 알고 싶은 범위에 맞춰 가볍게 시작하거나, 제출한 정보를 바탕으로 공동 계산을 확인해요.
          </p>
        </div>
        <div className="grid gap-5 md:grid-cols-2">
          <article className="rounded-card border border-border bg-card p-6 sm:p-8">
            <Badge tone="green">3분 모드</Badge>
            <h3 className="mt-4 text-xl font-extrabold tracking-[-0.02em] text-green-strong">가볍게 맞춰보기</h3>
            <p className="mt-2 text-sm leading-relaxed text-ink-muted">우리는 서로를 얼마나 알고 있나</p>
            <ul className="mt-6 space-y-3 text-sm leading-relaxed text-ink">
              <li>서로 맞힌 답을 점수로 확인해요.</li>
              <li>두 사람의 재무 유형을 함께 살펴봐요.</li>
              <li>서로의 답과 예측을 비교해봐요.</li>
              <li>오늘 이야기해보면 좋은 주제를 확인해요.</li>
            </ul>
          </article>

          <article className="rounded-card border border-border bg-card p-6 sm:p-8">
            <Badge tone="purple">15분 모드</Badge>
            <h3 className="mt-4 text-xl font-extrabold tracking-[-0.02em] text-purple-strong">제대로 계산해보기</h3>
            <p className="mt-2 text-sm leading-relaxed text-ink-muted">우리 숫자를 합치면 어떻게 되나</p>
            <p className="mt-6 text-sm leading-relaxed text-ink-muted">
              두 분이 제출한 정보를 바탕으로 공동 계산을 만들어요. 공유하지 않은 범위는 오류가 아니라 선택한 결과로 표시돼요.
            </p>
            <p className="mt-4 text-sm font-semibold leading-relaxed text-purple-strong">
              월 현금흐름 · 주거 · 목표 · 계획 · 가치관
            </p>
          </article>
        </div>
      </section>

      <section aria-labelledby="service-steps-heading" className="space-y-5">
        <div>
          <h2 className="text-2xl font-extrabold tracking-[-0.02em] text-ink" id="service-steps-heading">
            이용 방법
          </h2>
        </div>
        <ol className="grid gap-4 sm:grid-cols-2" aria-label="이용 방법">
          {steps.map(([title, description]) => (
            <li className="rounded-card border border-border bg-card p-5" key={title}>
              <p className="font-bold text-ink">{title}</p>
              <p className="mt-2 text-sm leading-relaxed text-ink-muted">{description}</p>
            </li>
          ))}
        </ol>
      </section>
    </section>
  );
}
