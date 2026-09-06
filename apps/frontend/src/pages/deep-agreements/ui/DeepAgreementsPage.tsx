import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";

import {
  confirmDeepAgreement,
  deferDeepAgreement,
  deepAgreementsQueryKey,
  editDeepAgreement,
  fetchDeepAgreements,
  proposeDeepAgreement,
  type DeepAgreement,
} from "@/entities/deep-agreement";
import { deepRoundStateQueryKey, fetchDeepRoundState } from "@/entities/deep-session";
import { createIdempotencyKey, isApiErrorCode } from "@/shared/api";
import { Button } from "@/shared/ui/button";
import { AgreementCard, AgreementForm, type AgreementDraft } from "@/widgets/agreement-card";

const cardClassName = "rounded-card border border-border bg-card p-6 sm:p-8";

type FormState = { agreement?: DeepAgreement; mode: "create" | "edit" };
type AgreementAction = { agreement: DeepAgreement; action: "confirm" | "defer" };
type ProposalAttempt = { fingerprint: string; key: string };

const actionErrorMessage = (error: unknown): string => {
  if (isApiErrorCode(error, "AGREEMENT_VERSION_CONFLICT")) return "다른 사람이 이 기준을 바꿨어요. 최신 내용을 다시 확인해 주세요.";
  if (isApiErrorCode(error, "ROUND_VERSION_CONFLICT")) return "새 라운드가 시작됐어요. 최신 기준표를 다시 확인해 주세요.";
  if (isApiErrorCode(error, "PUBLICATION_NOT_READY")) return "공동 리포트가 준비된 뒤 기준표를 만들 수 있어요.";
  return "기준표를 저장하지 못했어요. 잠시 후 다시 시도해 주세요.";
};

const updateAgreement = (agreements: DeepAgreement[] | undefined, response: DeepAgreement): DeepAgreement[] => {
  if (agreements === undefined) return [response];
  const index = agreements.findIndex((agreement) => agreement.id === response.id);
  if (index < 0) return [...agreements, response];
  return agreements.map((agreement) => agreement.id === response.id ? response : agreement);
};

function AgreementsLoading() {
  return (
    <section className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-5 px-5 py-16 sm:px-8">
      <h1 className="text-3xl font-extrabold tracking-[-0.02em]">우리 돈의 기준표</h1>
      <p aria-live="polite" className="text-ink-muted" role="status">현재 기준표를 불러오고 있어요.</p>
    </section>
  );
}

function AgreementsError({ onRetry }: { onRetry: () => void }) {
  return (
    <section className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-5 px-5 py-16 sm:px-8">
      <h1 className="text-3xl font-extrabold tracking-[-0.02em]">우리 돈의 기준표</h1>
      <div className={cardClassName} role="alert">
        <h2 className="text-xl font-extrabold">기준표를 불러오지 못했어요.</h2>
        <p className="mt-2 leading-relaxed text-ink-muted">공동 리포트가 준비됐는지 확인한 뒤 다시 시도해 주세요.</p>
        <Button className="mt-5" onClick={onRetry} variant="secondary">다시 확인하기</Button>
      </div>
    </section>
  );
}

