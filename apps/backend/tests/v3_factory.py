from tests.deep_factory import asset, known, sample_input, sample_plan


def v3_input():
    data = sample_input()
    data.update(inputVersion="deep-input-v3", assets=[asset()],
                funding={"sourcesStatus": "known", "settlementsStatus": "known", "settlements": [],
                         "sources": [{"id": "asset-1", "kind": "cashSavings", "grossAmount": known(10_000_000),
                                      "certainty": "available", "availableOn": "2026-09-01", "housingAllocationWon": 10_000_000}]},
                contribution={"ownMonthly": known(800_000), "expectedPartnerMonthly": known(1_200_000)})
    return data


def v3_plan():
    return {**sample_plan(), "planSchemaVersion": "deep-plan-v3", "fundingAsOf": "2026-09-03",
            "fundingDeadlines": [{"id": "house", "dueOn": "2026-10-01", "amount": known(10_000_000)}],
            "commonExpensesStatus": "known", "commonExpenses": {"housing": known(1_000_000), "food": known(1_000_000)}}
