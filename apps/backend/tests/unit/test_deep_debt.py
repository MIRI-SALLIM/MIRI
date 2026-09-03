import importlib
from decimal import Decimal

import pytest


def schedule(*args):
    return importlib.import_module("deep.engine.debt").payment_schedule(*args)


def test_bullet_debt_includes_maturity_principal():
    rows = schedule(12000000, Decimal("0.12"), 12, "bulletMaturity")
    assert rows[0]["totalWon"] == 120000
    assert rows[-1]["totalWon"] == 12120000
    assert sum(row["principalWon"] for row in rows) == 12000000


@pytest.mark.parametrize("kind", ["equalPayment", "equalPrincipal", "bulletMaturity"])
def test_zero_rate_rounding_reconciles_principal_exactly(kind):
    rows = schedule(1000000, Decimal(0), 7, kind)
    assert sum(row["principalWon"] for row in rows) == 1000000
    assert all(row["interestWon"] == 0 for row in rows)
    assert all(row["totalWon"] == row["principalWon"] + row["interestWon"] for row in rows)


def test_equal_principal_payments_decline_and_equal_payment_is_stable():
    principal = schedule(12000000, Decimal("0.12"), 12, "equalPrincipal")
    assert principal[0]["totalWon"] == 1120000
    assert principal[-1]["totalWon"] == 1010000
    equal = schedule(12000000, Decimal("0.12"), 12, "equalPayment")
    assert max(r["totalWon"] for r in equal) - min(r["totalWon"] for r in equal) <= 1
    assert sum(r["principalWon"] for r in equal) == 12000000


@pytest.mark.parametrize("principal,rate,months,kind", [
    (1, "0", 0, "equalPayment"), (1, "NaN", 1, "equalPayment"), (1, "Infinity", 1, "equalPayment"),
    (1, "-0.01", 1, "equalPayment"), (-1, "0", 1, "equalPayment"), (1, "0", 1, "unknown"),
    (1, "0", 100000000, "equalPayment"),
])
def test_invalid_or_unbounded_schedule_is_rejected(principal, rate, months, kind):
    with pytest.raises(ValueError):
        schedule(principal, Decimal(rate), months, kind)
