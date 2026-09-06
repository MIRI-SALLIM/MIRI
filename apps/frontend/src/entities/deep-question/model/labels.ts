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

export const deepContributionMeaningLabels = {
  initialProposal: "이 금액부터 이야기해 보고 싶어요",
  selfReportedLimit: "이번 대화에서 제안할 수 있는 최대 금액이에요",
  unknown: "아직 모르겠어요",
} as const;

export const deepMeetingFactLabels = {
  budget: "공동 예산",
  offered_total: "제안한 분담액 합계",
  contribution_gap: "분담 공백",
  excess: "예산보다 남는 금액",
  contribution_a: "A의 제안 분담액",
  contribution_b: "B의 제안 분담액",
  expected_a_for_b: "A가 B에게 기대한 분담액",
  expected_b_for_a: "B가 A에게 기대한 분담액",
  expectation_a: "A의 기대와 B의 제안 차이",
  expectation_b: "B의 기대와 A의 제안 차이",
  housing_required: "필요한 주거자금",
  housing_available: "확정 주거자금",
  housing_gap: "주거자금 공백",
  housing_expected: "예상 주거자금",
  housing_gap_with_expected: "예상 자금 반영 후 주거자금 공백",
  monthly_surplus: "계획 후 월 잔액",
  goal_required_saving: "목표에 필요한 월 적립액",
  goal_saving_gap: "목표 월 적립 부족액",
} as const;

export const deepMeetingIssueLabels = {
  contribution_gap: "분담 공백",
  contribution_unknown: "분담 확인 필요",
  excess_contributions: "분담액이 예산을 초과함",
  expectation_a: "A의 기대와 B의 제안 차이",
  expectation_b: "B의 기대와 A의 제안 차이",
  housing_gap: "주거자금 공백",
  housing_unknown: "주거자금 확인 필요",
  housing_expected: "예상 주거자금 확인",
  monthly_deficit: "월 적자",
  cashflow_unknown: "월 잔액 확인 필요",
  goal_saving_gap: "목표 적립 부족",
  goal_unknown: "목표 확인 필요",
  condition_discussion: "조건 논의 필요",
} as const;
