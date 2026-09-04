from typing import get_args

from deep.schemas import DeepInput, QuestionId


def validate_submission(data: DeepInput) -> list[dict[str, str]]:
    return [{"field": f"values.{key}", "code": "ANSWER_OR_SKIP_REQUIRED"}
            for key in get_args(QuestionId) if data.values.get(key) is None and key not in data.skippedQuestionIds]
