import { useState, type FormEvent } from "react";

import {
  agreementContentSchema,
  decisionTermsSchema,
  type DecisionTerms,
  type DeepAgreement,
} from "@/entities/deep-agreement";
import {
  deepAgreementOwnerLabels,
  deepAgreementTopicLabels,
  deepCommonCategoryLabels,
} from "@/entities/deep-question";
import { Button } from "@/shared/ui/button";
import { fieldClassName } from "@/shared/ui/field";

type AgreementTopic = DecisionTerms["topic"];
type AgreementOwner = DecisionTerms["owner"];
type CommonCategory = NonNullable<DecisionTerms["commonScope"]>[number];

export interface AgreementDraft {
  text: string;
  reviewOn: string | null;
  terms: DecisionTerms;
}

export interface AgreementFormProps {
  initialAgreement?: DeepAgreement;
  isPending?: boolean;
  mode: "create" | "edit";
  onCancel: () => void;
  onSubmit: (draft: AgreementDraft) => void;
}

interface FormValues {
  commonScope: CommonCategory[];
  dueDay: string;
  exceptions: string;
  monthlyA: string;
  monthlyB: string;
  owner: AgreementOwner;
  reviewOn: string;
  scope: string;
  startMonth: string;
  text: string;
  topic: AgreementTopic;
}

const defaultFormValues: FormValues = {
  commonScope: [],
  dueDay: "",
  exceptions: "",
  monthlyA: "",
  monthlyB: "",
  owner: "both",
  reviewOn: "",
  scope: "",
  startMonth: "",
  text: "",
  topic: "monthlyContribution",
};

const toFormValues = (agreement?: DeepAgreement): FormValues => {
  if (agreement === undefined) return defaultFormValues;

  const terms = agreement.terms;
  return {
    commonScope: [...(terms.commonScope ?? [])] as CommonCategory[],
    dueDay: terms.dueDay === null || terms.dueDay === undefined ? "" : String(terms.dueDay),
    exceptions: terms.exceptions ?? "",
    monthlyA: terms.monthlyContributions?.A === undefined ? "" : String(terms.monthlyContributions.A),
    monthlyB: terms.monthlyContributions?.B === undefined ? "" : String(terms.monthlyContributions.B),
    owner: terms.owner,
    reviewOn: agreement.reviewOn ?? "",
    scope: terms.scope,
    startMonth: terms.startMonth,
    text: agreement.text,
    topic: terms.topic,
  };
};

const validationMessage = (issues: Array<{ message: string }>): string => {
  const messages: Record<string, string> = {
    BOTH_CONTRIBUTIONS_REQUIRED: "A와 B의 월 분담액을 모두 입력해 주세요.",
    COMMON_SCOPE_REQUIRES_MONTHLY_TOPIC: "공동비 포함 항목은 월 분담 주제에서만 선택할 수 있어요.",
    CONTRIBUTIONS_REQUIRE_MONTHLY_TOPIC: "월 분담액은 월 분담 주제에서만 입력할 수 있어요.",
    DUPLICATE_COMMON_SCOPE: "공동비 포함 항목은 중복해서 선택할 수 없어요.",
    "Invalid input": "입력한 내용을 확인해 주세요.",
  };
  const knownMessage = issues.map((issue) => messages[issue.message]).find((message) => message !== undefined);
  return knownMessage ?? "입력한 내용을 확인해 주세요.";
};

const parseOptionalAmount = (raw: string): number | undefined => {
  if (raw.trim() === "") return undefined;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value >= 0 ? value : Number.NaN;
};

function TextField({
  disabled,
  id,
  label,
  maxLength,
  onChange,
  value,
}: {
  disabled: boolean;
  id: string;
  label: string;
  maxLength: number;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className="space-y-2 text-sm font-semibold" htmlFor={id}>
      <span className="block">{label}</span>
      <textarea
        aria-label={label}
        className={`${fieldClassName} min-h-24 resize-y`}
        disabled={disabled}
        id={id}
        maxLength={maxLength}
        onChange={(event) => onChange(event.currentTarget.value)}
        value={value}
      />
      <span className="block text-right text-xs font-normal text-ink-muted">{value.length}/{maxLength}</span>
    </label>
  );
}

