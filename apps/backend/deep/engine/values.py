from typing import Any

from deep.config import AREAS, normalize_answer


def value_gaps(
    a: dict[str, int | None], b: dict[str, int | None], questions: list[dict[str, Any]],
) -> dict[str, dict[str, Any]]:
    result = {}
    for area in AREAS:
        compared = []
        differences = {}
        for question in sorted(questions, key=lambda q: int(q["id"][1:])):
            key = question["id"]
            if question["area"] != area or a.get(key) is None or b.get(key) is None:
                continue
            answer_a, answer_b = a[key], b[key]
            assert answer_a is not None and answer_b is not None
            difference = abs(normalize_answer(answer_a, question["reverse"]) - normalize_answer(answer_b, question["reverse"])) / 4
            compared.append(key)
            differences[key] = difference
        result[area] = {"gap": sum(differences.values()) / len(compared) if compared else None,
                        "status": "complete" if len(compared) == 2 else "partial" if compared else "unavailable",
                        "comparedQuestionIds": compared, "questionDifferences": differences}
    return result
