class DeepError(Exception):
    def __init__(self, code: str, status_code: int = 409, field_errors: dict[str, list[str]] | None = None) -> None:
        super().__init__(code)
        self.code = code
        self.status_code = status_code
        self.field_errors = field_errors or {}
