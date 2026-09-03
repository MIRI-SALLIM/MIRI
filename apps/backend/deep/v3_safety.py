from typing import Any


def safe_block(block: dict[str, Any]) -> dict[str, Any]:
    """Do not serialize aggregate won amounts outside the exact JSON/JS integer range."""
    def unsafe(value: Any) -> bool:
        if isinstance(value, int) and not isinstance(value, bool):
            return abs(value) > 2**53 - 1
        if isinstance(value, dict):
            return any(unsafe(item) for item in value.values())
        if isinstance(value, list):
            return any(unsafe(item) for item in value)
        return False

    if unsafe(block.get("data")):
        return {"status": "unavailable", "reason": "amount_out_of_supported_range", "data": None,
                "missingFields": [], "assumptions": ["합산 금액이 지원 범위를 넘어 계산을 표시하지 않습니다."]}
    return block
