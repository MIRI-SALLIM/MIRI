def known(value):
    return {"value": value, "status": "known", "precision": "exact"}


def sample_input():
    return {
        "income": {"monthlyNetIncome": known(3000000), "annualNetBonus": known(0),
                   "bonusIncludedInMonthlyIncome": False, "bonusMonth": None, "referenceMonth": "2026-09"},
        "fixedExpenses": {k: known(0) for k in ["communication", "insurance", "subscriptions", "familySupport", "other"]},
        "variableExpenses": {k: known(0) for k in ["food", "transport", "shopping", "leisure", "other"]},
        "housingCost": known(0), "debts": [], "debtsStatus": "known", "assets": [], "assetsStatus": "known",
        "livingTogether": False, "values": {f"D{i}": 3 for i in range(1, 11)}, "skippedQuestionIds": [],
        "importantAreas": [], "contextNotes": {},
    }


def sample_plan():
    return {"startMonth": "2026-10", "housingType": "rent", "monthlyHousingCost": known(1000000),
            "housingPriceWon": known(10000000), "oneOffCostsWon": known(0), "newHousingLoan": None, "target": None}


def debt(**overrides):
    return {"id": "loan-1", "type": "other", "balance": known(12000000), "monthlyPayment": known(100000),
            "annualRate": "0.1", "remainingMonths": 12, "repaymentType": "equalPayment", "disposition": "keep",
            **overrides}


def asset(**overrides):
    return {"id": "asset-1", "kind": "cashSavings", "balance": known(10000000), "availableOn": "2026-09-01",
            "housingAllocationWon": 0, "goalAllocationWon": 0, **overrides}


def ready_document():
    from copy import deepcopy
    from datetime import datetime, timezone

    now = datetime(2026, 9, 3, tzinfo=timezone.utc)
    members = {role: {"userId": "user-a" if role == "A" else "user-b", "revision": 1,
                      "input": deepcopy(sample_input()), "submittedAt": now, "confirmedPlanVersion": 1,
                      "consent": {"version": "deep-sharing-v1", "submittedRevision": 1, "round": 1,
                                  "shareFinance": True, "shareValues": True}}
               for role in ("A", "B")}
    return {"id": "deep-test", "round": 1, "version": 1, "status": "waiting", "members": members,
            "plan": {"version": 1, "data": sample_plan()}, "createdAt": now,
            "expiresAt": datetime(2099, 1, 1, tzinfo=timezone.utc), "reportId": None,
            "questionVersion": "deep-v2", "ruleVersion": "deep-rules-v1", "copyVersion": "deep-copy-ko-v1",
            "consentVersion": "deep-sharing-v1", "invitationCode": "INV-test", "creatorUserId": "user-a"}
