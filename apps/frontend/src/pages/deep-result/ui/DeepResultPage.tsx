import { Link, useParams } from "react-router-dom";

import {
  useDeepSessionResult,
} from "@/features/poll-deep-status";
import { Button } from "@/shared/ui/button";
import type { DeepCalculationBlock, DeepReportRecord, DeepReadyResult } from "@/entities/deep-report";

const cardClassName = "rounded-card border border-border bg-card p-6 sm:p-8";

const blockLabels = [
  ["cashflow", "월 현금흐름"],
  ["housing", "주거"],
  ["goal", "목표"],
  ["planning", "계획"],
  ["values", "가치관"],
] as const;

const knownIssueQuestions: Record<string, string> = {
  CASHFLOW_UNCERTAIN: "각자 확인할 수 있는 수치와 상환 후 월 납입액을 보완할까요?",
  FUNDING_GAP: "추가 재원을 확인할까요, 필요한 금액이나 지급일을 조정할까요?",
  GAP_UNAVAILABLE: "납부·상환 금액과 날짜부터 확인해 주세요.",
  GOAL_SAVING_GAP: "목표 금액·기한·월 지출 중 어느 것을 조정할까요?",
  GOAL_UNCERTAIN: "목표 금액과 기한을 유지할지, 먼저 확인할 수치를 정할까요?",
  HOUSING_UNCERTAIN: "납부할 금액·날짜와 각자의 재원 입력을 확인해 주세요.",
  INCOMPLETE_FUNDING: "본인의 입력에서 금액·날짜·재원 상태를 확인할 수 있나요?",
  MONTHLY_DEFICIT: "어떤 지출이나 주거 계획을 조정할까요?",
};

const knownLimitationMessages: Record<string, (value: string) => string> = {
  explanation: () => "계산은 정해진 템플릿을 바탕으로 제공돼요.",
  policyMatching: () => "정책·상품 조건과의 일치 여부는 확인하지 않아요.",
  agreementBasis: () => "현재 합의가 아닌 제출한 의향을 기준으로 계산해요.",
  notice: (value) => value,
};

const statusLabel = (block: DeepCalculationBlock): string => {
  if (block.status === "available") return "계산 가능";
  if (block.status === "partial") return "일부 확인 필요";
  if (block.reason === "sharing_not_authorized") return "공유하지 않음";
  return "추가 확인 필요";
};

const limitationMessages = (limitations: Record<string, string>): string[] =>
  Object.entries(limitations).flatMap(([key, value]) => {
    const message = knownLimitationMessages[key];
    return message === undefined ? [] : [message(value)];
  });

const blockMessage = (key: string, block: DeepCalculationBlock): string => {
  if (block.status === "unavailable" && block.reason === "sharing_not_authorized") {
    return key === "values"
      ? "가치관 정보 공유에 동의하면 이 영역을 볼 수 있어요."
      : "재무 정보 공유에 동의하면 이 계산을 볼 수 있어요.";
  }
  if (block.status === "available") return "입력한 정보를 바탕으로 계산했어요.";
  if (block.status === "partial") return "일부 입력이 없어 필요한 내용을 함께 확인해 주세요.";
  return "계산에 필요한 내용을 확인해 주세요.";
};

