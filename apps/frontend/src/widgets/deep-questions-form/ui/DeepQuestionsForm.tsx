import { useState } from "react";

import type { DeepInputV3 } from "@/entities/deep-input";
import {
  deepAreaLabels,
  deepConstraintAllowBorrowingLabels,
  deepConstraintKindLabels,
  deepConstraintScopeLabels,
  deepConstraintStrengthLabels,
  deepContributionFieldLabels,
  deepDiscussionStateLabels,
  type DeepPlanningQuestion,
  type DeepQuestions,
  type DeepValueQuestion,
} from "@/entities/deep-question";
import { createFundingId } from "@/shared/lib";
import { AmountField, type AmountValue } from "@/shared/ui/amount-field";
import { PillToggle } from "@/shared/ui/pill-toggle";

type Constraint = NonNullable<DeepInputV3["constraints"]>[number];
type SkippedQuestionId = NonNullable<DeepInputV3["skippedQuestionIds"]>[number];
type Contribution = NonNullable<DeepInputV3["contribution"]>;
type ContributionAmountKey = Exclude<keyof Contribution, "discussionState">;

const cardClassName = "rounded-card border border-border-soft bg-card p-5 sm:p-6";
const fieldClassName = "min-h-11 w-full rounded-control border border-border-control bg-card px-3 py-2 outline-none focus:border-purple-strong focus:shadow-focus disabled:cursor-not-allowed disabled:bg-border-soft";
const contributionAmountKeys = new Set<ContributionAmountKey>([
  "ownMonthly",
  "expectedPartnerMonthly",
  "personalSpendingFloor",
  "personalSavingFloor",
]);

const emptyAmount = (): AmountValue => ({ status: "unknown", value: null, precision: "exact" });

const amountOrUnknown = (amount: AmountValue | undefined): AmountValue => amount ?? emptyAmount();

const areaLabel = (area: string): string | undefined => deepAreaLabels[area as keyof typeof deepAreaLabels];

const contributionAmountKey = (binding: string): ContributionAmountKey | null => {
  const key = binding.split(".").at(-1) as ContributionAmountKey | undefined;
  return key !== undefined && contributionAmountKeys.has(key) ? key : null;
};

const amountStatusesFromOptions = (options: string[]): Array<AmountValue["status"]> =>
  options.filter((option): option is AmountValue["status"] => option === "known" || option === "unknown" || option === "withheld");

const toSkippedQuestionId = (questionId: string): SkippedQuestionId => questionId as SkippedQuestionId;

function ValueQuestionCard({
  disabled,
  note,
  onAnswer,
  onNoteChange,
  onSkip,
  question,
  scaleLabels,
  skipped,
  value,
}: {
  disabled: boolean;
  note: string;
  onAnswer: (value: number) => void;
  onNoteChange: (note: string) => void;
  onSkip: () => void;
  question: DeepValueQuestion;
  scaleLabels: string[];
  skipped: boolean;
  value: number | null;
}) {
  const label = areaLabel(question.area);

  return (
    <article className={`${cardClassName} space-y-5`} aria-labelledby={`deep-value-heading-${question.id}`}>
      <div className="space-y-2">
        {label ? <p className="text-sm font-semibold text-purple-strong">{label}</p> : null}
        <h3 className="text-lg font-extrabold" id={`deep-value-heading-${question.id}`}>{question.text}</h3>
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
        <p className="text-sm leading-relaxed text-ink-muted">{question.left}</p>
        <div className="flex flex-wrap justify-center gap-2" role="group" aria-label={`${question.id} 척도`}>
          {scaleLabels.slice(0, 5).map((label, index) => {
            const answer = index + 1;
            return (
              <PillToggle
                aria-label={`${question.id} ${label}`}
                disabled={disabled}
                key={`${question.id}-${answer}`}
                onPressedChange={() => onAnswer(answer)}
                pressed={value === answer}
                size="sm"
                tone="purple"
              >
                {label}
              </PillToggle>
            );
          })}
        </div>
        <p className="text-sm leading-relaxed text-right text-ink-muted">{question.right}</p>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          aria-label={`${question.id} ${skipped ? "건너뛰기 해제" : "건너뛰기"}`}
          className="rounded-control px-3 py-2 text-sm font-bold text-purple-strong underline disabled:cursor-not-allowed disabled:opacity-50"
          disabled={disabled}
          onClick={onSkip}
          type="button"
        >
          {skipped ? "건너뛰기 해제" : "건너뛰기"}
        </button>
        <span className="text-sm text-ink-muted">{skipped ? "이 문항은 건너뛰었어요." : value === null ? "아직 선택하지 않았어요." : `${value}/5`}</span>
      </div>
      <label className="space-y-2 text-sm font-semibold" htmlFor={`deep-value-note-${question.id}`}>
        <span className="block">메모</span>
        <textarea
          aria-label={`${question.id} 메모`}
          className={`${fieldClassName} min-h-24 resize-y`}
          disabled={disabled}
          id={`deep-value-note-${question.id}`}
          maxLength={300}
          onChange={(event) => onNoteChange(event.currentTarget.value)}
          value={note}
        />
        <span className="block text-right text-xs font-normal text-ink-muted">{note.length}/300</span>
      </label>
    </article>
  );
}

