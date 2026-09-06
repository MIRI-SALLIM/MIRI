import { Button } from "@/shared/ui/button";
import { Badge } from "@/shared/ui/badge";
import {
  deepAgreementOwnerLabels,
  deepAgreementStatusLabels,
  deepAgreementTopicLabels,
  deepCommonCategoryLabels,
} from "@/entities/deep-question";
import type { DeepAgreement } from "@/entities/deep-agreement";

export interface AgreementCardProps {
  agreement: DeepAgreement;
  isActionPending?: boolean;
  onConfirm: () => void;
  onDefer: () => void;
  onEdit: () => void;
}

export function AgreementCard({ agreement, isActionPending = false, onConfirm, onDefer, onEdit }: AgreementCardProps) {
  const topicLabel = deepAgreementTopicLabels[agreement.terms.topic] ?? "기타";
  const ownerLabel = deepAgreementOwnerLabels[agreement.terms.owner] ?? "둘 다";
  const scopeItems = (agreement.terms.commonScope ?? [])
    .map((category) => deepCommonCategoryLabels[category] ?? "기타");
  const statusLabel = deepAgreementStatusLabels[agreement.status] ?? "기준 상태 확인 필요";

  return (
    <article className="space-y-5 rounded-card border border-border bg-card p-5 sm:p-6" aria-labelledby={`agreement-heading-${agreement.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <p className="text-sm font-semibold text-purple-strong">{topicLabel}</p>
          <h2 className="text-xl font-extrabold" id={`agreement-heading-${agreement.id}`}>{agreement.text}</h2>
        </div>
        <Badge tone={agreement.status === "agreed" ? "green" : "purple"}>{statusLabel}</Badge>
      </div>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div><dt className="text-ink-muted">정한 범위</dt><dd className="mt-1 font-semibold">{agreement.terms.scope}</dd></div>
        <div><dt className="text-ink-muted">담당</dt><dd className="mt-1 font-semibold">{ownerLabel}</dd></div>
        <div><dt className="text-ink-muted">시작월</dt><dd className="mt-1 font-semibold">{agreement.terms.startMonth}</dd></div>
        <div><dt className="text-ink-muted">납부일</dt><dd className="mt-1 font-semibold">{agreement.terms.dueDay === null || agreement.terms.dueDay === undefined ? "없음" : `매월 ${agreement.terms.dueDay}일`}</dd></div>
        {agreement.terms.topic === "monthlyContribution" ? (
          <div className="sm:col-span-2">
            <dt className="text-ink-muted">각자 월 분담액</dt>
            <dd className="mt-1 font-semibold">A {agreement.terms.monthlyContributions?.A?.toLocaleString("ko-KR") ?? "확인 필요"}원 · B {agreement.terms.monthlyContributions?.B?.toLocaleString("ko-KR") ?? "확인 필요"}원</dd>
          </div>
        ) : null}
        {scopeItems.length > 0 ? <div className="sm:col-span-2"><dt className="text-ink-muted">공동비 포함 항목</dt><dd className="mt-1 font-semibold">{scopeItems.join(" · ")}</dd></div> : null}
        <div className="sm:col-span-2"><dt className="text-ink-muted">예외</dt><dd className="mt-1 whitespace-pre-wrap font-semibold">{agreement.terms.exceptions || "없음"}</dd></div>
        <div><dt className="text-ink-muted">다시 볼 날짜</dt><dd className="mt-1 font-semibold">{agreement.reviewOn ?? "없음"}</dd></div>
        <div><dt className="text-ink-muted">기준 버전</dt><dd className="mt-1 font-semibold">{agreement.version}</dd></div>
      </dl>
      <div className="space-y-2 border-t border-border-soft pt-4 text-sm">
        <p className="font-semibold">내 확인: {agreement.myConfirmed ? "확인했어요." : "아직 확인하지 않았어요."}</p>
        <p className="font-semibold">상대 확인: {agreement.partnerConfirmed ? "확인했어요." : "아직 확인하지 않았어요."}</p>
      </div>
      <div className="flex flex-wrap gap-3 border-t border-border-soft pt-4">
        <Button disabled={isActionPending} onClick={onEdit} variant="secondary">기준 수정하기</Button>
        {!agreement.myConfirmed ? <Button disabled={isActionPending} onClick={onConfirm}>이 기준 확인하기</Button> : null}
        {agreement.status !== "deferred" ? <Button disabled={isActionPending} onClick={onDefer} variant="ghost">이 기준 보류하기</Button> : null}
      </div>
    </article>
  );
}