function CalculationBlockCard({ block, label, name }: { block: DeepCalculationBlock; label: string; name: string }) {
  return (
    <article className={`${cardClassName} space-y-4`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-extrabold">{label}</h2>
        <span className="rounded-full bg-purple-tint px-3 py-1 text-sm font-bold text-purple-strong">{statusLabel(block)}</span>
      </div>
      <p className="text-sm leading-relaxed text-ink-muted">{blockMessage(name, block)}</p>
      {block.missingFields.length > 0 ? <p className="text-sm leading-relaxed text-ink-muted">확인이 필요한 입력이 {block.missingFields.length}개 있어요.</p> : null}
      {block.assumptions.length > 0 ? <p className="text-sm leading-relaxed text-ink-muted">일부 값은 입력한 전제를 바탕으로 계산했어요.</p> : null}
      {block.data !== null && block.status === "available" ? (
        <p className="text-sm font-semibold text-purple-strong">계산 결과를 확인할 수 있어요.</p>
      ) : null}
    </article>
  );
}

function ReportIssues({ issues }: { issues: DeepReportRecord[] }) {
  const cards = issues.flatMap((issue) => {
    const code = typeof issue.code === "string" ? issue.code : null;
    if (code === null || knownIssueQuestions[code] === undefined) return [];
    const question = typeof issue.question === "string" ? issue.question : knownIssueQuestions[code];
    const observation = typeof issue.observation === "string" ? issue.observation : null;
    return [{ observation, question }];
  });

  if (cards.length === 0) return null;

  return (
    <section aria-labelledby="deep-report-issues-heading" className={`${cardClassName} space-y-4`}>
      <div>
        <h2 className="text-xl font-extrabold" id="deep-report-issues-heading">다음에 함께 이야기할 질문</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">리포트가 확인한 내용을 바탕으로 대화를 시작해 보세요.</p>
      </div>
      <div className="space-y-3">
        {cards.map(({ observation, question }, index) => (
          <article className="rounded-card border border-border-soft bg-purple-tint p-4" key={`${question}-${index}`}>
            {observation ? <p className="text-sm leading-relaxed text-ink-muted">{observation}</p> : null}
            <p className="mt-1 font-bold leading-relaxed text-ink">{question}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function ReportContent({ result, sessionId }: { result: DeepReadyResult; sessionId: string }) {
  return (
    <>
      <div className="space-y-3">
        <p className="text-sm font-semibold text-purple-strong">15분 모드 · 공동 결과</p>
        <h1 className="text-3xl font-extrabold tracking-[-0.02em]">공동 리포트</h1>
        <p className="leading-relaxed text-ink-muted">두 분이 제출한 정보를 바탕으로 만든 공동 계산이에요. 공유하지 않은 범위는 오류가 아니라 선택한 결과로 표시돼요.</p>
      </div>
      <div className="grid gap-5">
        {blockLabels.map(([name, label]) => (
          <CalculationBlockCard block={result.report[name]} key={name} label={label} name={name} />
        ))}
      </div>
      <ReportIssues issues={result.report.issues} />
      <section aria-labelledby="deep-report-limitations-heading" className={`${cardClassName} space-y-3`}>
        <h2 className="text-xl font-extrabold" id="deep-report-limitations-heading">리포트의 한계</h2>
        {limitationMessages(result.report.limitations).map((limitation, index) => (
          <p className="text-sm leading-relaxed text-ink-muted" key={`${limitation}-${index}`}>{limitation}</p>
        ))}
      </section>
      <div className="flex flex-wrap gap-4">
        <Link className="font-bold text-purple-strong underline" to={`/deep/questions/${encodeURIComponent(sessionId)}`}>질문 다시 보기</Link>
        <Link className="font-bold text-purple-strong underline" to="/">처음으로 돌아가기</Link>
      </div>
    </>
  );
}

export function DeepResultPage() {
  const { sessionId = "" } = useParams();
  const result = useDeepSessionResult(sessionId);

  if (result.isPending) {
    return (
      <section className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-5 px-5 py-16 sm:px-8">
        <h1 className="text-3xl font-extrabold tracking-[-0.02em]">공동 리포트</h1>
        <p aria-live="polite" className="text-ink-muted" role="status">공동 리포트를 확인하고 있어요.</p>
      </section>
    );
  }

  if (result.isTimedOut) {
    return (
      <section className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-5 px-5 py-16 sm:px-8">
        <h1 className="text-3xl font-extrabold tracking-[-0.02em]">공동 리포트를 준비하고 있어요</h1>
        <div className={cardClassName}>
          <p className="leading-relaxed text-ink-muted">자동 확인을 잠시 멈췄어요. 새로고침하면 상태를 다시 확인해요.</p>
          <Button className="mt-5" onClick={() => void result.refetch()} variant="secondary">다시 확인하기</Button>
        </div>
      </section>
    );
  }

  if (result.isFailed || result.result === null) {
    return (
      <section className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-5 px-5 py-16 sm:px-8">
        <h1 className="text-3xl font-extrabold tracking-[-0.02em]">공동 리포트를 확인할 수 없어요</h1>
        <div className={cardClassName} role="alert">
          <p className="leading-relaxed text-ink-muted">최신 결과를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.</p>
          <Button className="mt-5" onClick={() => void result.refetch()} variant="secondary">다시 확인하기</Button>
        </div>
      </section>
    );
  }

  if (result.result.status === "waiting") {
    return (
      <section className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-6 px-5 py-16 sm:px-8">
        <div className="space-y-3">
          <p className="text-sm font-semibold text-purple-strong">15분 모드 · 공동 결과</p>
          <h1 className="text-3xl font-extrabold tracking-[-0.02em]">공동 리포트를 준비하고 있어요</h1>
          <p className="leading-relaxed text-ink-muted">두 사람이 제출한 뒤 리포트가 발행되면 이 화면에서 함께 확인할 수 있어요.</p>
        </div>
        <div className={cardClassName}>
          <p className="leading-relaxed text-ink-muted">
            {result.result.partnerCompleted ? "상대의 제출 여부를 확인했어요." : "상대의 제출을 기다리고 있어요."}
          </p>
        </div>
        <Link className="w-fit font-bold text-purple-strong underline" to={`/deep/waiting/${encodeURIComponent(sessionId)}`}>세션 상태 보기</Link>
      </section>
    );
  }

  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 py-12 sm:px-8 sm:py-16">
      <ReportContent result={result.result} sessionId={sessionId} />
    </section>
  );
}
