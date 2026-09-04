export interface ResultTopicsProps {
  topics?: string[];
}

export function ResultTopics({ topics = [] }: ResultTopicsProps) {
  return (
    <section aria-labelledby="result-topics-heading" className="flex flex-col gap-4">
      <div>
        <h2 className="text-xl font-extrabold tracking-[-0.02em] text-ink" id="result-topics-heading">
          오늘 이야기해보면 좋은 주제
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          서로의 차이를 알아가는 대화의 출발점으로 사용해보세요.
        </p>
      </div>

      {topics.length > 0 ? (
        <ol className="flex flex-col gap-3" aria-label="대화 주제 목록">
          {topics.map((topic, index) => (
            <li className="flex gap-4 rounded-card border border-border bg-card p-5" key={`${topic}-${index}`}>
              <span
                aria-hidden="true"
                className="flex size-8 shrink-0 items-center justify-center rounded-full bg-green-tint text-sm font-extrabold text-green-strong"
              >
                {index + 1}
              </span>
              <p className="text-sm leading-relaxed text-ink">{topic}</p>
            </li>
          ))}
        </ol>
      ) : (
        <p className="rounded-card border border-border bg-card p-5 text-sm text-ink-muted">
          오늘은 서로의 생각을 편하게 들어보세요.
        </p>
      )}
    </section>
  );
}
