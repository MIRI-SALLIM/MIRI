import type { DeepInputBlockingIssue, DeepInputSyncState } from "@/features/save-deep-input";

const cardClassName = "rounded-card border border-border bg-card p-6 sm:p-8";
const genericBlockingIssueMessage = "입력 내용을 확인해야 해요. 표시된 항목을 다시 확인해 주세요.";

const blockingIssueMessages: Record<string, string> = {
  AMOUNT_STATUS_MISMATCH: "금액 상태와 실제 입력값을 다시 확인해 주세요.",
  DUPLICATE_CONSTRAINT: "조건이 중복되어 있어요. 중복된 조건을 하나만 남겨 주세요.",
  DUPLICATE_FUNDING_ID: "자금 항목이 중복되어 있어요. 중복된 항목을 하나만 남겨 주세요.",
  DUPLICATE_IMPORTANT_AREA: "중요한 영역이 중복되어 있어요. 중복된 영역을 하나만 남겨 주세요.",
  DUPLICATE_ITEM_ID: "자산·부채 항목이 중복되어 있어요. 중복된 항목을 하나만 남겨 주세요.",
  DUPLICATE_SETTLEMENT_SOURCE: "정산 자금 항목이 중복되어 있어요. 중복된 항목을 하나만 남겨 주세요.",
  DUPLICATE_SKIPPED_QUESTION: "건너뛴 문항이 중복되어 있어요. 중복된 문항을 하나만 남겨 주세요.",
  EXTERNAL_SOURCE_DUPLICATES_ASSET: "같은 자산을 여러 자금 항목에서 가리키고 있어요. 입력을 다시 확인해 주세요.",
  FUNDING_ITEMS_REQUIRE_KNOWN_COLLECTION: "자금 항목을 입력하려면 먼저 자금 상태를 알려 주세요.",
  ITEMS_REQUIRE_KNOWN_COLLECTION: "자산·부채 항목을 입력하려면 먼저 해당 상태를 알려 주세요.",
  SKIPPED_QUESTION_HAS_ANSWER: "건너뛴 문항에 답변이 남아 있어요. 답변을 지우거나 문항을 다시 선택해 주세요.",
  UNKNOWN_CONTEXT_KEY: "메모 내용을 확인해 주세요.",
  UNKNOWN_EXPENSE_CATEGORY: "알 수 없는 지출 항목이 있어요. 지출 항목을 다시 확인해 주세요.",
  UNKNOWN_FUNDING_REFERENCE: "자금 항목이 가리키는 대상을 찾을 수 없어요. 입력을 다시 확인해 주세요.",
  UNKNOWN_POST_SETTLEMENT_DEBT: "정산 후 부채 항목을 확인해 주세요.",
};

const blockingIssueMessage = (code: string): string => blockingIssueMessages[code] ?? genericBlockingIssueMessage;

export interface DeepInputSyncNoticeProps {
  blockingIssues: ReadonlyArray<Pick<DeepInputBlockingIssue, "code" | "path">>;
  syncState: DeepInputSyncState;
}

export function DeepInputSyncNotice({ blockingIssues, syncState }: DeepInputSyncNoticeProps) {
  if (blockingIssues.length > 0) {
    return (
      <div className={`${cardClassName} border-amber-300 bg-amber-50`} role="alert">
        <p className="font-bold">저장 전에 확인이 필요한 항목이 있어요.</p>
        <p className="mt-2 text-sm leading-relaxed text-ink">표시된 항목을 확인하면 저장을 다시 시도해요.</p>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-ink">
          {blockingIssues.map((issue, index) => <li key={index}>{blockingIssueMessage(issue.code)}</li>)}
        </ul>
      </div>
    );
  }

  if (syncState === "saving") return <p aria-live="polite" className="text-sm font-semibold text-purple-strong" role="status">입력을 저장하고 있어요.</p>;
  if (syncState === "retrying" || syncState === "conflict") return <p aria-live="polite" className="text-sm font-semibold text-amber-700" role="status">최신 입력을 확인하고 변경 내용을 합치는 중이에요.</p>;
  if (syncState === "locked") return <p aria-live="polite" className="text-sm font-semibold text-ink-muted" role="status">한쪽이 제출해 입력이 잠겼어요. 현재 입력을 읽기 전용으로 보여 드려요.</p>;
  if (syncState === "rejected") return <p aria-live="polite" className="text-sm font-semibold text-red-700" role="alert">입력을 저장하지 못했어요. 잠시 후 값을 확인하고 다시 시도해 주세요.</p>;
  return <p aria-live="polite" className="text-sm text-ink-muted" role="status">입력은 잠시 멈추면 자동으로 저장돼요.</p>;
}
