# Reviewer Login Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans task-by-task with TDD. User delegated reset design and requested implementation; execute locally, no commit/push/deploy.

**Goal:** Two reviewer credentials access isolated A/B trial rooms with explicit reset, independent of Kakao setup.
**Architecture:** Existing auth cookie and Principal; reviewer room metadata and synthetic identities in Mongo. Existing Deep data carries room scope; no alternate calculation engine.
**Tech Stack:** FastAPI, Pydantic, PyMongo Async, Python hashlib/secrets, pytest.
**Spec:** `docs/superpowers/specs/2026-09-03-reviewer-login-design.md`

## Global Constraints

- No production writes, no plaintext password in Git/log, no frontend UI changes.
- Fixed usernames judge-a/judge-b; reviewer disabled by default; independent Kakao enable flag.
- Exact Origin on mutations; existing account cookie protections; 24-hour rooms with logical expiry.

## Task 1 — configuration and credentials

Files: auth/reviewer_settings.py, auth/passwords.py, auth/settings.py; tests/unit/test_reviewer_auth.py.

- [x] Write tests asserting `load_auth_settings(env).enabled` with reviewer-only configuration and no Kakao keys; missing hashes fail closed.
- [x] Run `.venv/Scripts/python.exe scripts/test_local.py tests/unit/test_reviewer_auth.py -q` and confirm red.
- [x] Implement `hash_password(password: str) -> str`, `verify_password(password: str, encoded: str) -> bool`; enforce bounded format/cost, salt16 bytes, digest32 bytes, constant-time comparison.
- [x] Add `kakao_enabled`/`reviewer_enabled` defaults to AuthSettings and guard only provider-specific routes; run unit/auth regression tests.

## Task 2 — isolated reviewer rooms, login and reset

Files: auth/reviewer_repository.py, auth/reviewer_router.py, auth/repository.py, auth/dependencies.py, auth/models.py, main.py; tests/integration/test_reviewer_login.py.

- [x] Test API login, two cookies restoring A/B by roomCode, rejection of wrong passwords and Origin, no plaintext in Mongo/error, logical expiry, disabling/rotating credentials, reset invalidates old cookies and only one concurrent reset wins.
- [x] Run integration file before registering routes and confirm missing-feature failures.
- [x] Implement room creation, role user insertion, password verification off event loop, rate counters before expensive verification, opaque auth sessions capped at room expiry, context and CAS reset.
- [x] Use `Principal(user_id, authenticated_at, provider, reviewer_run_id, reviewer_role, reviewer_version)` defaults to preserve existing callers. Existing me response remains userId only.
- [x] Run authentication regressions and new integration tests.

## Task 3 — Deep isolation, expiry and handoff

Files: deep/reviewer_scope.py, deep/repository.py; tests/integration/test_reviewer_login.py, tests/integration/test_reviewer_mongo.py; scripts/reviewer_password.py, .env.example, scripts/test_local.py; OpenAPI snapshots and operations/reviewer-login.md.

- [x] Write cross-room/cross-provider invitation tests and stale room denial tests before adding scope guards.
- [x] On create, tag reviewerRunId and cap expiresAt. On join and reads, validate stored room scope, active room and exact participant identities. Cap publication and new-round lifetime at room expiry.
- [x] Add disposable Mongo reset-race test using existing isolated_deep_database; never Atlas. Actual Mongo execution remains a release gate; boundary-double race test passed.
- [x] Add interactive getpass hash helper (no password command-line argument or output), env guidance and frontend request sequence. Export OpenAPI using existing generator.
- [x] Run full local wrapper, Ruff, mypy, git diff --check. Final: 293 passed / 13 skipped / 11 warnings, Ruff clean, mypy 98 files clean, generated OpenAPI snapshots identical. Actual Mongo/browser/deployment gates remain open.
