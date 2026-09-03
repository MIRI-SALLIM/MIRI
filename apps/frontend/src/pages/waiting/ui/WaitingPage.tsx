import { useParams } from "react-router-dom";

import { WaitingStatus } from "@/widgets/waiting-status";

export function WaitingPage() {
  const { sessionId = "" } = useParams();

  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 py-16 sm:px-8">
      <div className="flex flex-col gap-3">
        <h1 className="text-2xl font-extrabold tracking-[-0.02em] text-ink">
          상대방을 기다리는 중
        </h1>
        <p className="text-base leading-relaxed text-ink-muted">
          내 입력은 제출되어 이제 수정할 수 없어요. 상대가 답하는 동안에는 아무것도 보이지 않아요. 둘 다 끝나야 결과가 동시에 열려요.
        </p>
        <p className="text-sm leading-relaxed text-ink-subtle">이 세션은 7일 후 자동으로 삭제돼요.</p>
      </div>

      {sessionId === "" ? null : <WaitingStatus sessionId={sessionId} />}
    </section>
  );
}
