# Frontend deployment and smoke checks

This document describes the release checks for the frontend in `apps/frontend`.
The frontend calls the backend through same-origin `/api/v1` paths. Local Vite
development proxies those paths to the backend; production must provide an
equivalent reverse proxy or rewrite.

## Local verification

Run the backend with the test configuration and start the frontend from
`apps/frontend`:

```powershell
$env:ENVIRONMENT = "test"
$env:PARTICIPANT_TOKEN_PEPPER = "devpepper"
$env:MONGODB_URI = "mongodb://127.0.0.1:27017"
$env:MONGODB_DATABASE = "mirisallim_e2e"
python -m uvicorn main:app --host 127.0.0.1 --port 8000
```

In another terminal:

```powershell
npm ci
npm run dev -- --host 127.0.0.1 --port 4173
```

The Vite proxy target defaults to `http://127.0.0.1:8000` in the Playwright
configuration. Set `MIRISALLIM_API_PROXY_TARGET` when the local backend uses a
different address.

Before a release, run the frontend checks from `apps/frontend`:

```powershell
npm run api:check
npm run lint
npm run typecheck
npm run test -- --run
npm run build
npm run test:e2e
```

## Vercel deployment

Set the Vercel project root to `apps/frontend`. The deployment must preserve
same-origin requests to `/api/v1`; the browser should not be configured with a
secret or a client-visible database URL.

The production backend origin is intentionally not embedded in this repository
until a supervisor confirms the exact HTTPS origin and a live health check. Do
not replace it with a guessed Render, Railway, or other provider URL. Once the
origin is confirmed, add the approved rewrite and verify that the browser sees
the request as `/api/v1/...` on the deployed frontend origin.

After deployment, inspect only status and headers when checking a public entry
point. Do not copy response bodies, cookies, participant tokens, invitation
codes, or session identifiers into logs or tickets.

```powershell
curl.exe -sS -I https://<confirmed-frontend-origin>/ | Select-String -Pattern "HTTP/|content-security-policy|strict-transport-security|x-content-type-options|referrer-policy"
```

The deployed response should retain the security headers required by the
application, including CSP, HSTS, `X-Content-Type-Options`, and
`Referrer-Policy`. If fonts, images, or analytics are changed, update the CSP
allowlist deliberately and rerun the accessibility and smoke suites.

## Production smoke test

The production smoke test is opt-in so an ordinary local E2E run never targets
an external deployment. Supply the already deployed frontend URL explicitly:

```powershell
$env:PLAYWRIGHT_BASE_URL = "https://<confirmed-frontend-origin>"
$env:RUN_PRODUCTION_SMOKE = "1"
npm run test:e2e -- production-smoke.spec.ts
```

The smoke test exercises the landing page, the two-part light flow, the result
gate, and share download. It must be run only against a disposable/test
deployment with non-sensitive data. A successful local run does not prove that
the deployed frontend is connected to the intended production MongoDB-backed
backend.

## Rollback

If the deployed smoke test fails, stop promotion and use the Vercel dashboard
to promote the previous known-good deployment. Re-run the header check and the
opt-in smoke test against the rollback before reopening traffic. Record only
the deployment identifier, timestamp, status code, and redacted error class.

