import io
import json
import os
import sys

if sys.platform == "win32" and isinstance(sys.stdout, io.TextIOWrapper):
    sys.stdout.reconfigure(encoding="utf-8")

# config 디렉터리 생성
os.makedirs("config", exist_ok=True)

# 1. parameters.json (산식 파라미터 및 문항 매핑)
parameters_data = {
    "sayDoGap": {
        "threshold": 0.4,
        "anchors": {
            "savings": {"metric": "개인 저축률", "peerMedian": 0.324, "scale": 0.648, "invert": False, "description": "30대 가구 월 흑자율 기준"},
            "spending": {"metric": "변동지출 비율", "peerMedian": 0.363, "scale": 0.726, "invert": True, "description": "30대 가구 소비지출 대비 변동지출 기준"},
            "debt": {"metric": "부채 배수", "peerMedian": 1.73, "scale": 3.46, "invert": True, "description": "연소득 대비 부채 총액 배수 기준"},
            "investment": {"metric": "투자 비중", "peerMedian": 0.036, "scale": 0.072, "invert": False, "description": "총자산 대비 금융투자자산 비중 기준"}
        }
    },
    "valueGapWeights": {
        "savings": 0.2, "spending": 0.2, "investment": 0.2, "debt": 0.2, "jointManagement": 0.2
    },
    "typeAxis": {
        "cutoff": 3.0
    },
    "inputValidation": {
        "rules": [
            {"id": "V-01", "field": "monthlyNetIncome", "condition": "< 100 또는 > 700", "level": "confirm", "message": "입력하신 월 소득 금액이 맞는지 다시 한번 확인해 주세요."},
            {"id": "V-02", "field": "totalExpense", "condition": "지출 합계 > 소득", "level": "warn", "message": "월 지출 합계가 월 소득보다 많아 적자가 발생하고 있습니다."},
            {"id": "V-03", "field": "debtTotal", "condition": "> 연소득 × 5", "level": "confirm", "message": "부채 규모가 연간 총소득의 5배를 초과합니다. 금액을 확인해 주세요."},
            {"id": "V-04", "field": "variableExpenses", "condition": "= 0", "level": "warn", "message": "변동 생활비를 입력하지 않으면 저축여력 진단 결과가 부정확해질 수 있습니다."},
            {"id": "V-05", "field": "savings", "condition": "= 0 이고 monthlyNetIncome > 400", "level": "confirm", "message": "소득 대비 현재 모아둔 저축액이 0원으로 입력되었습니다. 맞는지 확인해 주세요."}
        ]
    },
    "questionMapping": {
        "deep": [
            {
                "id": "D1", 
                "area": "savings", 
                "reverse": False, 
                "category": "저축",
                "text": "쓰고 남으면 저축한다 ↔ 저축부터 하고 남는 걸 쓴다",
                "left": "쓰고 남은 돈을 저축",
                "right": "먼저 저축하고 남은 돈을 소비"
            },
            {
                "id": "D2", 
                "area": "savings", 
                "reverse": True, 
                "category": "저축",
                "text": "목돈 목표를 정해두고 모은다 ↔ 상황에 맞춰 유동적으로 모은다",
                "left": "목표 금액을 정해 철저히 저축",
                "right": "상황에 맞춰 유동적으로 모음"
            },
            {
                "id": "D3", 
                "area": "spending", 
                "reverse": False, 
                "category": "소비",
                "text": "사고 싶은 게 있으면 바로 산다 ↔ 한참 고민하고 산다",
                "left": "사고 싶은 것은 바로 구매",
                "right": "충분히 고민하고 비교 후 구매"
            },
            {
                "id": "D4", 
                "area": "spending", 
                "reverse": False, 
                "category": "소비",
                "text": "경조사나 선물에는 넉넉히 쓴다 ↔ 최소한으로 한다",
                "left": "경조사/선물에 아낌없이 지출",
                "right": "실속 위주로 최소한만 지출"
            },
            {
                "id": "D5", 
                "area": "investment", 
                "reverse": True, 
                "category": "투자",
                "text": "손실 위험이 있어도 수익을 노린다 ↔ 적더라도 안전한 게 낫다",
                "left": "원금 손실 감수하고 고수익 추구",
                "right": "원금 보존 중심의 안전성 추구"
            },
            {
                "id": "D6", 
                "area": "debt", 
                "reverse": False, 
                "category": "부채",
                "text": "필요하면 대출은 활용할 수 있는 도구다 ↔ 빚은 최대한 피해야 한다",
                "left": "대출을 적극적인 레버리지로 활용",
                "right": "대출과 빚은 무조건 최소화"
            },
            {
                "id": "D7", 
                "area": "jointManagement", 
                "reverse": True, 
                "category": "공동관리",
                "text": "결혼하면 통장을 합치고 싶다 ↔ 각자 관리하고 공동비만 분담하고 싶다",
                "left": "모든 통장을 하나로 합쳐 통합 관리",
                "right": "각자 독립 관리하며 공동비만 분담"
            },
            {
                "id": "D8", 
                "area": "jointManagement", 
                "reverse": True, 
                "category": "공동관리",
                "text": "서로의 지출을 모두 공유해야 한다 ↔ 각자 쓰는 돈은 묻지 않는다",
                "left": "개인 지출 내역까지 모두 투명하게 공유",
                "right": "개인 용돈과 지출은 상호 불간섭"
            }
        ]
    }
}

