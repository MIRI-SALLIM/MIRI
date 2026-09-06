export const deepAreaLabels = {
  savings: "저축",
  spending: "소비",
  investment: "투자",
  debt: "부채",
  jointManagement: "공동관리",
} as const;

export const deepDiscussionStateLabels = {
  notDiscussed: "이야기하지 않음",
  discussing: "이야기 중",
  believeAgreed: "합의했다고 생각함",
  unknown: "모름",
} as const;

export const deepContributionFieldLabels = {
  personalSpendingFloor: "개인 지출 최소액",
  personalSavingFloor: "개인 저축·비상금 최소액",
} as const;

export const deepConstraintKindLabels = {
  housingCost: "주거비",
  debtPayment: "부채 상환",
  borrowing: "차입",
  personalSpending: "개인 지출",
  other: "기타",
} as const;

export const deepConstraintScopeLabels = {
  household: "두 사람 공동",
  self: "본인",
} as const;

export const deepConstraintStrengthLabels = {
  required: "반드시 지켜야 함",
  preferred: "가능하면 지키고 싶음",
} as const;

export const deepConstraintAllowBorrowingLabels = {
  true: "허용",
  false: "허용하지 않음",
  null: "미입력",
} as const;

export const deepAgreementTopicLabels = {
  monthlyContribution: "월 분담",
  housingFunding: "주거자금",
  savings: "저축",
  spending: "소비",
  investment: "투자",
  debt: "부채",
  jointManagement: "공동관리",
  other: "기타",
} as const;

export const deepAgreementOwnerLabels = {
  A: "A",
  B: "B",
  both: "둘 다",
} as const;

export const deepCommonCategoryLabels = {
  housing: "주거",
  food: "식비",
  transport: "교통",
  subscriptions: "구독",
  gifts: "경조사·선물",
  other: "기타",
} as const;

export const deepAgreementStatusLabels = {
  proposed: "제안됨",
  agreed: "둘 다 확인",
  deferred: "보류",
} as const;
