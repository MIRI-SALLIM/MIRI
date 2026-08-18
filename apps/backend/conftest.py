import os

# API tests use the repository's isolated in-memory mode.  Real development
# and production processes continue to use the MongoDB URI from .env.
os.environ.setdefault("ENVIRONMENT", "test")