function MonthlyContributionFields({
  commonScope,
  disabled,
  monthlyA,
  monthlyB,
  onMonthlyAChange,
  onMonthlyBChange,
  onToggleCommonScope,
}: {
  commonScope: CommonCategory[];
  disabled: boolean;
  monthlyA: string;
  monthlyB: string;
  onMonthlyAChange: (value: string) => void;
  onMonthlyBChange: (value: string) => void;
  onToggleCommonScope: (category: CommonCategory) => void;
}) {
  return (
    <div className="space-y-5 rounded-card border border-purple-200 bg-purple-tint p-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-2 text-sm font-semibold" htmlFor="agreement-monthly-a">
          <span className="block">A 월 분담액</span>
          <div className="relative">
            <input
              aria-label="A 월 분담액"
              className={`${fieldClassName} pr-10 text-right tabular-nums`}
              disabled={disabled}
              id="agreement-monthly-a"
              inputMode="numeric"
              min={0}
              onChange={(event) => onMonthlyAChange(event.currentTarget.value.replace(/[^0-9]/g, ""))}
              type="number"
              value={monthlyA}
            />
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-ink-muted" aria-hidden="true">원</span>
          </div>
        </label>
        <label className="space-y-2 text-sm font-semibold" htmlFor="agreement-monthly-b">
          <span className="block">B 월 분담액</span>
          <div className="relative">
            <input
              aria-label="B 월 분담액"
              className={`${fieldClassName} pr-10 text-right tabular-nums`}
              disabled={disabled}
              id="agreement-monthly-b"
              inputMode="numeric"
              min={0}
              onChange={(event) => onMonthlyBChange(event.currentTarget.value.replace(/[^0-9]/g, ""))}
              type="number"
              value={monthlyB}
            />
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-ink-muted" aria-hidden="true">원</span>
          </div>
        </label>
      </div>
      <fieldset className="space-y-2" disabled={disabled}>
        <legend className="text-sm font-semibold">공동비 포함 항목</legend>
        <div className="flex flex-wrap gap-2" role="group" aria-label="공동비 포함 항목">
          {Object.entries(deepCommonCategoryLabels).map(([category, label]) => {
            const typedCategory = category as CommonCategory;
            const selected = commonScope.includes(typedCategory);
            return (
              <button
                aria-pressed={selected}
                className={`min-h-11 rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${selected ? "border-purple-strong bg-card text-purple-strong" : "border-border bg-card text-ink-muted hover:border-purple"}`}
                key={category}
                onClick={() => onToggleCommonScope(typedCategory)}
                type="button"
              >
                {label}
              </button>
            );
          })}
        </div>
      </fieldset>
    </div>
  );
}

