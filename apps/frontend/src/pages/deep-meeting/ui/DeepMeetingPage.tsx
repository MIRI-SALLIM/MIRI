import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useParams } from "react-router-dom";

import {
  completeMeeting,
  factValuesForCard,
  fetchMeetingGuide,
  fetchMeetingStandards,
  fetchOwnMeeting,
  meetingExplanationQueryKey,
  meetingGuideQueryKey,
  meetingStandardsQueryKey,
  ownMeetingQueryKey,
  type AvailableExplanation,
  type ExplanationCard,
  type MeetingAnswers,
  type MeetingBrief,
  type MeetingCompletion,
  type MeetingContributionMeaning,
  type MeetingGuideReady,
  type MeetingStandardsReady,
  type OwnMeeting,
} from "@/entities/deep-meeting";
import {
  deepContributionMeaningLabels,
  deepMeetingFactLabels,
  deepMeetingIssueLabels,
} from "@/entities/deep-question";
import { useMeetingContext, useMeetingExplanation } from "@/features/poll-explanation";
import { isApiErrorCode } from "@/shared/api";
import { Button } from "@/shared/ui/button";
import { NavigationLink } from "@/shared/ui/navigation-link";
import { PageLoading } from "@/shared/ui/page-loading";
import { fieldClassName } from "@/shared/ui/field";
import { Skeleton } from "@/shared/ui/skeleton";

const cardClassName = "rounded-card border border-border bg-card p-6 sm:p-8";

const formatWon = (valueWon: number): string => `${new Intl.NumberFormat("ko-KR").format(valueWon)}원`;

const questionById = (own: OwnMeeting, id: "contributionMeaning" | "adjustableMonthlyWon") =>
  own.questions.find((question) => question.id === id);

const completeErrorMessage = (error: unknown): string => {
  if (isApiErrorCode(error, "REVISION_CONFLICT")) return "최신 답변과 달라요. 최신 회의 내용을 확인한 뒤 다시 마무리해 주세요.";
  if (isApiErrorCode(error, "ROUND_VERSION_CONFLICT") || isApiErrorCode(error, "PLAN_VERSION_CONFLICT")) {
    return "공동 계획이 바뀌었어요. 최신 회의 내용을 확인한 뒤 다시 마무리해 주세요.";
  }
  if (isApiErrorCode(error, "AI_REQUIRES_PARTNER_SHARING")) return "상대와 공유할 때만 AI 처리 동의를 선택할 수 있어요.";
  if (isApiErrorCode(error, "ADJUSTMENT_REQUIRES_INITIAL_PROPOSAL")) return "처음 제안한 금액을 기준으로 할 때만 조정 가능 금액을 입력할 수 있어요.";
  if (isApiErrorCode(error, "MEETING_REPORT_NOT_READY")) return "공동 리포트가 준비된 뒤 기준회의를 시작할 수 있어요.";
  return "기준회의를 마무리하지 못했어요. 최신 내용을 확인한 뒤 다시 시도해 주세요.";
};

