from datetime import date
from decimal import ROUND_HALF_UP, Decimal
from typing import Any

from deep.schemas import Amount


def won(value: Decimal) -> int:
    return int(value.quantize(Decimal(1), rounding=ROUND_HALF_UP))


def total(values: list[int | None]) -> int | None:
    if any(value is None for value in values):
        return None
    return sum(value for value in values if value is not None)


def month_number(month: str) -> int:
    year, number = map(int, month.split("-"))
    return year * 12 + number - 1


def month_at(start: str, offset: int) -> str:
    year, month = divmod(month_number(start) + offset, 12)
    return f"{year:04d}-{month + 1:02d}"


def month_start(month: str) -> date:
    return date.fromisoformat(month + "-01")


class Evidence:
    def __init__(self) -> None:
        self.missing: list[str] = []
        self.assumptions: list[str] = []

    def amount(self, value: Amount, path: str) -> int | None:
        if value.value is None:
            self.missing.append(path)
        elif value.precision == "estimate":
            self.assumptions.append(f"{path}: 사용자가 입력한 추정 금액")
        return value.value

    def block(self, data: dict[str, Any], keys: list[str]) -> dict[str, Any]:
        present = [data.get(key) is not None for key in keys]
        status = "available" if all(present) and not self.missing else "partial"
        if not any(present):
            status = "unavailable"
        return {"status": status, "missingFields": list(dict.fromkeys(self.missing)),
                "assumptions": list(dict.fromkeys(self.assumptions)), "data": data}