export function DeepAgreementsPage() {
  const { sessionId = "" } = useParams();
  const queryClient = useQueryClient();
  const [formState, setFormState] = useState<FormState | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const proposalAttempt = useRef<ProposalAttempt | null>(null);

  const agreementsQuery = useQuery({
    enabled: sessionId !== "",
    queryFn: () => fetchDeepAgreements(sessionId),
    queryKey: deepAgreementsQueryKey(sessionId),
    retry: false,
  });
  const roundQuery = useQuery({
    enabled: sessionId !== "",
    queryFn: () => fetchDeepRoundState(sessionId),
    queryKey: deepRoundStateQueryKey(sessionId),
    retry: false,
  });

  const proposalMutation = useMutation({
    mutationFn: (draft: AgreementDraft) => {
      const expectedRound = roundQuery.data?.round;
      if (expectedRound === undefined) {
        throw new Error("round-not-loaded");
      }
      const proposal = { ...draft, expectedRound };
      const fingerprint = JSON.stringify(proposal);
      if (proposalAttempt.current?.fingerprint !== fingerprint) {
        proposalAttempt.current = { fingerprint, key: createIdempotencyKey() };
      }
      return proposeDeepAgreement(sessionId, proposal, proposalAttempt.current.key);
    },
    onError: (error) => {
      setActionError(actionErrorMessage(error));
      if (isApiErrorCode(error, "ROUND_VERSION_CONFLICT")) {
        void Promise.all([agreementsQuery.refetch(), roundQuery.refetch()]);
      }
    },
    onSuccess: (response) => {
      queryClient.setQueryData<DeepAgreement[]>(deepAgreementsQueryKey(sessionId), (agreements) => updateAgreement(agreements, response));
      proposalAttempt.current = null;
      setActionError(null);
      setFormState(null);
    },
  });

  const editMutation = useMutation({
    mutationFn: ({ agreement, draft }: { agreement: DeepAgreement; draft: AgreementDraft }) =>
      editDeepAgreement(sessionId, agreement.id, { ...draft, expectedVersion: agreement.version }),
    onError: (error) => {
      setActionError(actionErrorMessage(error));
      if (isApiErrorCode(error, "ROUND_VERSION_CONFLICT")) {
        void Promise.all([agreementsQuery.refetch(), roundQuery.refetch()]);
      } else if (isApiErrorCode(error, "AGREEMENT_VERSION_CONFLICT")) {
        void agreementsQuery.refetch();
      }
    },
    onSuccess: (response) => {
      queryClient.setQueryData<DeepAgreement[]>(deepAgreementsQueryKey(sessionId), (agreements) => updateAgreement(agreements, response));
      setActionError(null);
      setFormState(null);
    },
  });

  const actionMutation = useMutation({
    mutationFn: ({ action, agreement }: AgreementAction) => action === "confirm"
      ? confirmDeepAgreement(sessionId, agreement.id, agreement.version)
      : deferDeepAgreement(sessionId, agreement.id, agreement.version),
    onError: (error) => {
      setActionError(actionErrorMessage(error));
      if (isApiErrorCode(error, "ROUND_VERSION_CONFLICT")) {
        void Promise.all([agreementsQuery.refetch(), roundQuery.refetch()]);
      } else if (isApiErrorCode(error, "AGREEMENT_VERSION_CONFLICT")) {
        void agreementsQuery.refetch();
      }
    },
    onSuccess: (response) => {
      queryClient.setQueryData<DeepAgreement[]>(deepAgreementsQueryKey(sessionId), (agreements) => updateAgreement(agreements, response));
      setActionError(null);
    },
  });

  if (sessionId === "" || agreementsQuery.isPending || roundQuery.isPending) return <AgreementsLoading />;

  if (agreementsQuery.isError || roundQuery.isError || agreementsQuery.data === undefined) {
    return <AgreementsError onRetry={() => { void agreementsQuery.refetch(); void roundQuery.refetch(); }} />;
  }

  const agreements = agreementsQuery.data;
  const formKey = formState?.agreement === undefined ? "create" : `edit-${formState.agreement.id}-${formState.agreement.version}`;
  const isMutationPending = proposalMutation.isPending || editMutation.isPending || actionMutation.isPending;

  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 py-12 sm:px-8 sm:py-16">
      <div className="space-y-3">
        <p className="text-sm font-semibold text-purple-strong">15분 모드 · 공동 리포트 이후</p>
        <h1 className="text-3xl font-extrabold tracking-[-0.02em]">우리 돈의 기준표</h1>
        <p className="leading-relaxed text-ink-muted">두 분이 이야기한 내용을 금액·범위·날짜가 있는 기준으로 남겨 보세요. 한쪽이 확인한 것만으로는 합의가 되지 않아요.</p>
      </div>

      {actionError ? <p aria-live="polite" className="rounded-control border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800" role="alert">{actionError}</p> : null}

      {formState !== null ? (
        <AgreementForm
          initialAgreement={formState.agreement}
          isPending={isMutationPending}
          key={formKey}
          mode={formState.mode}
          onCancel={() => { setActionError(null); setFormState(null); }}
          onSubmit={(draft) => {
            setActionError(null);
            if (formState.agreement === undefined) {
              proposalMutation.mutate(draft);
            } else {
              editMutation.mutate({ agreement: formState.agreement, draft });
            }
          }}
        />
      ) : (
        <Button className="w-fit" disabled={roundQuery.data === undefined} onClick={() => { setActionError(null); setFormState({ mode: "create" }); }}>
          새 기준 제안하기
        </Button>
      )}

      <section aria-labelledby="deep-agreements-list-heading" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-extrabold" id="deep-agreements-list-heading">현재 기준</h2>
            <p className="mt-1 text-sm text-ink-muted">최신 서버 응답을 기준으로 표시해요.</p>
          </div>
          <p className="text-sm font-semibold text-purple-strong">라운드 {roundQuery.data.round}</p>
        </div>
        {agreements.length === 0 ? (
          <div className={cardClassName}><p className="leading-relaxed text-ink-muted">아직 남겨 둔 기준이 없어요. 두 분이 이야기한 내용을 첫 기준으로 제안해 보세요.</p></div>
        ) : (
          <div className="space-y-4">
            {agreements.map((agreement) => (
              <AgreementCard
                agreement={agreement}
                isActionPending={isMutationPending}
                key={agreement.id}
                onConfirm={() => { setActionError(null); actionMutation.mutate({ action: "confirm", agreement }); }}
                onDefer={() => { setActionError(null); actionMutation.mutate({ action: "defer", agreement }); }}
                onEdit={() => { setActionError(null); setFormState({ agreement, mode: "edit" }); }}
              />
            ))}
          </div>
        )}
      </section>

      <div className="flex flex-wrap justify-between gap-4">
        <Link className="font-bold text-purple-strong underline" to={`/deep/result/${encodeURIComponent(sessionId)}`}>공동 리포트로 돌아가기</Link>
        <Link className="font-bold text-purple-strong underline" to={`/deep/waiting/${encodeURIComponent(sessionId)}`}>세션 상태 보기</Link>
      </div>
    </section>
  );
}
