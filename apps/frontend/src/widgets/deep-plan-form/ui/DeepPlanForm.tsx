import type { ChangeEvent } from "react";

import type { SharedPlanV3 } from "@/entities/deep-plan";

type Amount = NonNullable<SharedPlanV3["monthlyHousingCost"]>;
type Deadline = NonNullable<SharedPlanV3["fundingDeadlines"]>[number];
type CommonExpenseCategory = "housing" | "food" | "transport" | "subscriptions" | "gifts" | "other";

const commonExpenseFields: Array<{ key: CommonExpenseCategory; label: string }> = [
  { key: "housing", label: "주거" },
  { key: "food", label: "식비" },
  { key: "transport", label: "교통" },
  { key: "subscriptions", label: "구독" },
  { key: "gifts", label: "경조사·선물" },
  { key: "other", label: "기타" },
];

const amountStateOptions = [
  { value: "known-exact", label: "정확히 앎" },
  { value: "known-estimate", label: "대략 앎" },
  { value: "unknown", label: "모름" },
  { value: "withheld", label: "공개하지 않음" },
  { value: "zero", label: "0원" },
] as const;

type AmountState = (typeof amountStateOptions)[number]["value"];

const emptyAmount = (): Amount => ({ status: "unknown", value: null, precision: "exact" });

function amountState(amount: Amount): AmountState {
  if (amount.status === "withheld") return "withheld";
  if (amount.status === "unknown") return "unknown";
  if (amount.value === 0) return "zero";
  return amount.precision === "estimate" ? "known-estimate" : "known-exact";
}

function amountFromState(state: AmountState, previous: Amount): Amount {
  if (state === "unknown") return { ...previous, status: "unknown", value: null };
  if (state === "withheld") return { ...previous, status: "withheld", value: null };
  if (state === "zero") return { status: "known", precision: "exact", value: 0 };

  return {
    status: "known",
    precision: state === "known-estimate" ? "estimate" : "exact",
    value: previous.status === "known" && previous.value !== null && previous.value !== undefined ? previous.value : 0,
  };
}

