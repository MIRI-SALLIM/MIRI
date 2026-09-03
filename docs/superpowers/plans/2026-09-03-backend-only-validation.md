# Backend-only HTTPS/Mongo Validation Plan

> **For agentic workers:** Execute inline with superpowers:executing-plans and test-driven-development. The user requested backend validation without a deployed frontend; do not build or merge frontend UI.

**Goal:** Validate reviewer/Deep flows over a real HTTPS socket and disposable Mongo, without frontend hosting or Kakao.

**Architecture:** Test-only subprocess runs the existing Uvicorn app with production security flags. Independent HTTPX cookie jars act as A/B and an unrelated room. Existing safe_test_uri/isolated_deep_database limit all DB access and cleanup. Local CA certificate is trusted explicitly, never verify=False.

**Tech Stack:** pytest, HTTPX, ssl, subprocess, OpenSSL on the GitHub Ubuntu runner, existing Mongo7 CI service.

**Spec:** ../specs/2026-09-03-reviewer-login-design.md and ../specs/2026-09-03-mirisallim-deep-mode-design-draft.md (existing contracts, no new product feature).

## Constraints

- Current fix2 worktree remains isolated. origin/develop is inspected with git show only.
- No production Atlas, user passwords, GitHub credentials, frontend mutation, Kakao changes or Railway activation.
- Only newly generated mirisalim_deep_test_<uuid> DBs. Only loopback HTTPS server; no arbitrary target URL.
- Explicit environment whitelist, production flags with synthetic peppers/hashes; disable dotenv loading.
- Child process stops in finally, temporary certificate/key files removed by TemporaryDirectory.
- Browser SameSite enforcement, Vercel proxy, Railway forwarding and real Kakao remain separate release gates.

## Task 1 — Safe test process environment

Create tests/https_mongo_support.py and tests/unit/test_https_mongo_safety.py.
Interface: server_environment(origin, database_name, mongo_uri, passwords, inherited) -> dict[str,str].

- [x] Red: reject ordinary DB names, non-loopback HTTPS origins and unsafe Mongo URI; assert inherited production credentials are absent and password hashes verify against synthetic inputs.
- [x] Implement explicit environment whitelist, validated target and synthetic auth configuration.
- [x] Run `python scripts/test_local.py tests/unit/test_https_mongo_safety.py -q`.

Representative independent assertions:
```python
assert env['MONGODB_DATABASE'] == 'mirisalim_deep_test_' + 'a' * 32
assert env['ENVIRONMENT'] == 'production'
assert 'GITHUB_TOKEN' not in env
assert env['PYTHON_DOTENV_DISABLED'] == '1'
```

## Task 2 — Real HTTPS/Mongo journey

Add async test context `https_backend(database_name, mongo_uri, passwords)` yielding HTTPS origin and SSLContext; bind an ephemeral loopback port, generate temporary SAN certificate with OpenSSL, launch Uvicorn with no proxy trust/access logging and a bounded health wait. On unsupported local setup explicitly skip before side effects; required CI Mongo failures fail.

Create tests/integration/test_reviewer_https_mongo.py. Test consumes sample_input/sample_plan; default financial sample means two net incomes of 3,000,000 and shared monthly housing 1,000,000.

- [x] Exercise real /health database=connected; Light anonymous cookie and Mongo persistence; unauthenticated Deep denied.
- [x] Independent A/B logins, secure/HttpOnly/no-store cookies, context recovery, spoofed auth header and wrong Origin denied.
- [x] Create/join, unrelated room denied, private drafts/stale revision, plan confirmations, one-submit waiting, two-submit identical results.
- [x] Parameterize B consent: (true,true), (false,true), (true,false). Opted-out blocks unavailable with sharing_not_authorized; private-note sentinels absent.
- [x] Two-party agreement confirmation, two-party next round, reset revokes old A/B but not another room; Light cookie survives.
- [x] Read disposable Mongo to prove data and TTL cap, not memory fallback.
- [x] Add test file to existing deep-mongo CI command; fix only defects reproduced by this validation, without changing intended contracts.

## Task 3 — Verify and hand off

- [x] Local wrapper/Ruff/mypy; actual CI HTTPS/Mongo cases with no skips.
- [x] Record inspected develop SHA, test evidence and remaining frontend/production boundaries in latest handoff/release checklist.
- [x] Commit/push only this backend validation work to fix2 gate; do not merge develop or deploy Railway.

Final evidence: a9dce09 / [CI 33734406279](https://github.com/MIRI-SALLIM/MIRI/actions/runs/33734406279): quality 309 passed/16 skipped, separate actual DB/HTTPS 20 passed/0 skipped, container privacy check success. See latest backend HTTPS handoff for the UTC response fix and reviewed dotenv isolation floor/runtime guard.