# 2. coefficients.json (계산 계수)
coefficients_data = {
    "cohabitationSpending": {
        "householdCoefficient": 1.7,
        "perPersonMultiplier": 0.85,
        "description": "합가 시 2인 가구 지출 보정 계수 (1인 가구 대비 약 1.7배)"
    },
    "lightModeSurplus": {
        "formula": "0.15 * (incomeA + incomeB) + 0.85 * (surplusA + surplusB)",
        "incomeWeight": 0.15,
        "surplusWeight": 0.85,
        "description": "라이트 모드 합산 월 저축여력 추정 가중치"
    },
    "incomeConversion": {
        "byAge": {
            "under30": 0.851,
            "age30s": 0.818,
            "age40s": 0.816,
            "all": 0.832
        },
        "description": "연령대별 세전 연소득 대비 세후 처분가능소득 환산 비율"
    }
}

# 3. ranges.json (입력 선택지 구간 및 대표값)
ranges_data = {
    "monthlyNetIncome": {
        "_question": "월 실수령 소득 구간 (세후)",
        "unit": "만원/월",
        "options": [
            {"label": "170만 미만", "rep": 130, "description": "월 170만원 미만 (하위 20% 이하)"},
            {"label": "170~250만", "rep": 210, "description": "월 170만원 이상 ~ 250만원 미만"},
            {"label": "250~330만", "rep": 290, "description": "월 250만원 이상 ~ 330만원 미만 (30대 중위 소득 구간)"},
            {"label": "330~450만", "rep": 380, "description": "월 330만원 이상 ~ 450만원 미만"},
            {"label": "450만 이상", "rep": 550, "description": "월 450만원 이상 (상위 20% 이상)"}
        ]
    },
    "totalDebt": {
        "_question": "총 부채 및 대출 잔액",
        "unit": "만원",
        "options": [
            {"label": "없음", "rep": 0, "description": "보유 중인 대출 및 부채 없음"},
            {"label": "3천만 미만", "rep": 1500, "description": "총 부채 3천만원 미만"},
            {"label": "3천~7천만", "rep": 5000, "description": "총 부채 3천만원 이상 ~ 7천만원 미만"},
            {"label": "7천~1.5억", "rep": 11000, "description": "총 부채 7천만원 이상 ~ 1억 5천만원 미만 (30대 평균 부채 수준)"},
            {"label": "1.5억 이상", "rep": 20000, "description": "총 부채 1억 5천만원 이상 (주택담보대출 포함 등)"}
        ]
    },
    "monthlySurplus": {
        "_question": "월 잉여자금 (저축 또는 투자 가능 금액)",
        "unit": "만원/월",
        "options": [
            {"label": "거의 없음", "rep": 10, "description": "월 20만원 미만 (생활비 지출 후 잉여 자금 거의 없음)"},
            {"label": "20~60만", "rep": 40, "description": "월 20만원 이상 ~ 60만원 미만"},
            {"label": "60~120만", "rep": 85, "description": "월 60만원 이상 ~ 120만원 미만 (1인가구 평균 흑자액 수준)"},
            {"label": "120만 이상", "rep": 160, "description": "월 120만원 이상 (적극적인 저축/투자 가능)"}
        ]
    }
}

# 4. benchmarks.json (또래 기준선 벤치마크)
benchmarks_data = {
    "national": {"mean": 7229.0, "median": 6279.0, "monthlyMedian": 523, "shareOver100M": 21.7, "percentiles": {"p50": 6279}},
    "byDualIncome": {"dual": {"mean": 8400.0, "median": 7500.0, "monthlyMedian": 625}, "single": {"mean": 5200.0, "median": 4800.0, "monthlyMedian": 400}},
    "hfcs2025": {
        "byHeadAge": {
            "age30s": {
                "headAgeMean": 34.8, "householdSize": 2.13,
                "incomeMedian": 6219.0, "disposableIncomeMedian": 5085.0,
                "savingsMedian": 4260.0, "savingsMean": 6989,
                "debtMedian": 10732.0, "debtHoldingRate": 69.0,
                "mortgageMedian": 16330.0, "mortgageHoldingRate": 23.8,
                "creditLoanMedian": 2884.0, "creditLoanHoldingRate": 25.8,
                "principalInterestMonthly": 82, "disposableRatio": 0.818, "dsr": 0.158
            }
        }
    },
    "heis2026q1": {
        "sizeCoefficient": {"includingHousing": 1.7, "excludingHousing": 1.67, "byCategory": {"식료품": 1.5, "보험": 2.366}},
        "under40": {
            "income": 5390500.0, "disposableIncome": 4400000.0, "consumption": 2988000.0,
            "surplus": 1412000.0, "surplusRate": 32.4, "housingRatio": 0.083
        }
    }
}

# JSON 파일 쓰기
with open("config/parameters.json", "w", encoding="utf-8") as f:
    json.dump(parameters_data, f, ensure_ascii=False, indent=2)

with open("config/coefficients.json", "w", encoding="utf-8") as f:
    json.dump(coefficients_data, f, ensure_ascii=False, indent=2)

with open("config/ranges.json", "w", encoding="utf-8") as f:
    json.dump(ranges_data, f, ensure_ascii=False, indent=2)

with open("config/benchmarks.json", "w", encoding="utf-8") as f:
    json.dump(benchmarks_data, f, ensure_ascii=False, indent=2)

print("✅ config/ 폴더 및 4개 JSON 파일 생성 완료!")