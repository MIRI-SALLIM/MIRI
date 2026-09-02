# Frontend deployment and smoke checks

This document describes release checks for the frontend in `apps/frontend`.
The browser calls the backend through same-origin `/api/v1/...` paths. Local
Vite development proxies those paths to the backend; Vercel must provide the
equivalent rewrite after the production backend origin has been verified.

## Local verification

Run the backend with the test configuration from `apps/backend`:

```powershell
$env:ENVIRONMENT = "test"
$env:PARTICIPANT_TOKEN_PEPPER = "devpepper"
$env:MONGODB_URI = "mongodb://127.0.0.1:27017"
$env:MONGODB_DATABASE = "mirisallim_e2e"
python -m uvicorn main:app --host 127.0.0.1 --port 8000
```

In another terminal, from `apps/frontend`, set the Vite proxy explicitly and
start the frontend:

```powershell
$env:MIRISALLIM_API_PROXY_TARGET = "http://127.0.0.1:8000"
npm ci
npm run dev -- --host 127.0.0.1 --port 4173
```

The browser should make requests to `http://127.0.0.1:4173/api/v1/...`; the
Vite proxy forwards them to `http://127.0.0.1:8000`. Playwright supplies this
target automatically for its managed local server, but keeping the variable
explicit is useful when starting Vite by hand.

Before a release, run the frontend checks from `apps/frontend`:

```powershell
npm run api:check
npm run lint
npm run typecheck
npm run test -- --run
npm run build
npm run test:e2e
```

## Preview and production separation

Preview deployments are disposable verification environments. Use a preview
URL for browser checks while reviewing a change, and use only test or otherwise
non-sensitive session data. Production is a separate Vercel deployment and
must be tested only after the exact production frontend URL and backend origin
have been approved and health-checked.

Configure the Vercel project root as `apps/frontend`. Do not put a backend URL,
secret, database URL, cookie, or token in frontend code or browser-visible
environment variables. The production smoke test is opt-in and requires an
explicit `PLAYWRIGHT_BASE_URL`, so ordinary local E2E runs do not target a
preview or production host.

## Vercel deployment and rewrite verification

The production backend origin is intentionally not embedded in this repository
until a supervisor confirms the exact HTTPS origin and a live health check. Do
not replace the placeholder with a guessed Render, Railway, or other provider
URL. Once confirmed, configure the approved `/api/(.*)` rewrite and keep the
SPA fallback after it.

Verify the rewrite against a disposable preview before promoting a deployment:

1. Open the preview in a browser with DevTools Network recording enabled.
2. Start the light flow and inspect the requests filtered to `/api/v1/`.
3. Confirm each request URL starts with the preview frontend origin and has an
   `/api/v1/...` path; it must not expose the backend origin to the browser.
4. Confirm the create, invitation, join, input, submit, status, and result
   requests return the expected status codes. Record only method, status,
   frontend host, and redacted path templates such as
   `/api/v1/sessions/{session_id}/result`.

For a header-only check, use a redacted frontend host and discard the response
body:

```powershell
curl.exe -sS -I https://<confirmed-frontend-origin>/ | Select-String -Pattern "HTTP/|content-security-policy|strict-transport-security|x-content-type-options|referrer-policy"
```

Every deployed entry point should retain `Content-Security-Policy`,
`Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, and
`Referrer-Policy: no-referrer`. HSTS should include
`max-age=31536000; includeSubDomains`.

### CSP maintenance

Keep CSP allowlists narrow. The app imports the Pretendard stylesheet and font
from the existing jsDelivr source, so the corresponding `style-src` and
`font-src` allowances must remain present. Local images use `img-src 'self'`,
with `data:` and `blob:` allowed for the generated share-card preview/download.
When adding or removing a font, image source, or script, update only the
necessary directive and rerun the accessibility and smoke suites; do not add a
wildcard source.

## Backend health gate (separate from the frontend rewrite)

Verify the confirmed backend origin independently before configuring or
promoting the Vercel rewrite. The frontend rewrite intentionally exposes only
`/api/*` application routes, so a frontend URL such as `/health` is not a
substitute for this check.

Run the check with a redacted placeholder and record only the host and status:

```powershell
curl.exe -sS -o NUL -w "HTTP %{http_code}`n" https://<confirmed-backend-origin>/health
```

Proceed only when the intended backend returns HTTP 200. Never add the
confirmed origin to this document or to test output; use it only in the
approved deployment configuration and environment.

## Production smoke test

The production smoke test is opt-in, uses two independent browser contexts,
and never starts local web servers when `PLAYWRIGHT_BASE_URL` is set. Run it
from `apps/frontend` against a disposable or approved deployment with
non-sensitive data:

```powershell
$env:PLAYWRIGHT_BASE_URL = "https://<confirmed-frontend-origin>"
$env:RUN_PRODUCTION_SMOKE = "1"
npx playwright test e2e/production-smoke.spec.ts
Remove-Item Env:RUN_PRODUCTION_SMOKE
Remove-Item Env:PLAYWRIGHT_BASE_URL
```

The test verifies the landing page, same-origin `/api/v1` A/B session creation
and invitation join, the waiting response privacy gate, simultaneous result
availability, share preview ratio selection, PNG download, serious/critical
axe violations including color contrast, and the four required security
headers. A successful local or preview run does not prove that the deployed
frontend is connected to the intended production MongoDB-backed backend.

## Rollback

If deployment smoke fails, stop promotion. In the Vercel dashboard, select the
previous known-good deployment and promote it back to production. Re-run the
header check and the opt-in smoke test against the rollback before reopening
traffic. Record only the deployment identifier, timestamp, status code, and
redacted error class.

## Logging and evidence rule

Secrets, cookies, participant tokens, invitation codes, session identifiers,
request payloads, and response bodies are never copied into this document,
tickets, logs, traces, or uploaded artifacts. Production evidence may contain
only command exit codes, test counts, the redacted production host, status
codes, and security-header names.
