import type { DeepInputV3 } from "@/entities/deep-input";
import { createFundingId } from "@/shared/lib";
import { AmountField, type AmountValue } from "@/shared/ui/amount-field";
import { fieldClassName } from "@/shared/ui/field";

type Amount = AmountValue;
type Debt = NonNullable<DeepInputV3["debts"]>[number];
type Asset = NonNullable<DeepInputV3["assets"]>[number];
type ExpenseCategory = "communication" | "insurance" | "subscriptions" | "familySupport" | "other";
type VariableExpenseCategory = "food" | "transport" | "shopping" | "leisure" | "other";

const fixedExpenseFields: Array<{ key: ExpenseCategory; label: string }> = [
  { key: "communication", label: "통신" },
  { key: "insurance", label: "보험" },
  { key: "subscriptions", label: "구독" },
  { key: "familySupport", label: "가족 지원" },
  { key: "other", label: "기타 고정 지출" },
];

const variableExpenseFields: Array<{ key: VariableExpenseCategory; label: string }> = [
  { key: "food", label: "식비" },
  { key: "transport", label: "교통" },
  { key: "shopping", label: "쇼핑" },
  { key: "leisure", label: "여가" },
  { key: "other", label: "기타 변동 지출" },
];

const assetKinds = [
  ["cashSavings", "현금·예적금"],
  ["rentalDeposit", "임대보증금"],
  ["investments", "투자자산"],
  ["subscription", "청약"],
  ["realEstate", "부동산"],
  ["other", "기타"],
] as const;

const emptyAmount = (): Amount => ({ status: "unknown", value: null, precision: "exact" });

const amountOrUnknown = (amount: Amount | undefined): Amount => amount ?? emptyAmount();

