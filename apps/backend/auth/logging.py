import logging
import re


class OAuthAccessLogFilter(logging.Filter):
    """Remove auth queries and Deep invitation secrets before request formatting."""

    def filter(self, record: logging.LogRecord) -> bool:
        args = record.args
        if isinstance(args, tuple) and len(args) == 5:
            client, method, path, version, status = args
            if isinstance(path, str) and path.startswith(("/api/v1/auth/", "/api/v1/deep/")):
                safe_path = re.sub(r"(/api/v1/deep/invitations/)[^/]+", r"\1[redacted]", path.split("?", 1)[0])
                record.args = (client, method, safe_path, version, status)
        return True


def install_auth_log_filter() -> None:
    logger = logging.getLogger("uvicorn.access")
    if not any(isinstance(item, OAuthAccessLogFilter) for item in logger.filters):
        logger.addFilter(OAuthAccessLogFilter())