function ContributionAmountQuestion({
  disabled,
  onBlur,
  onChange,
  question,
  value,
  sharedBudgetPending,
}: {
  disabled: boolean;
  onBlur: () => void;
  onChange: (amount: AmountValue) => void;
  question: DeepPlanningQuestion;
  value: AmountValue;
  sharedBudgetPending: boolean;
}) {
  return (
    <article className={`${cardClassName} space-y-4`}>
      <div className="space-y-2">
        <h3 className="text-lg font-extrabold">{question.text}</h3>
        {question.optional ? <p className="text-sm text-ink-muted">선택해서 알려 주세요.</p> : null}
        {sharedBudgetPending ? <p className="text-sm leading-relaxed text-ink-muted">공동비 범위가 정해지지 않아 이 답변은 공동비를 정한 뒤 다시 확인할 수 있어요.</p> : null}
      </div>
      <AmountField allowedStatuses={amountStatusesFromOptions(question.options)} disabled={disabled} label={question.text} onBlur={onBlur} onChange={onChange} value={value} />
    </article>
  );
}

function AmountsQuestion({
  disabled,
  onBlur,
  onChange,
  question,
  contribution,
}: {
  disabled: boolean;
  onBlur: () => void;
  onChange: (key: ContributionAmountKey, amount: AmountValue) => void;
  question: DeepPlanningQuestion;
  contribution: Contribution | undefined;
}) {
  const fields = question.bindings
    .map((binding) => contributionAmountKey(binding))
    .filter((key): key is ContributionAmountKey => key !== null);

  return (
    <article className={`${cardClassName} space-y-4`}>
      <div className="space-y-2">
        <h3 className="text-lg font-extrabold">{question.text}</h3>
        {question.optional ? <p className="text-sm text-ink-muted">선택해서 알려 주세요.</p> : null}
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        {fields.map((key) => (
          <AmountField
            allowedStatuses={amountStatusesFromOptions(question.options)}
            disabled={disabled}
            key={key}
            label={deepContributionFieldLabels[key as keyof typeof deepContributionFieldLabels] ?? key}
            onBlur={onBlur}
            onChange={(amount) => onChange(key, amount)}
            value={amountOrUnknown(contribution?.[key] as AmountValue | undefined)}
          />
        ))}
      </div>
    </article>
  );
}

function ChoiceQuestion({
  disabled,
  onBlur,
  onChange,
  question,
  value,
}: {
  disabled: boolean;
  onBlur: () => void;
  onChange: (value: string) => void;
  question: DeepPlanningQuestion;
  value: string;
}) {
  return (
    <article className={`${cardClassName} space-y-4`}>
      <div className="space-y-2">
        <h3 className="text-lg font-extrabold">{question.text}</h3>
        {question.optional ? <p className="text-sm text-ink-muted">선택해서 알려 주세요.</p> : null}
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label={question.text}>
        {question.options.map((option) => {
          const label = deepDiscussionStateLabels[option as keyof typeof deepDiscussionStateLabels];
          if (label === undefined) return null;
          return (
            <PillToggle
              aria-label={label}
              disabled={disabled}
              key={option}
              onBlur={onBlur}
              onPressedChange={() => onChange(option)}
              pressed={value === option}
              size="sm"
              tone="purple"
            >
              {label}
            </PillToggle>
          );
        })}
      </div>
    </article>
  );
}