function ChoiceField({
  label,
  name,
  options,
  value,
  onChange,
  onBlur,
  disabled,
}: {
  label: string;
  name: string;
  options: ReadonlyArray<{ label: string; value: string }>;
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  disabled: boolean;
}) {
  return (
    <fieldset className="space-y-3" disabled={disabled}>
      <legend className="text-sm font-semibold text-ink">{label}</legend>
      <div className="flex flex-wrap gap-3">
        {options.map((option) => (
          <label className={`${fieldClassName} flex items-center gap-2 text-sm font-semibold`} key={option.value}>
            <input
              checked={value === option.value}
              name={name}
              onBlur={onBlur}
              onChange={() => onChange(option.value)}
              type="radio"
              value={option.value}
            />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function ExpenseFields({
  fields,
  values,
  onChange,
  onBlur,
  disabled,
}: {
  fields: ReadonlyArray<{ key: string; label: string }>;
  values: Record<string, Amount>;
  onChange: (key: string, value: Amount) => void;
  onBlur: () => void;
  disabled: boolean;
}) {
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      {fields.map(({ key, label }) => (
        <AmountField
          key={key}
          disabled={disabled}
          label={label}
          onBlur={onBlur}
          onChange={(value) => onChange(key, value)}
          value={amountOrUnknown(values[key])}
        />
      ))}
    </div>
  );
}

function DebtCard({
  debt,
  index,
  onChange,
  onRemove,
  onBlur,
  disabled,
}: {
  debt: Debt;
  index: number;
  onChange: (nextDebt: Debt) => void;
  onRemove: () => void;
  onBlur: () => void;
  disabled: boolean;
}) {
  const update = <Key extends keyof Debt>(key: Key, value: Debt[Key]) => onChange({ ...debt, [key]: value, disposition: "keep" });

  return (
    <article className="space-y-5 rounded-card border border-border-soft bg-card p-5" aria-labelledby={`deep-debt-heading-${index}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-extrabold" id={`deep-debt-heading-${index}`}>부채 {index + 1}</h3>
        <button
          aria-label={`부채 ${index + 1} 삭제`}
          className="rounded-control px-3 py-2 text-sm font-bold text-red-700 hover:bg-red-50 disabled:opacity-50"
          disabled={disabled}
          onClick={onRemove}
          type="button"
        >
          삭제
        </button>
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="space-y-2 text-sm font-semibold" htmlFor={`deep-debt-type-${index}`}>
          <span className="block">부채 종류</span>
          <input className={fieldClassName} disabled={disabled} id={`deep-debt-type-${index}`} onBlur={onBlur} onChange={(event) => update("type", event.currentTarget.value)} value={debt.type} />
        </label>
        <label className="space-y-2 text-sm font-semibold" htmlFor={`deep-debt-repayment-${index}`}>
          <span className="block">상환 방식</span>
          <select className={fieldClassName} disabled={disabled} id={`deep-debt-repayment-${index}`} onBlur={onBlur} onChange={(event) => update("repaymentType", event.currentTarget.value as Debt["repaymentType"])} value={debt.repaymentType}>
            <option value="equalPayment">원리금균등</option>
            <option value="equalPrincipal">원금균등</option>
            <option value="bulletMaturity">만기일시</option>
            <option value="unknown">모르겠어요</option>
          </select>
        </label>
        <AmountField disabled={disabled} label={`부채 ${index + 1} 남은 잔액`} onBlur={onBlur} onChange={(value) => update("balance", value)} value={amountOrUnknown(debt.balance)} />
        <AmountField disabled={disabled} label={`부채 ${index + 1} 월 납입액`} onBlur={onBlur} onChange={(value) => update("monthlyPayment", value)} value={amountOrUnknown(debt.monthlyPayment)} />
        <label className="space-y-2 text-sm font-semibold" htmlFor={`deep-debt-rate-${index}`}>
          <span className="block">연이율</span>
          <input className={fieldClassName} disabled={disabled} id={`deep-debt-rate-${index}`} inputMode="decimal" onBlur={onBlur} onChange={(event) => update("annualRate", event.currentTarget.value || null)} placeholder="입력하지 않아도 돼요" value={debt.annualRate ?? ""} />
        </label>
        <label className="space-y-2 text-sm font-semibold" htmlFor={`deep-debt-months-${index}`}>
          <span className="block">남은 개월</span>
          <input className={fieldClassName} disabled={disabled} id={`deep-debt-months-${index}`} inputMode="numeric" min={1} max={1200} onBlur={onBlur} onChange={(event) => update("remainingMonths", event.currentTarget.value === "" ? null : Number(event.currentTarget.value))} type="number" value={debt.remainingMonths ?? ""} />
        </label>
      </div>
      <p className="text-sm leading-relaxed text-ink-muted">함께 살기 시작한 뒤에도 현재 부채는 유지하는 입력으로 저장돼요.</p>
    </article>
  );
}

function AssetCard({
  asset,
  index,
  onChange,
  onRemove,
  onBlur,
  disabled,
}: {
  asset: Asset;
  index: number;
  onChange: (nextAsset: Asset) => void;
  onRemove: () => void;
  onBlur: () => void;
  disabled: boolean;
}) {
  const update = <Key extends keyof Asset>(key: Key, value: Asset[Key]) => onChange({ ...asset, [key]: value, housingAllocationWon: 0, goalAllocationWon: 0 });

  return (
    <article className="space-y-5 rounded-card border border-border-soft bg-card p-5" aria-labelledby={`deep-asset-heading-${index}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-extrabold" id={`deep-asset-heading-${index}`}>자산 {index + 1}</h3>
        <button
          aria-label={`자산 ${index + 1} 삭제`}
          className="rounded-control px-3 py-2 text-sm font-bold text-red-700 hover:bg-red-50 disabled:opacity-50"
          disabled={disabled}
          onClick={onRemove}
          type="button"
        >
          삭제
        </button>
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="space-y-2 text-sm font-semibold" htmlFor={`deep-asset-kind-${index}`}>
          <span className="block">자산 종류</span>
          <select className={fieldClassName} disabled={disabled} id={`deep-asset-kind-${index}`} onBlur={onBlur} onChange={(event) => update("kind", event.currentTarget.value as Asset["kind"])} value={asset.kind}>
            {assetKinds.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="space-y-2 text-sm font-semibold" htmlFor={`deep-asset-date-${index}`}>
          <span className="block">사용 가능일</span>
          <input className={fieldClassName} disabled={disabled} id={`deep-asset-date-${index}`} onBlur={onBlur} onChange={(event) => update("availableOn", event.currentTarget.value || null)} type="date" value={asset.availableOn ?? ""} />
        </label>
        <div className="sm:col-span-2">
          <AmountField disabled={disabled} label={`자산 ${index + 1} 잔액 또는 평가액`} onBlur={onBlur} onChange={(value) => update("balance", value)} value={amountOrUnknown(asset.balance)} />
        </div>
      </div>
    </article>
  );
}

export interface DeepInputFormProps {
  disabled?: boolean;
  onBlur: () => void;
  onChange: (nextDraft: DeepInputV3) => void;
  draft: DeepInputV3;
}

export function DeepInputForm({ disabled = false, onBlur, onChange, draft }: DeepInputFormProps) {
  const income = draft.income ?? { bonusIncludedInMonthlyIncome: false };
  const debts = draft.debts ?? [];
  const assets = draft.assets ?? [];

  const updateIncome = <Key extends keyof NonNullable<DeepInputV3["income"]>>(key: Key, value: NonNullable<DeepInputV3["income"]>[Key]) => {
    onChange({ ...draft, income: { ...income, [key]: value } });
  };

  const updateFixedExpense = (key: string, value: Amount) => onChange({ ...draft, fixedExpenses: { ...draft.fixedExpenses, [key]: value } });
  const updateVariableExpense = (key: string, value: Amount) => onChange({ ...draft, variableExpenses: { ...draft.variableExpenses, [key]: value } });

  const setDebtStatus = (value: DeepInputV3["debtsStatus"]) => onChange({ ...draft, debtsStatus: value });
  const addDebt = () => onChange({
    ...draft,
    debtsStatus: "known",
    debts: [...debts, { id: createFundingId("debt"), type: "", balance: emptyAmount(), monthlyPayment: emptyAmount(), annualRate: null, remainingMonths: null, repaymentType: "unknown", disposition: "keep" }],
  });
  const updateDebt = (index: number, nextDebt: Debt) => onChange({ ...draft, debts: debts.map((debt, debtIndex) => debtIndex === index ? nextDebt : debt) });
  const removeDebt = (index: number) => onChange({ ...draft, debts: debts.filter((_, debtIndex) => debtIndex !== index) });

  const setAssetStatus = (value: DeepInputV3["assetsStatus"]) => onChange({ ...draft, assetsStatus: value });
  const addAsset = () => onChange({
    ...draft,
    assetsStatus: "known",
    assets: [...assets, { id: createFundingId("asset"), kind: "cashSavings", balance: emptyAmount(), availableOn: null, housingAllocationWon: 0, goalAllocationWon: 0 }],
  });
  const updateAsset = (index: number, nextAsset: Asset) => onChange({ ...draft, assets: assets.map((asset, assetIndex) => assetIndex === index ? nextAsset : asset) });
  const removeAsset = (index: number) => onChange({ ...draft, assets: assets.filter((_, assetIndex) => assetIndex !== index) });

  return (
    <form className="flex flex-col gap-10" onSubmit={(event) => event.preventDefault()}>
      <section className="space-y-5" aria-labelledby="deep-living-heading">
        <div className="space-y-2"><h2 className="text-xl font-extrabold" id="deep-living-heading">생활과 소득</h2><p className="text-sm leading-relaxed text-ink-muted">지금의 생활과 소득을 알려 주세요. 모르는 내용은 모름으로 남겨도 돼요.</p></div>
        <ChoiceField
          disabled={disabled}
          label="지금 두 분은 함께 살고 있나요?"
          name="livingTogether"
          onBlur={onBlur}
          onChange={(value) => onChange({ ...draft, livingTogether: value === "yes" ? true : value === "no" ? false : null })}
          options={[{ label: "예", value: "yes" }, { label: "아니요", value: "no" }, { label: "아직 답하기 어려워요", value: "unknown" }]}
          value={draft.livingTogether === true ? "yes" : draft.livingTogether === false ? "no" : "unknown"}
        />
        <div className="grid gap-5 sm:grid-cols-2">
          <AmountField disabled={disabled} label="세후 월 소득" onBlur={onBlur} onChange={(value) => updateIncome("monthlyNetIncome", value)} value={amountOrUnknown(income.monthlyNetIncome)} />
          <AmountField disabled={disabled} label="연간 세후 상여금" onBlur={onBlur} onChange={(value) => updateIncome("annualNetBonus", value)} value={amountOrUnknown(income.annualNetBonus)} />
        </div>
        <ChoiceField
          disabled={disabled}
          label="월 소득에 상여금을 이미 나눠 넣었나요?"
          name="bonusIncludedInMonthlyIncome"
          onBlur={onBlur}
          onChange={(value) => updateIncome("bonusIncludedInMonthlyIncome", value === "yes")}
          options={[{ label: "예", value: "yes" }, { label: "아니요", value: "no" }]}
          value={income.bonusIncludedInMonthlyIncome ? "yes" : "no"}
        />
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="space-y-2 text-sm font-semibold" htmlFor="deep-bonus-month"><span className="block">상여금은 몇 월에 들어오나요?</span><select className={fieldClassName} disabled={disabled} id="deep-bonus-month" onBlur={onBlur} onChange={(event) => updateIncome("bonusMonth", event.currentTarget.value === "" ? null : Number(event.currentTarget.value))} value={income.bonusMonth ?? ""}><option value="">아직 모르겠어요</option>{Array.from({ length: 12 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}월</option>)}</select></label>
          <label className="space-y-2 text-sm font-semibold" htmlFor="deep-reference-month"><span className="block">소득 기준월</span><input className={fieldClassName} disabled={disabled} id="deep-reference-month" onBlur={onBlur} onChange={(event) => updateIncome("referenceMonth", event.currentTarget.value || null)} type="month" value={income.referenceMonth ?? ""} /></label>
        </div>
      </section>

      <section className="space-y-5" aria-labelledby="deep-expense-heading">
        <div className="space-y-2"><h2 className="text-xl font-extrabold" id="deep-expense-heading">월 지출</h2><p className="text-sm leading-relaxed text-ink-muted">매달 고정으로 나가는 돈과 달라지는 지출을 나누어 적어요.</p></div>
        <h3 className="text-lg font-extrabold">매달 고정으로 나가는 돈</h3>
        <ExpenseFields disabled={disabled} fields={fixedExpenseFields} onBlur={onBlur} onChange={updateFixedExpense} values={draft.fixedExpenses ?? {}} />
        <h3 className="text-lg font-extrabold">매달 달라지는 지출</h3>
        <ExpenseFields disabled={disabled} fields={variableExpenseFields} onBlur={onBlur} onChange={updateVariableExpense} values={draft.variableExpenses ?? {}} />
        <AmountField disabled={disabled} label="현재 본인 부담 주거비" onBlur={onBlur} onChange={(value) => onChange({ ...draft, housingCost: value })} value={amountOrUnknown(draft.housingCost)} />
      </section>

      <section className="space-y-5" aria-labelledby="deep-debt-heading">
        <div className="flex flex-wrap items-center justify-between gap-3"><div className="space-y-2"><h2 className="text-xl font-extrabold" id="deep-debt-heading">부채</h2><p className="text-sm leading-relaxed text-ink-muted">현재 갚아야 할 돈이 있다면 종류와 조건을 적어요.</p></div><button className="min-h-10 rounded-control border border-border px-4 py-2 text-sm font-bold hover:border-purple-strong disabled:opacity-50" disabled={disabled || debts.length >= 30} onClick={addDebt} type="button">부채 추가</button></div>
        <label className="space-y-2 text-sm font-semibold" htmlFor="deep-debts-status"><span className="block">현재 갚아야 할 돈이 있나요?</span><select className={fieldClassName} disabled={disabled} id="deep-debts-status" onBlur={onBlur} onChange={(event) => setDebtStatus(event.currentTarget.value as DeepInputV3["debtsStatus"])} value={draft.debtsStatus}><option value="known">있음·확인했어요</option><option value="unknown">모르겠어요</option><option value="withheld">공개하지 않을게요</option></select></label>
        {debts.length === 0 ? <p className="text-sm text-ink-muted">등록한 부채가 없어요. 확인한 뒤 부채 추가를 눌러 주세요.</p> : <div className="flex flex-col gap-5">{debts.map((debt, index) => <DebtCard debt={debt} disabled={disabled} index={index} key={debt.id} onBlur={onBlur} onChange={(nextDebt) => updateDebt(index, nextDebt)} onRemove={() => removeDebt(index)} />)}</div>}
      </section>

      <section className="space-y-5" aria-labelledby="deep-assets-heading">
        <div className="flex flex-wrap items-center justify-between gap-3"><div className="space-y-2"><h2 className="text-xl font-extrabold" id="deep-assets-heading">자산</h2><p className="text-sm leading-relaxed text-ink-muted">현재 가진 자산의 잔액과 사용할 수 있는 날짜를 적어요. 이번 계획에 배분하는 내용은 다음 단계에서 다루지 않아요.</p></div><button className="min-h-10 rounded-control border border-border px-4 py-2 text-sm font-bold hover:border-purple-strong disabled:opacity-50" disabled={disabled || assets.length >= 100} onClick={addAsset} type="button">자산 추가</button></div>
        <label className="space-y-2 text-sm font-semibold" htmlFor="deep-assets-status"><span className="block">현재 가진 자산을 확인했나요?</span><select className={fieldClassName} disabled={disabled} id="deep-assets-status" onBlur={onBlur} onChange={(event) => setAssetStatus(event.currentTarget.value as DeepInputV3["assetsStatus"])} value={draft.assetsStatus}><option value="known">확인했어요</option><option value="unknown">모르겠어요</option><option value="withheld">공개하지 않을게요</option></select></label>
        {assets.length === 0 ? <p className="text-sm text-ink-muted">등록한 자산이 없어요. 확인한 뒤 자산 추가를 눌러 주세요.</p> : <div className="flex flex-col gap-5">{assets.map((asset, index) => <AssetCard asset={asset} disabled={disabled} index={index} key={asset.id} onBlur={onBlur} onChange={(nextAsset) => updateAsset(index, nextAsset)} onRemove={() => removeAsset(index)} />)}</div>}
      </section>
    </form>
  );
}