function AmountEditor({ label, value, onChange, disabled = false }: {
  label: string;
  value: Amount | undefined;
  onChange: (value: Amount) => void;
  disabled?: boolean;
}) {
  const amount = value ?? emptyAmount();

  const changeValue = (event: ChangeEvent<HTMLInputElement>) => {
    const raw = event.currentTarget.value.replace(/[^0-9]/g, "");
    if (raw === "") {
      onChange({ ...amount, status: "unknown", value: null });
      return;
    }

    const numericValue = Number(raw);
    if (Number.isSafeInteger(numericValue)) {
      onChange({ ...amount, status: "known", value: numericValue });
    }
  };

  return (
    <div className="space-y-2">
      <label className="text-sm font-semibold text-ink" htmlFor={`plan-amount-${label}`}>
        {label}
      </label>
      <select
        aria-label={`${label} 상태`}
        className="min-h-11 w-full rounded-control border border-border-control bg-card px-3 py-2 outline-none focus:border-purple-strong focus:shadow-focus"
        disabled={disabled}
        onChange={(event) => onChange(amountFromState(event.currentTarget.value as AmountState, amount))}
        value={amountState(amount)}
      >
        {amountStateOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      <div className="relative">
        <input
          aria-label={label}
          className="min-h-11 w-full rounded-control border border-border-control bg-card px-3 py-2 pr-10 text-right tabular-nums outline-none focus:border-purple-strong focus:shadow-focus disabled:bg-border-soft"
          disabled={disabled || amount.status !== "known"}
          id={`plan-amount-${label}`}
          inputMode="numeric"
          min={0}
          onChange={changeValue}
          type="number"
          value={amount.status === "known" ? amount.value ?? "" : ""}
        />
        <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-ink-muted">원</span>
      </div>
    </div>
  );
}

function updateDeadline(deadlines: Deadline[], index: number, patch: Partial<Deadline>): Deadline[] {
  return deadlines.map((deadline, deadlineIndex) => deadlineIndex === index ? { ...deadline, ...patch } : deadline);
}

function newDeadlineId(deadlines: Deadline[]): string {
  let index = deadlines.length + 1;
  while (deadlines.some((deadline) => deadline.id === `deadline-${index}`)) index += 1;
  return `deadline-${index}`;
}

export interface DeepPlanFormProps {
  disabled?: boolean;
  onChange: (plan: SharedPlanV3) => void;
  plan: SharedPlanV3;
}

export function DeepPlanForm({ disabled = false, onChange, plan }: DeepPlanFormProps) {
  const deadlines = plan.fundingDeadlines ?? [];
  const loan = plan.newHousingLoan;
  const target = plan.target;

  const setField = <Key extends keyof SharedPlanV3>(key: Key, value: SharedPlanV3[Key]) => {
    onChange({ ...plan, [key]: value });
  };

  const setCommonExpensesStatus = (status: SharedPlanV3["commonExpensesStatus"]) => {
    onChange({
      ...plan,
      commonExpensesStatus: status,
      commonExpenses: status === "known" ? plan.commonExpenses : {},
    });
  };

  const setCommonExpense = (category: CommonExpenseCategory, amount: Amount) => {
    onChange({ ...plan, commonExpensesStatus: "known", commonExpenses: { ...plan.commonExpenses, [category]: amount } });
  };

  const setLoanEnabled = (enabled: boolean) => {
    onChange({
      ...plan,
      newHousingLoan: enabled
        ? loan ?? { id: "new-housing-loan", type: "housing", disposition: "keep", repaymentType: "unknown", annualRate: null }
        : null,
    });
  };

  const setTargetEnabled = (enabled: boolean) => {
    onChange({ ...plan, target: enabled ? target ?? { title: "", amountWon: 0, targetMonth: plan.startMonth } : null });
  };

  return (
    <form className="flex flex-col gap-8" onSubmit={(event) => event.preventDefault()}>
      <fieldset className="grid gap-5 sm:grid-cols-2" disabled={disabled}>
        <legend className="sr-only">공동 계획 기본 정보</legend>
        <label className="space-y-2 text-sm font-semibold text-ink" htmlFor="plan-start-month">
          <span className="block">언제부터의 생활을 계산할까요?</span>
          <input className="min-h-11 w-full rounded-control border border-border-control bg-card px-3 py-2 outline-none focus:border-purple-strong focus:shadow-focus" id="plan-start-month" onChange={(event) => setField("startMonth", event.currentTarget.value)} type="month" value={plan.startMonth} />
        </label>
        <label className="space-y-2 text-sm font-semibold text-ink" htmlFor="plan-funding-as-of">
          <span className="block">재원 기준일</span>
          <input className="min-h-11 w-full rounded-control border border-border-control bg-card px-3 py-2 outline-none focus:border-purple-strong focus:shadow-focus" id="plan-funding-as-of" onChange={(event) => setField("fundingAsOf", event.currentTarget.value)} type="date" value={plan.fundingAsOf} />
        </label>
        <label className="space-y-2 text-sm font-semibold text-ink sm:col-span-2" htmlFor="plan-housing-type">
          <span className="block">집은 어떻게 할 계획인가요?</span>
          <select className="min-h-11 w-full rounded-control border border-border-control bg-card px-3 py-2 font-normal outline-none focus:border-purple-strong focus:shadow-focus" id="plan-housing-type" onChange={(event) => setField("housingType", event.currentTarget.value as SharedPlanV3["housingType"])} value={plan.housingType}>
            <option value="keep">현재 집 유지</option>
            <option value="rent">월세</option>
            <option value="jeonse">전세</option>
            <option value="buy">매매</option>
          </select>
        </label>
      </fieldset>

      <section className="space-y-5" aria-labelledby="plan-housing-heading">
        <h2 className="text-xl font-extrabold" id="plan-housing-heading">주거 계획과 금액</h2>
        <div className="grid gap-5 sm:grid-cols-2">
          <AmountEditor disabled={disabled} label="함께 산 뒤 월 주거비는 얼마인가요?" onChange={(amount) => setField("monthlyHousingCost", amount)} value={plan.monthlyHousingCost} />
          <AmountEditor disabled={disabled} label="보증금 또는 매매대금은 얼마인가요?" onChange={(amount) => setField("housingPriceWon", amount)} value={plan.housingPriceWon} />
          <AmountEditor disabled={disabled} label="이사·중개·가전 등 한 번만 드는 비용은 얼마인가요?" onChange={(amount) => setField("oneOffCostsWon", amount)} value={plan.oneOffCostsWon} />
        </div>
      </section>

      <section className="space-y-5" aria-labelledby="plan-deadlines-heading">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-extrabold" id="plan-deadlines-heading">돈이 필요한 일정은 어떻게 되나요?</h2>
          <button className="min-h-10 rounded-control border border-border px-4 py-2 text-sm font-bold hover:border-purple-strong disabled:opacity-50" disabled={disabled || deadlines.length >= 120} onClick={() => onChange({ ...plan, fundingDeadlines: [...deadlines, { id: newDeadlineId(deadlines), dueOn: null, amount: emptyAmount() }] })} type="button">납부 일정 추가</button>
        </div>
        {deadlines.length === 0 ? <p className="text-sm text-ink-muted">납부 일정이 없으면 주거자금 부족액을 계산하지 않아요.</p> : null}
        <div className="flex flex-col gap-4">
          {deadlines.map((deadline, index) => (
            <div className="grid gap-3 rounded-card border border-border-soft bg-card p-4 sm:grid-cols-[1fr_1fr_1fr_auto]" key={`${deadline.id}-${index}`}>
              <label className="space-y-2 text-sm font-semibold" htmlFor={`deadline-id-${index}`}>
                <span className="block">납부 ID</span>
                <input className="min-h-11 w-full rounded-control border border-border-control px-3 py-2 font-normal outline-none focus:border-purple-strong focus:shadow-focus" disabled={disabled} id={`deadline-id-${index}`} onChange={(event) => onChange({ ...plan, fundingDeadlines: updateDeadline(deadlines, index, { id: event.currentTarget.value }) })} value={deadline.id} />
              </label>
              <label className="space-y-2 text-sm font-semibold" htmlFor={`deadline-date-${index}`}>
                <span className="block">날짜</span>
                <input className="min-h-11 w-full rounded-control border border-border-control px-3 py-2 font-normal outline-none focus:border-purple-strong focus:shadow-focus" disabled={disabled} id={`deadline-date-${index}`} onChange={(event) => onChange({ ...plan, fundingDeadlines: updateDeadline(deadlines, index, { dueOn: event.currentTarget.value || null }) })} type="date" value={deadline.dueOn ?? ""} />
              </label>
              <AmountEditor disabled={disabled} label={`회차별 금액 ${index + 1}`} onChange={(amount) => onChange({ ...plan, fundingDeadlines: updateDeadline(deadlines, index, { amount }) })} value={deadline.amount} />
              <button aria-label={`납부 일정 ${index + 1} 삭제`} className="self-end rounded-control px-3 py-2 text-sm font-bold text-red-700 hover:bg-red-50 disabled:opacity-50" disabled={disabled} onClick={() => onChange({ ...plan, fundingDeadlines: deadlines.filter((_, deadlineIndex) => deadlineIndex !== index) })} type="button">삭제</button>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-5" aria-labelledby="plan-loan-heading">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-extrabold" id="plan-loan-heading">새 주거대출</h2>
          <label className="flex items-center gap-2 text-sm font-semibold" htmlFor="plan-loan-enabled">
            <input checked={loan !== null && loan !== undefined} disabled={disabled} id="plan-loan-enabled" onChange={(event) => setLoanEnabled(event.currentTarget.checked)} type="checkbox" />
            새 주거대출이 있어요
          </label>
        </div>
        {loan ? (
          <fieldset className="grid gap-5 rounded-card border border-border-soft bg-card p-5 sm:grid-cols-2" disabled={disabled}>
            <legend className="sr-only">새 주거대출 상세 정보</legend>
            <label className="space-y-2 text-sm font-semibold" htmlFor="plan-loan-id"><span className="block">대출 ID</span><input className="min-h-11 w-full rounded-control border border-border-control px-3 py-2 font-normal outline-none focus:border-purple-strong focus:shadow-focus" id="plan-loan-id" onChange={(event) => setField("newHousingLoan", { ...loan, id: event.currentTarget.value })} value={loan.id} /></label>
            <label className="space-y-2 text-sm font-semibold" htmlFor="plan-loan-type"><span className="block">대출 종류</span><input className="min-h-11 w-full rounded-control border border-border-control px-3 py-2 font-normal outline-none focus:border-purple-strong focus:shadow-focus" id="plan-loan-type" onChange={(event) => setField("newHousingLoan", { ...loan, type: event.currentTarget.value })} value={loan.type} /></label>
            <label className="space-y-2 text-sm font-semibold" htmlFor="plan-loan-repayment"><span className="block">상환 방식</span><select className="min-h-11 w-full rounded-control border border-border-control px-3 py-2 font-normal outline-none focus:border-purple-strong focus:shadow-focus" id="plan-loan-repayment" onChange={(event) => setField("newHousingLoan", { ...loan, repaymentType: event.currentTarget.value as typeof loan.repaymentType })} value={loan.repaymentType}><option value="equalPayment">원리금균등</option><option value="equalPrincipal">원금균등</option><option value="bulletMaturity">만기일시</option><option value="unknown">모르겠어요</option></select></label>
            <label className="space-y-2 text-sm font-semibold" htmlFor="plan-loan-rate"><span className="block">금리</span><input className="min-h-11 w-full rounded-control border border-border-control px-3 py-2 font-normal outline-none focus:border-purple-strong focus:shadow-focus" id="plan-loan-rate" onChange={(event) => setField("newHousingLoan", { ...loan, annualRate: event.currentTarget.value || null })} value={loan.annualRate ?? ""} /></label>
            <AmountEditor label="새 주거대출 잔액" onChange={(amount) => setField("newHousingLoan", { ...loan, balance: amount })} value={loan.balance} />
            <AmountEditor label="새 주거대출 월 납입액" onChange={(amount) => setField("newHousingLoan", { ...loan, monthlyPayment: amount })} value={loan.monthlyPayment} />
            <label className="space-y-2 text-sm font-semibold" htmlFor="plan-loan-available"><span className="block">새 대출금은 언제 사용할 수 있나요?</span><input className="min-h-11 w-full rounded-control border border-border-control px-3 py-2 font-normal outline-none focus:border-purple-strong focus:shadow-focus" id="plan-loan-available" onChange={(event) => setField("newLoanAvailableOn", event.currentTarget.value || null)} type="date" value={plan.newLoanAvailableOn ?? ""} /></label>
            <label className="space-y-2 text-sm font-semibold" htmlFor="plan-loan-certainty"><span className="block">새 대출은 얼마나 확실한가요?</span><select className="min-h-11 w-full rounded-control border border-border-control px-3 py-2 font-normal outline-none focus:border-purple-strong focus:shadow-focus" id="plan-loan-certainty" onChange={(event) => setField("newLoanCertainty", event.currentTarget.value as SharedPlanV3["newLoanCertainty"])} value={plan.newLoanCertainty}><option value="confirmed">확인됨</option><option value="expected">예상</option><option value="unknown">모름</option></select></label>
          </fieldset>
        ) : <p className="text-sm text-ink-muted">새 주거대출이 없으면 선택하지 않아도 돼요.</p>}
      </section>

      <section className="space-y-5" aria-labelledby="plan-common-heading">
        <div className="space-y-2"><h2 className="text-xl font-extrabold" id="plan-common-heading">매달 공동으로 낼 항목은 어디까지인가요?</h2><p className="text-sm leading-relaxed text-ink-muted">공동비 범위와 항목별 금액을 각각 알려 주세요.</p></div>
        <label className="space-y-2 text-sm font-semibold" htmlFor="plan-common-status"><span className="block">공동비 범위를 알고 있나요?</span><select className="min-h-11 w-full rounded-control border border-border-control bg-card px-3 py-2 font-normal outline-none focus:border-purple-strong focus:shadow-focus" disabled={disabled} id="plan-common-status" onChange={(event) => setCommonExpensesStatus(event.currentTarget.value as SharedPlanV3["commonExpensesStatus"])} value={plan.commonExpensesStatus}><option value="known">알고 있어요</option><option value="unknown">모르겠어요</option><option value="withheld">공개하지 않을게요</option></select></label>
        <div className="grid gap-5 sm:grid-cols-2">{commonExpenseFields.map(({ key, label }) => <AmountEditor disabled={disabled || plan.commonExpensesStatus !== "known"} key={key} label={`${label} 항목별 금액`} onChange={(amount) => setCommonExpense(key, amount)} value={plan.commonExpenses?.[key]} />)}</div>
      </section>

      <section className="space-y-5" aria-labelledby="plan-target-heading">
        <div className="flex items-center justify-between gap-3"><h2 className="text-xl font-extrabold" id="plan-target-heading">함께 모을 목표가 있나요?</h2><label className="flex items-center gap-2 text-sm font-semibold" htmlFor="plan-target-enabled"><input checked={target !== null && target !== undefined} disabled={disabled} id="plan-target-enabled" onChange={(event) => setTargetEnabled(event.currentTarget.checked)} type="checkbox" />목표가 있어요</label></div>
        {target ? <fieldset className="grid gap-5 rounded-card border border-border-soft bg-card p-5 sm:grid-cols-2" disabled={disabled}><legend className="sr-only">공동 목표 상세</legend><label className="space-y-2 text-sm font-semibold" htmlFor="plan-target-title"><span className="block">목표명</span><input className="min-h-11 w-full rounded-control border border-border-control px-3 py-2 font-normal outline-none focus:border-purple-strong focus:shadow-focus" id="plan-target-title" onChange={(event) => setField("target", { ...target, title: event.currentTarget.value })} value={target.title} /></label><AmountEditor label="목표액" onChange={(amount) => setField("target", { ...target, amountWon: amount.value ?? 0 })} value={{ status: "known", precision: "exact", value: target.amountWon }} /><label className="space-y-2 text-sm font-semibold" htmlFor="plan-target-month"><span className="block">목표월</span><input className="min-h-11 w-full rounded-control border border-border-control px-3 py-2 font-normal outline-none focus:border-purple-strong focus:shadow-focus" id="plan-target-month" onChange={(event) => setField("target", { ...target, targetMonth: event.currentTarget.value })} type="month" value={target.targetMonth} /></label></fieldset> : <p className="text-sm text-ink-muted">함께 모을 목표가 없으면 선택하지 않아도 돼요.</p>}
      </section>
    </form>
  );
}
