class AuthError(Exception):
    """Safe error code only; never includes provider bodies, codes, or secrets."""

    def __init__(self, code: str, status_code: int = 401) -> None:
        super().__init__(code)
        self.code = code
        self.status_code = status_code