export function AgreementForm({
  initialAgreement,
  isPending = false,
  mode,
  onCancel,
  onSubmit,
}: AgreementFormProps) {
  const [values, setValues] = useState<FormValues>(() => toFormValues(initialAgreement));
  const [error, setError] = useState<string | null>(null);

  const update = <Key extends keyof FormValues>(key: Key, value: FormValues[Key]) => {
    setValues((current) => ({ ...current, [key]: value }));
    setError(null);
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const monthlyA = parseOptionalAmount(values.monthlyA);
    const monthlyB = parseOptionalAmount(values.monthlyB);
    const termsResult = decisionTermsSchema.safeParse({
      commonScope: values.topic === "monthlyContribution" ? values.commonScope : [],
      dueDay: values.dueDay.trim() === "" ? null : Number(values.dueDay),
      exceptions: values.exceptions,
      monthlyContributions: values.topic === "monthlyContribution"
        ? { ...(monthlyA === undefined ? {} : { A: monthlyA }), ...(monthlyB === undefined ? {} : { B: monthlyB }) }
        : {},
      owner: values.owner,
      scope: values.scope,
      startMonth: values.startMonth,
      topic: values.topic,
    });
    const contentResult = agreementContentSchema.safeParse({
      reviewOn: values.reviewOn.trim() === "" ? null : values.reviewOn,
      text: values.text,
    });

    if (!termsResult.success || !contentResult.success || Number.isNaN(monthlyA) || Number.isNaN(monthlyB)) {
      const issues = [
        ...(termsResult.success ? [] : termsResult.error.issues),
        ...(contentResult.success ? [] : contentResult.error.issues),
        ...(Number.isNaN(monthlyA) || Number.isNaN(monthlyB) ? [{ message: "Invalid input" }] : []),
      ];
      setError(validationMessage(issues));
      return;
    }

    onSubmit({
      reviewOn: contentResult.data.reviewOn ?? null,
      terms: termsResult.data as DecisionTerms,
      text: contentResult.data.text,
    });
  };

  return (
    <form className="space-y-5 rounded-card border border-purple-200 bg-card p-5 sm:p-6" onSubmit={submit}>
      <div className="space-y-2">
        <h2 className="text-xl font-extrabold">{mode === "create" ? "새 기준 제안" : "기준 수정"}</h2>
        <p className="text-sm leading-relaxed text-ink-muted">두 분이 함께 확인할 내용을 구체적으로 적어 주세요.</p>
      </div>

      {error ? <p aria-live="polite" className="rounded-control border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-800" role="alert">{error}</p> : null}

      <TextField
        disabled={isPending}
        id="agreement-text"
        label="기준 내용"
        maxLength={1000}
        onChange={(value) => update("text", value)}
        value={values.text}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-2 text-sm font-semibold" htmlFor="agreement-topic">
          <span className="block">주제</span>
          <select
            aria-label="주제"
            className={fieldClassName}
            disabled={isPending}
            id="agreement-topic"
            onChange={(event) => {
              const topic = event.currentTarget.value as AgreementTopic;
              setValues((current) => ({ ...current, commonScope: [], monthlyA: "", monthlyB: "", topic }));
              setError(null);
            }}
            value={values.topic}
          >
            {Object.entries(deepAgreementTopicLabels).map(([topic, label]) => <option key={topic} value={topic}>{label}</option>)}
          </select>
        </label>
        <label className="space-y-2 text-sm font-semibold" htmlFor="agreement-owner">
          <span className="block">담당</span>
          <select aria-label="담당" className={fieldClassName} disabled={isPending} id="agreement-owner" onChange={(event) => update("owner", event.currentTarget.value as AgreementOwner)} value={values.owner}>
            {Object.entries(deepAgreementOwnerLabels).map(([owner, label]) => <option key={owner} value={owner}>{label}</option>)}
          </select>
        </label>
      </div>
      <TextField
        disabled={isPending}
        id="agreement-scope"
        label="정한 범위"
        maxLength={300}
        onChange={(value) => update("scope", value)}
        value={values.scope}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-2 text-sm font-semibold" htmlFor="agreement-start-month">
          <span className="block">시작월</span>
          <input aria-label="시작월" className={fieldClassName} disabled={isPending} id="agreement-start-month" onChange={(event) => update("startMonth", event.currentTarget.value)} type="month" value={values.startMonth} />
        </label>
        <label className="space-y-2 text-sm font-semibold" htmlFor="agreement-due-day">
          <span className="block">납부일</span>
          <input aria-label="납부일" className={fieldClassName} disabled={isPending} id="agreement-due-day" inputMode="numeric" max={31} min={1} onChange={(event) => update("dueDay", event.currentTarget.value.replace(/[^0-9]/g, ""))} type="number" value={values.dueDay} />
        </label>
      </div>

      {values.topic === "monthlyContribution" ? (
        <MonthlyContributionFields
          commonScope={values.commonScope}
          disabled={isPending}
          monthlyA={values.monthlyA}
          monthlyB={values.monthlyB}
          onMonthlyAChange={(value) => update("monthlyA", value)}
          onMonthlyBChange={(value) => update("monthlyB", value)}
          onToggleCommonScope={(category) => update("commonScope", values.commonScope.includes(category)
            ? values.commonScope.filter((currentCategory) => currentCategory !== category)
            : [...values.commonScope, category])}
        />
      ) : null}

      <TextField
        disabled={isPending}
        id="agreement-exceptions"
        label="예외"
        maxLength={300}
        onChange={(value) => update("exceptions", value)}
        value={values.exceptions}
      />
      <label className="space-y-2 text-sm font-semibold" htmlFor="agreement-review-on">
        <span className="block">다시 볼 날짜</span>
        <input aria-label="다시 볼 날짜" className={fieldClassName} disabled={isPending} id="agreement-review-on" onChange={(event) => update("reviewOn", event.currentTarget.value)} type="date" value={values.reviewOn} />
        <span className="block text-xs font-normal text-ink-muted">없으면 비워 두어도 돼요.</span>
      </label>
      <div className="flex flex-wrap gap-3 border-t border-border-soft pt-4">
        <Button disabled={isPending} type="submit">{isPending ? "저장하는 중이에요" : mode === "create" ? "기준 제안하기" : "수정 저장하기"}</Button>
        <Button disabled={isPending} onClick={onCancel} variant="secondary">취소</Button>
      </div>
    </form>
  );
}
