import { Badge } from "@/shared/ui/badge";

const lightSections = [
  ["서로 맞힌 답", "서로를 얼마나 이해했는지 점수로 보여줘요."],
  ["두 사람의 유형", "나의 유형과 파트너 유형을 함께 살펴봐요."],
  ["서로의 답을 비교해봐요", "공개하기로 약속한 질문의 답과 내 예측을 비교해봐요."],
  ["오늘 이야기해보면 좋은 주제", "서로의 차이를 알아가는 대화의 출발점을 확인해요."],
] as const;

const deepSections = [
  ["월 현금흐름", "계산 가능한 월 현금흐름을 확인해요."],
  ["주거", "주거와 관련해 확인할 내용을 살펴봐요."],
  ["목표", "목표에 필요한 내용을 확인해요."],
  ["계획", "입력한 계획을 바탕으로 계산해요."],
  ["가치관", "공유하기로 한 가치관 정보를 확인해요."],
] as const;

export function SampleReportPage() {
  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-12 px-5 py-14 sm:px-8 sm:py-20 [line-height:normal]">
      <div className="max-w-2xl space-y-4">
        <p className="text-sm font-semibold text-purple-strong">두 가지 모드의 결과 화면</p>
        <h1 className="text-3xl font-extrabold tracking-[-0.03em] text-ink sm:text-4xl">샘플 리포트</h1>
        <p className="text-base leading-relaxed text-ink-muted">
          라이트와 딥 모드가 각각 어떤 내용을 보여주는지 실제 결과 화면의 구성으로 살펴보세요.
        </p>
      </div>

      <section aria-labelledby="light-report-heading" className="space-y-5">
        <div className="space-y-3">
          <Badge className="self-start" tone="green">3분 모드 · 함께 공개</Badge>
          <h2 className="text-2xl font-extrabold tracking-[-0.02em] text-ink" id="light-report-heading">라이트 결과</h2>
          <p className="text-sm leading-relaxed text-ink-muted">
            서로의 답을 바탕으로 이해한 정도와 각자의 유형을 확인하고, 다음 대화 주제를 찾아요.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {lightSections.map(([title, description]) => (
            <article className="rounded-card border border-border bg-card p-5" key={title}>
              <h3 className="font-bold text-ink">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-muted">{description}</p>
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="deep-report-heading" className="space-y-5">
        <div className="space-y-3">
          <p className="text-sm font-semibold text-purple-strong">15분 모드 · 공동 결과</p>
          <h2 className="text-2xl font-extrabold tracking-[-0.02em] text-ink" id="deep-report-heading">공동 리포트</h2>
          <p className="text-sm leading-relaxed text-ink-muted">
            두 분이 제출한 정보를 바탕으로 만든 공동 계산이에요. 공유하지 않은 범위는 오류가 아니라 선택한 결과로 표시돼요.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {deepSections.map(([title, description]) => (
            <article className="rounded-card border border-border bg-card p-5" key={title}>
              <h3 className="font-bold text-ink">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-muted">{description}</p>
            </article>
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <article className="rounded-card border border-border bg-card p-5">
            <h3 className="font-bold text-ink">다음에 함께 이야기할 질문</h3>
            <p className="mt-2 text-sm leading-relaxed text-ink-muted">
              리포트가 확인한 내용을 바탕으로 대화를 시작해 보세요.
            </p>
          </article>
          <article className="rounded-card border border-border bg-card p-5">
            <h3 className="font-bold text-ink">리포트의 한계</h3>
            <p className="mt-2 text-sm leading-relaxed text-ink-muted">
              계산은 정해진 템플릿을 바탕으로 제공돼요. 현재 합의가 아닌 제출한 의향을 기준으로 계산해요.
            </p>
          </article>
        </div>
      </section>
    </section>
  );
}
