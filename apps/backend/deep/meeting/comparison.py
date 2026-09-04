from deep.meeting.models import BudgetComparison, BudgetOption


def _balance(option: BudgetOption) -> int | None:
    if option.budgetWon is None or option.aWon is None or option.bWon is None:
        return None
    return option.budgetWon - option.aWon - option.bWon


def _change(before: int | None, after: int | None) -> int | None:
    return None if before is None or after is None else after - before


def compare_budgets(baseline: BudgetOption, proposal: BudgetOption) -> BudgetComparison:
    if set(baseline.commonScope) != set(proposal.commonScope) or baseline.startMonth != proposal.startMonth:
        return BudgetComparison(status="unavailable", reason="scope_or_month_mismatch")
    before, after = _balance(baseline), _balance(proposal)
    return BudgetComparison(
        status="available" if before is not None and after is not None else "partial",
        baselineGapWon=None if before is None else max(0, before),
        proposalGapWon=None if after is None else max(0, after),
        proposalExcessWon=None if after is None else max(0, -after),
        budgetChangeWon=_change(baseline.budgetWon, proposal.budgetWon),
        aChangeWon=_change(baseline.aWon, proposal.aWon), bChangeWon=_change(baseline.bWon, proposal.bWon),
    )