function MeetingQuestionsForm({
  disabled,
  onSubmit,
  own,
}: {
  disabled: boolean;
  onSubmit: (answers: MeetingAnswers, shareWithPartner: boolean, allowAiProcessing: boolean) => void;
  own: OwnMeeting;
}) {
  const [draft, setDraft] = useState(() => ({
    contributionMeaning: own.answers?.contributionMeaning ?? null as MeetingContributionMeaning | null,
    adjustableMonthlyWon: own.answers?.adjustableMonthlyWon ?? null,
    adjustableText: own.answers?.adjustableMonthlyWon === null || own.answers?.adjustableMonthlyWon === undefined
      ? ""
      : String(own.answers.adjustableMonthlyWon),
  }));
  const [consent, setConsent] = useState(() => ({
    shareWithPartner: own.consent?.shareWithPartner ?? false,
    allowAiProcessing: own.consent?.shareWithPartner === true && own.consent.allowAiProcessing === true,
  }));
  const meaningQuestion = questionById(own, "contributionMeaning");
  const adjustableQuestion = questionById(own, "adjustableMonthlyWon");
  const canComplete = draft.contributionMeaning !== null;
  const optionEntries = Object.entries(meaningQuestion?.options ?? {}).filter(([, label]) => label.trim() !== "");
  const options = optionEntries.length > 0
    ? optionEntries
    : Object.entries(deepContributionMeaningLabels);

  const updateMeaning = (value: MeetingContributionMeaning) => {
    setDraft((current) => value === "initialProposal"
      ? { ...current, contributionMeaning: value }
      : { ...current, contributionMeaning: value, adjustableMonthlyWon: null, adjustableText: "" });
  };

  const updateAdjustableAmount = (value: string) => {
    const digits = value.replace(/[^0-9]/g, "");
    setDraft((current) => ({
      ...current,
      adjustableMonthlyWon: digits === "" ? null : Number(digits),
      adjustableText: digits,
    }));
  };

  const toggleSharing = () => {
    setConsent((current) => current.shareWithPartner
      ? { shareWithPartner: false, allowAiProcessing: false }
      : { ...current, shareWithPartner: true });
  };

  const submit = () => {
    if (!canComplete || draft.contributionMeaning === null) return;
    onSubmit(
      {
        contributionMeaning: draft.contributionMeaning,
        adjustableMonthlyWon: draft.contributionMeaning === "initialProposal" ? draft.adjustableMonthlyWon : null,
      },
      consent.shareWithPartner,
      consent.allowAiProcessing,
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <section className={`${cardClassName} space-y-5`} aria-labelledby="meeting-questions-heading">
        <div className="space-y-2">
          <h2 className="text-xl font-extrabold" id="meeting-questions-heading">두 가지 확인 질문</h2>
          <p className="text-sm leading-relaxed text-ink-muted">서버가 보내 준 질문과 선택지만 보여 드려요.</p>
        </div>
        <fieldset className="space-y-4">
          <legend className="text-lg font-extrabold">{meaningQuestion?.text ?? ""}</legend>
          <p className="text-sm leading-relaxed text-ink-muted">{meaningQuestion?.helpText ?? ""}</p>
          <div className="space-y-3">
            {options.map(([value, label]) => {
              const meaning = value as MeetingContributionMeaning;
              const fallbackLabel = deepContributionMeaningLabels[meaning];
              if (fallbackLabel === undefined) return null;
              const visibleLabel = label || fallbackLabel;
              return (
                <label className="flex items-start gap-3 rounded-control border border-border-soft p-3 text-sm leading-relaxed" key={value}>
                  <input
                    checked={draft.contributionMeaning === meaning}
                    className="mt-1 size-4 accent-purple-strong"
                    disabled={disabled}
                    name="meeting-contribution-meaning"
                    onChange={() => updateMeaning(meaning)}
                    type="radio"
                    value={value}
                  />
                  <span>{visibleLabel}</span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <label className="space-y-2 text-sm font-semibold" htmlFor="meeting-adjustable-monthly-won">
          <span className="block">{adjustableQuestion?.text ?? ""}</span>
          <input
            aria-label={adjustableQuestion?.text}
            aria-describedby="meeting-adjustable-monthly-help"
            className={fieldClassName}
            disabled={disabled || draft.contributionMeaning !== "initialProposal"}
            id="meeting-adjustable-monthly-won"
            inputMode="numeric"
            min="0"
            onChange={(event) => updateAdjustableAmount(event.currentTarget.value)}
            placeholder="금액을 입력해 주세요"
            type="number"
            value={draft.adjustableText}
          />
          <span className="block font-normal leading-relaxed text-ink-muted" id="meeting-adjustable-monthly-help">{adjustableQuestion?.helpText ?? ""}</span>
        </label>
      </section>

      <section className={`${cardClassName} space-y-5`} aria-labelledby="meeting-consent-heading">
        <div className="space-y-2">
          <h2 className="text-xl font-extrabold" id="meeting-consent-heading">함께 확인할 범위</h2>
          <p className="text-sm leading-relaxed text-ink-muted">아래 선택은 이 추가 답변에만 적용돼요.</p>
        </div>
        <p className="rounded-control border border-purple-200 bg-purple-tint p-4 text-sm leading-relaxed text-ink">{own.consentNotice}</p>
        <label className="flex items-start gap-3 text-sm leading-relaxed">
          <input
            aria-label="상대와 정보 공유 동의"
            checked={consent.shareWithPartner}
            className="mt-1 size-4 accent-purple-strong"
            disabled={disabled}
            onChange={toggleSharing}
            type="checkbox"
          />
          <span><strong>상대와 정보 공유</strong><br />두 분의 추가 답변을 함께 확인해요.</span>
        </label>
        <label className="flex items-start gap-3 text-sm leading-relaxed">
          <input
            aria-label="AI 처리 동의"
            checked={consent.allowAiProcessing}
            className="mt-1 size-4 accent-purple-strong"
            disabled={disabled || !consent.shareWithPartner}
            onChange={(event) => {
              const checked = event.currentTarget.checked;
              setConsent((current) => ({ ...current, allowAiProcessing: checked }));
            }}
            type="checkbox"
          />
          <span><strong>AI 처리</strong><br />{consent.shareWithPartner ? "공유한 추가 답변으로 해설을 만들어요." : "상대와 정보 공유를 선택하면 AI 처리를 선택할 수 있어요."}</span>
        </label>
      </section>

      <Button
        disabled={disabled || !canComplete}
        fullWidth
        onClick={submit}
      >
        {consent.allowAiProcessing ? "동의하고 AI 해설까지 보기" : "선택한 범위로 마무리하기"}
      </Button>
    </div>
  );
}

function GuideTopics({ guide }: { guide: MeetingGuideReady }) {
  if (guide.topics.length === 0) return null;
  return (
    <section aria-labelledby="meeting-guide-heading" className={`${cardClassName} space-y-4`}>
      <div>
        <h2 className="text-xl font-extrabold" id="meeting-guide-heading">함께 이야기할 내용</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">리포트가 확인한 내용을 대화의 시작점으로 삼아 보세요.</p>
      </div>
      <div className="space-y-3">
        {guide.topics.map((topic) => (
          <article className="rounded-card border border-border-soft bg-purple-tint p-4" key={topic.id}>
            <p className="text-sm leading-relaxed text-ink-muted">{topic.observation}</p>
            <p className="mt-1 font-bold leading-relaxed text-ink">{topic.question}</p>
            <p className="mt-2 text-sm leading-relaxed text-ink-muted">{topic.whyItMatters}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

const agreementText = (agreement: { text: string }): string => agreement.text;

function Standards({ standards }: { standards: MeetingStandardsReady }) {
  const groups = [
    ["둘 다 확인한 기준", standards.confirmed],
    ["제안 중인 기준", standards.proposed],
    ["보류한 기준", standards.deferred],
  ] as const;
  const visibleGroups = groups.filter(([, agreements]) => agreements.length > 0);
  if (visibleGroups.length === 0) return null;
  return (
    <section aria-labelledby="meeting-standards-heading" className={`${cardClassName} space-y-4`}>
      <div>
        <h2 className="text-xl font-extrabold" id="meeting-standards-heading">우리 돈의 기준표</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">{standards.notice}</p>
      </div>
      {visibleGroups.map(([label, agreements]) => (
        <div className="space-y-2" key={label}>
          <h3 className="font-bold">{label}</h3>
          <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed text-ink">
            {agreements.map((agreement) => <li key={agreement.id}>{agreementText(agreement)}</li>)}
          </ul>
        </div>
      ))}
    </section>
  );
}

function ExplanationCardView({ brief, card }: { brief: MeetingBrief; card: ExplanationCard }) {
  const facts = factValuesForCard(card, brief);
  return (
    <article className="rounded-card border border-border-soft bg-purple-tint p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-extrabold">{deepMeetingIssueLabels[card.issueId]}</h3>
      </div>
      <p className="mt-3 leading-relaxed text-ink">{card.explanation}</p>
      {facts.length > 0 ? (
        <dl className="mt-4 grid gap-2 border-t border-purple-200 pt-4 text-sm sm:grid-cols-2">
          {facts.map((fact) => (
            <div className="flex items-center justify-between gap-3" key={fact.id}>
              <dt className="text-ink-muted">{deepMeetingFactLabels[fact.id]}</dt>
              <dd className="font-bold text-ink">{formatWon(fact.valueWon)}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      <p className="mt-4 border-t border-purple-200 pt-4 font-bold leading-relaxed text-ink">{card.question}</p>
    </article>
  );
}

function Explanation({ explanation }: { explanation: AvailableExplanation }) {
  return (
    <section aria-labelledby="meeting-explanation-heading" className={`${cardClassName} space-y-4`}>
      <div>
        <h2 className="text-xl font-extrabold" id="meeting-explanation-heading">대화를 위한 해설</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          {explanation.source === "template" ? "기본 해설로 함께 살펴볼 내용을 정리했어요." : "AI 해설은 대화를 시작하기 위한 참고로만 확인해 주세요."}
        </p>
      </div>
      {explanation.cards.length > 0 ? (
        <div className="space-y-3">
          {explanation.cards.map((card, index) => <ExplanationCardView brief={explanation.brief} card={card} key={`${card.issueId}-${index}`} />)}
        </div>
      ) : (
        <p className="text-sm leading-relaxed text-ink-muted">현재 추가로 살펴볼 쟁점이 없어요.</p>
      )}
    </section>
  );
}

function MeetingOutcome({
  context,
  explanation,
  completedWithoutAi,
}: {
  context: ReturnType<typeof useMeetingContext>;
  explanation: ReturnType<typeof useMeetingExplanation>;
  completedWithoutAi: boolean;
}) {
  const availableExplanation = explanation.data?.status === "ready" ? explanation.data : null;
  const readyContext = context.data?.status === "ready" ? context.data : null;
  if (completedWithoutAi) {
    return (
      <section className={`${cardClassName} space-y-3`} role="status">
        <h2 className="text-xl font-extrabold">선택한 범위로 마무리했어요.</h2>
        <p className="leading-relaxed text-ink-muted">AI 처리 동의 없이도 두 분이 선택한 공동 결과를 이용할 수 있어요.</p>
      </section>
    );
  }
  if (explanation.isTimedOut || context.isTimedOut) {
    return (
      <section className={`${cardClassName} space-y-4`} role="status">
        <h2 className="text-xl font-extrabold">자동 확인을 잠시 멈췄어요</h2>
        <p className="leading-relaxed text-ink-muted">해설을 다시 확인하려면 아래 버튼을 눌러 주세요.</p>
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => { void context.refetch(); void explanation.refetch(); }} variant="secondary">다시 확인하기</Button>
        </div>
      </section>
    );
  }
  if (explanation.isFailed || context.isFailed) {
    return (
      <section className={`${cardClassName} space-y-4`} role="alert">
        <h2 className="text-xl font-extrabold">해설을 확인하지 못했어요</h2>
        <p className="leading-relaxed text-ink-muted">최신 상태를 확인한 뒤 다시 시도해 주세요.</p>
        <Button onClick={() => { void context.refetch(); void explanation.refetch(); }} variant="secondary">다시 확인하기</Button>
      </section>
    );
  }
  if (availableExplanation === null) {
    return (
      <section className={`${cardClassName} space-y-3`} role="status">
        <h2 className="text-xl font-extrabold">해설을 준비하고 있어요</h2>
        <p className="leading-relaxed text-ink-muted">두 분의 선택을 확인한 뒤 해설을 보여 드려요.</p>
      </section>
    );
  }
  return (
    <div className="flex flex-col gap-5">
      {readyContext?.providerStatus === "disabled" ? (
        <p className="rounded-control border border-border-soft bg-card p-4 text-sm leading-relaxed text-ink-muted" role="status">AI 설정과 관계없이 기본 해설을 이용할 수 있어요.</p>
      ) : null}
      <Explanation explanation={availableExplanation} />
    </div>
  );
}

function meetingWaitingPage({
  isRetrying,
  onRetry,
}: {
  isRetrying: boolean;
  onRetry: () => void;
}) {
  return (
    <section className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-5 px-5 py-16 sm:px-8">
      <p className="text-sm font-semibold text-purple-strong">15분 모드 · 우리 돈의 기준회의</p>
      <h1 className="text-3xl font-extrabold tracking-[-0.02em]">공동 리포트를 준비하고 있어요</h1>
      <p className="leading-relaxed text-ink-muted">공동 리포트가 준비되면 두 분의 기준회의를 시작할 수 있어요.</p>
      <Button disabled={isRetrying} onClick={onRetry} variant="secondary">
        다시 확인하기
      </Button>
      <NavigationLink direction="back" to="/deep">딥모드 첫 화면으로</NavigationLink>
    </section>
  );
}

export function DeepMeetingPage() {
  const { sessionId = "" } = useParams();
  const queryClient = useQueryClient();
  const guideQuery = useQuery({
    enabled: sessionId !== "",
    queryFn: () => fetchMeetingGuide(sessionId),
    queryKey: meetingGuideQueryKey(sessionId),
    retry: false,
  });
  const ownQuery = useQuery({
    enabled: sessionId !== "",
    queryFn: () => fetchOwnMeeting(sessionId),
    queryKey: ownMeetingQueryKey(sessionId),
    retry: false,
  });
  const standardsQuery = useQuery({
    enabled: sessionId !== "",
    queryFn: () => fetchMeetingStandards(sessionId),
    queryKey: meetingStandardsQueryKey(sessionId),
    retry: false,
  });
  const completeMutation = useMutation({
    mutationFn: (payload: Parameters<typeof completeMeeting>[1]) => completeMeeting(sessionId, payload),
    onSuccess: (completion: MeetingCompletion) => {
      queryClient.setQueryData(ownMeetingQueryKey(sessionId), completion.own);
      queryClient.setQueryData(meetingExplanationQueryKey(sessionId), completion.explanation);
    },
    onError: () => {
      void queryClient.invalidateQueries({ queryKey: ownMeetingQueryKey(sessionId) });
    },
  });
  const shouldPollMeeting = ownQuery.data?.consent?.allowAiProcessing === true || completeMutation.data?.own.consent?.allowAiProcessing === true;
  const context = useMeetingContext(sessionId, shouldPollMeeting);
  const explanation = useMeetingExplanation(sessionId, shouldPollMeeting);

  if (guideQuery.data?.status === "waiting") {
    return meetingWaitingPage({
      isRetrying: guideQuery.isFetching,
      onRetry: () => {
        void guideQuery.refetch();
      },
    });
  }
  if (
    sessionId === "" || guideQuery.isPending || ownQuery.isPending ||
    guideQuery.data === undefined || ownQuery.data === undefined
  ) {
    return (
      <PageLoading
        className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 py-12 sm:px-8 sm:py-16"
        eyebrow="15분 모드 · 우리 돈의 기준회의"
        heading="우리 돈의 기준회의"
        message="기준회의에 필요한 내용을 확인하고 있어요."
      >
        <div className="space-y-3">
          <Skeleton className="h-4 w-52" />
          <Skeleton className="h-7 w-2/3" />
          <Skeleton className="h-5 w-full" />
        </div>
        <div className="space-y-5 rounded-card border border-border bg-card p-6 sm:p-8">
          <Skeleton className="h-6 w-44" />
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
        <div className="space-y-5 rounded-card border border-border bg-card p-6 sm:p-8">
          <Skeleton className="h-6 w-36" />
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
        <div className="space-y-4 rounded-card border border-border bg-card p-6 sm:p-8">
          <Skeleton className="h-6 w-44" />
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-4/5" />
        </div>
      </PageLoading>
    );
  }
  if (guideQuery.isError || ownQuery.isError || guideQuery.data.status !== "ready") {
    return (
      <section className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-5 px-5 py-16 sm:px-8">
        <h1 className="text-3xl font-extrabold tracking-[-0.02em]">우리 돈의 기준회의</h1>
        <div className={cardClassName} role="alert">
          <h2 className="text-xl font-extrabold">기준회의를 불러오지 못했어요</h2>
          <p className="mt-2 leading-relaxed text-ink-muted">최신 공동 리포트와 답변을 확인하지 못했어요. 잠시 후 다시 시도해 주세요.</p>
          <Button className="mt-5" onClick={() => { void guideQuery.refetch(); void ownQuery.refetch(); }} variant="secondary">다시 확인하기</Button>
        </div>
      </section>
    );
  }

  const guide = guideQuery.data;
  const own = ownQuery.data;
  const standardsData = standardsQuery.data;
  const standards: MeetingStandardsReady | null = standardsData !== undefined && standardsData.status === "ready"
    ? standardsData
    : null;
  const hasMeetingResult = completeMutation.data !== undefined || shouldPollMeeting || context.data !== null || explanation.data !== null;
  const completedWithoutAi = completeMutation.data?.own.consent?.allowAiProcessing === false;
  const encodedSessionId = encodeURIComponent(sessionId);
  const onSubmit = (answers: MeetingAnswers, shareWithPartner: boolean, allowAiProcessing: boolean) => {
    completeMutation.mutate({
      expectedRound: own.round,
      planVersion: own.planVersion,
      expectedRevision: own.revision,
      answers,
      consentVersion: own.consentVersion,
      shareWithPartner,
      allowAiProcessing,
    });
  };

  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 py-12 sm:px-8 sm:py-16">
      <div className="space-y-3">
        <p className="text-sm font-semibold text-purple-strong">15분 모드 · 우리 돈의 기준회의</p>
        <h1 className="text-3xl font-extrabold tracking-[-0.02em]">우리 돈의 기준회의</h1>
        <p className="leading-relaxed text-ink-muted">공동 리포트를 바탕으로 실제로 이야기할 기준을 정해 보세요. 처음 적은 금액은 합의가 아니며, 서로 지킬 수 있는 기준을 함께 확인해요.</p>
      </div>

      <GuideTopics guide={guide} />
      {hasMeetingResult ? <MeetingOutcome completedWithoutAi={completedWithoutAi} context={context} explanation={explanation} /> : null}
      <MeetingQuestionsForm
        disabled={completeMutation.isPending}
        key={`${sessionId}-${own.revision}-${own.answers?.contributionMeaning ?? "none"}-${own.consent?.recordedAt ?? "none"}`}
        onSubmit={onSubmit}
        own={own}
      />
      {standards ? <Standards standards={standards} /> : null}
      {completeMutation.isError ? <p aria-live="polite" className="text-sm font-semibold text-red-700" role="alert">{completeErrorMessage(completeMutation.error)}</p> : null}
      <NavigationLink direction="back" to={`/deep/result/${encodedSessionId}`}>공동 리포트로 돌아가기</NavigationLink>
    </section>
  );
}
