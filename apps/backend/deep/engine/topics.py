from typing import Any

from deep.config import load_rules


def select_topics(
    gaps: dict[str, dict[str, Any]], important_a: list[str], important_b: list[str], limit: int = 3,
) -> list[str]:
    rules = load_rules("deep-rules-v1")
    order = rules["areaOrder"]
    eligible = [area for area in order if gaps.get(area, {}).get("status") == "complete" and gaps[area]["gap"] > 0]
    return sorted(eligible, key=lambda area: (
        -gaps[area]["gap"], -(int(area in important_a) + int(area in important_b)), order.index(area),
    ))[:max(0, min(limit, rules["topicLimit"]))]