function ConstraintEditor({
  disabled,
  onBlur,
  onChange,
  constraints,
}: {
  disabled: boolean;
  onBlur: () => void;
  onChange: (updateConstraints: (constraints: Constraint[]) => Constraint[]) => void;
  constraints: Constraint[];
}) {
  const updateConstraint = <Key extends keyof Constraint>(index: number, key: Key, value: Constraint[Key]) => {
    onChange((currentConstraints) => currentConstraints.map((constraint, constraintIndex) => constraintIndex === index ? { ...constraint, [key]: value } : constraint));
  };

  const addConstraint = () => {
    if (constraints.length >= 20) return;
    onChange((currentConstraints) => {
      if (currentConstraints.length >= 20) return currentConstraints;
      return [
        ...currentConstraints,
        {
          id: createFundingId("constraint"),
          kind: "other",
          scope: "household",
          strength: "required",
          allowBorrowing: null,
          note: "",
        },
      ];
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-muted">조건은 20개까지 추가할 수 있어요.</p>
        <button className="min-h-10 rounded-control border border-border px-4 py-2 text-sm font-bold hover:border-purple-strong disabled:opacity-50" disabled={disabled || constraints.length >= 20} onClick={addConstraint} type="button">조건 추가</button>
      </div>
      {constraints.length === 0 ? <p className="text-sm text-ink-muted">아직 추가한 조건이 없어요.</p> : null}
      {constraints.map((constraint, index) => (
        <article className="space-y-4 rounded-card border border-border-soft bg-card p-4" key={constraint.id}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h4 className="font-extrabold">조건 {index + 1}</h4>
            <button
              aria-label={`조건 ${index + 1} 삭제`}
              className="rounded-control px-3 py-2 text-sm font-bold text-red-700 hover:bg-red-50 disabled:opacity-50"
              disabled={disabled}
              onClick={() => onChange((currentConstraints) => currentConstraints.filter((_, constraintIndex) => constraintIndex !== index))}
              type="button"
            >
              삭제
            </button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2 text-sm font-semibold">
              <span className="block">조건 종류</span>
              <select
                aria-label={`조건 ${index + 1} 종류`}
                className={fieldClassName}
                disabled={disabled}
                onBlur={onBlur}
                onChange={(event) => updateConstraint(index, "kind", event.currentTarget.value as Constraint["kind"])}
                value={constraint.kind}
              >
                {Object.entries(deepConstraintKindLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label className="space-y-2 text-sm font-semibold">
              <span className="block">적용 범위</span>
              <select
                aria-label={`조건 ${index + 1} 적용 범위`}
                className={fieldClassName}
                disabled={disabled}
                onBlur={onBlur}
                onChange={(event) => updateConstraint(index, "scope", event.currentTarget.value as Constraint["scope"])}
                value={constraint.scope}
              >
                {Object.entries(deepConstraintScopeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label className="space-y-2 text-sm font-semibold">
              <span className="block">지켜야 하는 정도</span>
              <select
                aria-label={`조건 ${index + 1} 지켜야 하는 정도`}
                className={fieldClassName}
                disabled={disabled}
                onBlur={onBlur}
                onChange={(event) => updateConstraint(index, "strength", event.currentTarget.value as Constraint["strength"])}
                value={constraint.strength}
              >
                {Object.entries(deepConstraintStrengthLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label className="space-y-2 text-sm font-semibold">
              <span className="block">대출 허용</span>
              <select
                aria-label={`조건 ${index + 1} 대출 허용`}
                className={fieldClassName}
                disabled={disabled}
                onBlur={onBlur}
                onChange={(event) => updateConstraint(index, "allowBorrowing", event.currentTarget.value === "null" ? null : event.currentTarget.value === "true")}
                value={constraint.allowBorrowing === undefined || constraint.allowBorrowing === null ? "null" : String(constraint.allowBorrowing)}
              >
                {Object.entries(deepConstraintAllowBorrowingLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <div className="sm:col-span-2">
              <AmountField
                disabled={disabled}
                id={`deep-constraint-amount-${index}`}
                label={`조건 ${index + 1} 금액 기준`}
                onBlur={onBlur}
                onChange={(amount) => updateConstraint(index, "amount", amount)}
                value={amountOrUnknown(constraint.amount as AmountValue | undefined)}
              />
            </div>
          </div>
          <label className="space-y-2 text-sm font-semibold" htmlFor={`deep-constraint-note-${index}`}>
            <span className="block">설명</span>
            <textarea
              aria-label={`조건 ${index + 1} 메모`}
              className={`${fieldClassName} min-h-24 resize-y`}
              disabled={disabled}
              id={`deep-constraint-note-${index}`}
              maxLength={300}
              onBlur={onBlur}
              onChange={(event) => updateConstraint(index, "note", event.currentTarget.value.slice(0, 300))}
              value={constraint.note ?? ""}
            />
            <span className="block text-right text-xs font-normal text-ink-muted">{(constraint.note ?? "").length}/300</span>
          </label>
        </article>
      ))}
    </div>
  );
}

function PlanningQuestionCard({
  disabled,
  onBlur,
  onChange,
  question,
  draft,
  sharedBudgetPending,
}: {
  disabled: boolean;
  onBlur: () => void;
  onChange: (updater: (draft: DeepInputV3) => DeepInputV3) => void;
  question: DeepPlanningQuestion;
  draft: DeepInputV3;
  sharedBudgetPending: boolean;
}) {
  if (question.type === "amount") {
    const key = contributionAmountKey(question.bindings[0] ?? "");
    if (key === null) return null;
    return (
      <ContributionAmountQuestion
        disabled={disabled}
        onBlur={onBlur}
        onChange={(amount) => onChange((current) => ({
          ...current,
          contribution: { discussionState: current.contribution?.discussionState ?? "unknown", ...current.contribution, [key]: amount },
        }))}
        question={question}
        sharedBudgetPending={sharedBudgetPending}
        value={amountOrUnknown(draft.contribution?.[key] as AmountValue | undefined)}
      />
    );
  }

  if (question.type === "amounts") {
    return (
      <article className="space-y-4">
        <AmountsQuestion
          contribution={draft.contribution}
          disabled={disabled}
          onBlur={onBlur}
          onChange={(key, amount) => onChange((current) => ({
            ...current,
            contribution: { discussionState: current.contribution?.discussionState ?? "unknown", ...current.contribution, [key]: amount },
          }))}
          question={question}
        />
      </article>
    );
  }

  if (question.type === "constraints") {
    return (
      <article className={`${cardClassName} space-y-4`}>
        <div className="space-y-2">
          <h3 className="text-lg font-extrabold">{question.text}</h3>
          {question.optional ? <p className="text-sm text-ink-muted">선택해서 알려 주세요.</p> : null}
        </div>
        <ConstraintEditor
          constraints={draft.constraints ?? []}
          disabled={disabled}
          onBlur={onBlur}
          onChange={(updateConstraints) => onChange((current) => ({ ...current, constraints: updateConstraints(current.constraints ?? []) }))}
        />
      </article>
    );
  }

  if (question.type === "choice") {
    return (
      <ChoiceQuestion
        disabled={disabled}
        onBlur={onBlur}
        onChange={(value) => onChange((current) => {
          const contribution = current.contribution ?? { discussionState: "unknown" as const };
          return { ...current, contribution: { ...contribution, discussionState: value as Contribution["discussionState"] } };
        })}
        question={question}
        value={draft.contribution?.discussionState ?? "unknown"}
      />
    );
  }

  return null;
}

export interface DeepQuestionsFormProps {
  disabled?: boolean;
  draft: DeepInputV3;
  onBlur: () => void;
  onChange: (updater: (draft: DeepInputV3) => DeepInputV3) => void;
  questions: DeepQuestions;
}

export function DeepQuestionsForm({ disabled = false, draft, onBlur, onChange, questions }: DeepQuestionsFormProps) {
  const [importantAreaNotice, setImportantAreaNotice] = useState(false);
  const skippedQuestionIds = draft.skippedQuestionIds ?? [];
  const hasCommonExpensesFollowup = questions.followups.some((followup) => followup.bindings.includes("commonExpensesStatus"));
  const importantAreas = Array.from(new Set(questions.valueQuestions.map((question) => question.area)))
    .map((area) => ({ area, label: areaLabel(area) }))
    .filter((entry): entry is { area: string; label: string } => entry.label !== undefined);
  const planningQuestions = questions.planningQuestions.filter((question) => question.type !== "fundingAllocation");

  const updateValue = (questionId: string, value: number) => {
    onChange((current) => {
      const skipped = new Set(current.skippedQuestionIds ?? []);
      skipped.delete(toSkippedQuestionId(questionId));
      return {
        ...current,
        values: { ...current.values, [questionId]: value },
        skippedQuestionIds: [...skipped],
      };
    });
  };

  const toggleSkipped = (questionId: string) => {
    onChange((current) => {
      const id = toSkippedQuestionId(questionId);
      const skipped = new Set(current.skippedQuestionIds ?? []);
      const isSkipped = skipped.has(id);
      if (isSkipped) {
        skipped.delete(id);
        return { ...current, skippedQuestionIds: [...skipped] };
      }

      skipped.add(id);
      const values = { ...(current.values ?? {}) };
      delete values[questionId];
      return {
        ...current,
        values: Object.keys(values).length > 0 ? values : undefined,
        skippedQuestionIds: [...skipped],
      };
    });
  };

  const updateNote = (questionId: string, note: string) => {
    onChange((current) => ({
      ...current,
      contextNotes: { ...current.contextNotes, [questionId]: note.slice(0, 300) },
    }));
  };

  const toggleImportantArea = (area: string) => {
    const selected = draft.importantAreas ?? [];
    if (selected.includes(area as NonNullable<DeepInputV3["importantAreas"]>[number])) {
      setImportantAreaNotice(false);
      onChange((current) => ({ ...current, importantAreas: (current.importantAreas ?? []).filter((currentArea) => currentArea !== area) }));
      return;
    }
    if (selected.length >= 2) {
      setImportantAreaNotice(true);
      return;
    }
    setImportantAreaNotice(false);
    onChange((current) => ({ ...current, importantAreas: [...(current.importantAreas ?? []), area as NonNullable<DeepInputV3["importantAreas"]>[number]] }));
  };

  return (
    <form className="flex flex-col gap-10" onSubmit={(event) => event.preventDefault()}>
      <section className="space-y-5" aria-labelledby="deep-values-heading">
        <div className="space-y-2">
          <h2 className="text-xl font-extrabold" id="deep-values-heading">가치관</h2>
          <p className="text-sm leading-relaxed text-ink-muted">서버가 정한 양쪽 문구와 척도를 보고 가까운 쪽을 선택해 주세요. 중간은 모름이 아니라 두 문구의 가운데예요.</p>
        </div>
        <div className="space-y-2">
          <h3 className="text-base font-extrabold" id="deep-important-areas-heading">중요한 영역</h3>
          <p className="text-sm leading-relaxed text-ink-muted">가치관에서 특히 이야기하고 싶은 영역을 최대 2개까지 골라 주세요.</p>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-labelledby="deep-important-areas-heading">
          {importantAreas.map(({ area, label }) => (
            <PillToggle
              aria-label={label}
              disabled={disabled}
              key={area}
              onPressedChange={() => toggleImportantArea(area)}
              pressed={(draft.importantAreas ?? []).includes(area as NonNullable<DeepInputV3["importantAreas"]>[number])}
              size="sm"
              tone="purple"
            >
              {label}
            </PillToggle>
          ))}
        </div>
        {importantAreaNotice ? <p aria-live="polite" className="text-sm font-semibold text-amber-700">중요한 영역은 최대 2개까지 선택할 수 있어요.</p> : null}
        <div className="flex flex-col gap-5">
          {questions.valueQuestions.map((question) => (
            <ValueQuestionCard
              disabled={disabled}
              key={question.id}
              note={draft.contextNotes?.[question.id] ?? ""}
              onAnswer={(value) => updateValue(question.id, value)}
              onNoteChange={(note) => updateNote(question.id, note)}
              onSkip={() => toggleSkipped(question.id)}
              question={question}
              scaleLabels={questions.scaleLabels}
              skipped={skippedQuestionIds.includes(toSkippedQuestionId(question.id))}
              value={draft.values?.[question.id] ?? null}
            />
          ))}
        </div>
      </section>

      <section className="space-y-5" aria-labelledby="deep-planning-heading">
        <div className="space-y-2">
          <h2 className="text-xl font-extrabold" id="deep-planning-heading">분담과 기준</h2>
          <p className="text-sm leading-relaxed text-ink-muted">앞에서 정한 계획을 바탕으로 각자의 기준을 알려 주세요. 서버가 보내 준 질문만 표시해요.</p>
        </div>
        {questions.followups.length > 0 ? (
          <div className="space-y-3">
            {questions.followups.map((followup) => <p className="rounded-card border border-amber-200 bg-amber-50 p-4 text-sm leading-relaxed text-ink" key={followup.id}>{followup.text}</p>)}
          </div>
        ) : null}
        <div className="flex flex-col gap-5">
          {planningQuestions.map((question) => (
            <PlanningQuestionCard
              disabled={disabled}
              draft={draft}
              key={question.id}
              onBlur={onBlur}
              onChange={onChange}
              question={question}
              sharedBudgetPending={question.requiresSharedBudget && hasCommonExpensesFollowup}
            />
          ))}
        </div>
      </section>
    </form>
  );
}
