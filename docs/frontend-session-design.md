# Frontend Session Design

Status: v3, approved with conditions by the CTO (decisions recorded 2026-11-01, see section 14). A final security review is still required before production. Revised after senior review (approve with conditions).
Verified 2026-10-17 against a local backend built from `develop` at 11158814.
Legend: **[Built]** implemented and tested. **[Verified live]** also exercised against the running backend. **[Planned]** not built. **[Open]** needs a decision. **[Required]** decided by the CTO, not built yet.

## 1. Summary

The browser keeps the access token in memory only. The refresh token lives only in an HttpOnly cookie that is set and read by four Next.js routes under `/api/auth/*`. The BFF is not a proxy: all business data requests go from the browser straight to the backend, which must allow the frontend origin through a CORS allowlist. A CORS implementation exists on a backend branch but is not merged, and two implementations exist; consolidation is pending.

    Browser --(/api/auth/*, cookie, CSRF header)--> Next.js BFF --> Backend /auth/*
    Browser --(Authorization: Bearer, CORS)-------------------------> Backend /organizations/*

## 2. Backend contract relied on (verified)

- `POST /auth/login`, `/auth/register`, `/auth/refresh` return `{ user, accessToken, refreshToken }` in the JSON body. No `Set-Cookie` from the backend.
- Access token lifetime 15 minutes; refresh token lifetime 7 days (backend defaults).
- Refresh rotates the token on every call. Replaying an old token returns 401 with `details.code` `REFRESH_TOKEN_RECENTLY_ROTATED` (lost a race inside the rotation window; non-destructive). A displaced session returns 401 with `SESSION_REPLACED_BY_NEW_LOGIN`. Any other refresh 401 means the session is dead.
- One refresh token per user: a new login anywhere replaces the previous session.
- `POST /auth/logout` needs a bearer access token and returns 204.
- Login and register are throttled (5 per window per IP; login also per email) and send `X-RateLimit-*` headers.
- Error bodies: `{ success: false, message: string | string[], statusCode, timestamp, path, details? }`.

## 3. Token lifecycle

1. Sign-in: the browser POSTs credentials to `/api/auth/login`. The BFF calls the backend, sets the cookie, and returns `{ accessToken, user }` only. **[Verified live]**
2. Page load: the app calls `/api/auth/refresh`. If the cookie exists the session is restored; if not, the BFF answers 401 `NO_SESSION` without calling the backend. `AuthProvider` runs this once on load. "Nobody is signed in" is a quiet outcome and shows no message; a network or server error leaves the state "unavailable" with a retry and is never treated as signed out. **[Built; verified in the browser]**
3. Data requests: the API client sends the in-memory access token. On a 401 it refreshes once and replays the request once; a 401 means the handler never ran, so the replay cannot duplicate a write. A second 401 is surfaced. **[Built]**
4. Concurrent refreshes in one tab share a single in-flight promise. **[Built]**
5. Across tabs, refreshes run one at a time through the Web Locks API (lock `trustflow-session-refresh`). Where Web Locks is unavailable the refresh runs directly and the rotation retry below is the fallback. The lock is wired in `src/lib/auth/browser.ts` with `createCrossTabLock(browserLockManager())`. **[Built]**
6. `REFRESH_TOKEN_RECENTLY_ROTATED` is non-destructive: wait 400 ms and retry, then wait 1200 ms and retry once more. If it is still rotated, the error is surfaced and the session is left untouched. No loop. **[Built; replay verified live]**
7. `SESSION_REPLACED_BY_NEW_LOGIN` ends the session and shows the dedicated message. Any other refresh 401 ends the session as expired. **[Built]**
8. Network errors and 5xx never end the session and are never retried: the outcome is unknown. **[Built]**
9. A failed refresh is never retried automatically, so refresh cannot loop. **[Built]**

## 4. Cookie policy

| Attribute | Value |
|---|---|
| Name | `tf_refresh` |
| HttpOnly | yes |
| Secure | yes in production; off only for local http development |
| SameSite | Strict (refresh is a same-site `fetch`, so email links still work) |
| Path | `/api/auth`, so it is never sent to any other route |
| Max-Age | 7 days; the backend remains the authority on expiry |

Cleared on a definitive dead-session 401 and on logout. Not cleared on a lost rotation race, throttling, or server errors. **[Built; attributes verified live except Secure, covered by unit tests]**

## 5. CSRF

Stateless, so it works across instances. Every BFF POST needs the `X-TrustFlow-CSRF: 1` header and must be provably same-origin (`Sec-Fetch-Site: same-origin`, falling back to comparing `Origin` with the host, honouring `X-Forwarded-Host`). If origin cannot be verified the request is refused. **[Built; 403 verified live]**

## 6. Logout

The client refreshes first to obtain a fresh access token, then calls `/api/auth/logout` with it. The BFF forwards the bearer token to the backend `POST /auth/logout`, always clears the cookie, and returns `{ backendSessionEnded }` honestly. No backend change is needed, and the earlier request to allow logout with a refresh token is withdrawn. If that refresh fails, the client logs out with the access token it already holds. If the logout request cannot reach the server, the cookie was not cleared, so the screen says the person may still be signed in. The local session is cleared either way. **[Built; refresh then logout verified in the browser]**

## 7. Proxy restrictions

The BFF is not a proxy. It exposes exactly four routes: `login`, `register`, `refresh`, `logout`. Each calls one fixed backend path chosen in code, never taken from the request, so there is no SSRF surface. Login and register forward only allowlisted body fields. Browser cookies are never forwarded upstream; refresh sends the token in the request body as the backend expects. Only `Authorization` is forwarded on logout. Upstream errors are re-emitted with `message`, `statusCode` and `details.code` only; rate-limit headers are passed through. Upstream timeout 10 s. `BACKEND_URL` is server-only configuration. **[Built]**

## 8. XSS exposure of the in-memory access token

Because the browser holds the access token, an XSS bug could read it. Mitigations in place: token in memory only and never in localStorage, sessionStorage or IndexedDB **[Built]**; 15-minute lifetime **[backend]**; refresh token unreachable from JavaScript **[Built]**.

Content-Security-Policy is built in **report-only mode**. Enforcement is a production requirement (CTO, 2026-11-01): the app must not ship with CSP in report-only mode, and enforcement is not built yet.

Phase 1, report-only, is built: `src/proxy.ts` sets a per-request nonce policy, delivered as `Content-Security-Policy-Report-Only`: `default-src 'self'`; `script-src 'self'` with the nonce and `'strict-dynamic'`; nonce `style-src`; `img-src 'self' blob: data:`; `font-src 'self'`; `connect-src 'self'`; `object-src 'none'`; `base-uri 'self'`; `form-action 'self'`; `frame-ancestors 'none'`. The root layout uses `await connection()` so pages render per request and receive the nonce. **[Built]**

Verified locally on a production build: the nonce differs on every request and matches every nonce attribute in the HTML, no enforcing header is sent, and the browser console in a clean guest window (no extensions) shows no violations. This was checked on the current placeholder page only. With `NEXT_PUBLIC_API_URL` set, `connect-src` becomes `'self'` plus the API origin (verified on a production build with `http://localhost:4000`). The value is inlined at build time, so the production build must set it. **[Built]**

Remaining before enforcement:
1. Violation collection: there is no report endpoint yet, so violations are visible only in the browser console. **[Planned]**
2. Repeat the browser check as new screens land. Done once on a production build for `/`, `/login` and `/register` (headers) and the `/login` console, which showed only the expected anonymous refresh 401. **[Ongoing]**
3. Enforce: resolve all report-only violations, verify nonce handling across the app, and test sign-in, registration, refresh, sign-out and the authenticated application under the enforced policy, then switch to `Content-Security-Policy`. **[Required, not built]**

Also planned: no third-party scripts without approval; a lint rule banning `dangerouslySetInnerHTML`; dependencies pinned and reviewed.

## 9. Lost refresh response (accepted v1 risk, with mitigations)

Refresh rotates the token on every page load. If a refresh response is lost on an unreliable network, the browser keeps the old cookie. After the backend's rotation window (about 10 seconds) the old token counts as reuse and the backend ends the session. The BFF cannot prevent this. For v1 we propose to accept it, with a clear "you were signed out, please sign in again" message and logging of how often it happens so the risk can be measured. The CTO accepted this for v1 on 2026-11-01 on three conditions: the refresh-token reuse handling is documented and tested; the user gets a clear recovery message; the event is logged without exposing tokens or other secrets, and its frequency is tracked after launch. **[Accepted]** The reuse handling and the bounded retry are built and tested (section 3), and the expiry notice that asks the person to sign in again is built. A message specific to this case and the event logging are **[Required, not built]**.

## 10. Session lifetime

Decided (CTO, 2026-11-01): sliding 7-day sessions with a 30-day absolute maximum. Each refresh issues a new 7-day token, so activity extends the session, but never beyond 30 days from the initial sign-in; after that the user must sign in again. The backend has to enforce the limit: it must keep the original sign-in time for each session and refuse refreshes after 30 days. The frontend cannot enforce it, because the BFF holds no state. The existing handling (any refresh 401 ends the session as expired) already covers the frontend side. **[Decided]** Backend enforcement: **[Required, not built]**

## 11. Horizontal scaling and deployment (Cloud Run direction)

The BFF keeps no state: no sessions, no in-memory guards that correctness depends on. Across instances, the backend's compare-and-swap rotation, the retries and the cross-tab lock are the safety net. Checklist before production **[Open]**:
- Serve over HTTPS so the `Secure` cookie is on.
- Set `BACKEND_URL` (server) and the browser API URL.
- Add the frontend origin to the backend `CORS_ALLOWED_ORIGINS`: an explicit allowlist, never `*`, and only the methods and headers the app needs.
- Run as a Next.js server container, not a static export.
- Verify the proxy hop count on the real platform.
- Verify the CORS and trusted-proxy configuration in the actual deployment before enabling production authentication (CTO release condition).

## 12. Open issue: login throttle behind the BFF

The backend throttles login per client IP. Behind the BFF every user arrives from the BFF's address, so one bucket serves everyone (tested: the 6th login from one IP gets a 429 for 900 s). A fixed trust-proxy hop count alone is unsafe for a public API, because a direct caller could forge `X-Forwarded-For` and choose its own limiter key. The reviewer recommends `trust proxy = 1` plus the BFF sending the user's IP with a shared secret that the backend verifies before honouring it. This is a backend security-control change and needs CTO approval. **[Approved with conditions, not built]** The CTO approved this only after the deployment topology is verified: trust only the known BFF or proxy hop, prevent clients from spoofing forwarded-IP headers, and verify that login throttling uses the actual client IP. It must not be enabled blindly in production. BFF login and register must not go to production until it is built and verified in the real deployment. Refresh and logout are unaffected. The BFF side (reading the client IP and sending it with the secret) is not built yet; it follows the topology check.

## 13. Evidence (local)

- No CSRF header: 403.
- Login: 200; cookie `tf_refresh; Path=/api/auth; Max-Age=604800; HttpOnly; SameSite=strict`; body has `accessToken` and `user`, no refresh token.
- Refresh: 200 with a rotated cookie. Replay of the old cookie: 401 `REFRESH_TOKEN_RECENTLY_ROTATED`, no `Set-Cookie`.
- Logout: `{"backendSessionEnded":true}` and a `Max-Age=0` cookie. Refresh afterwards: 401 `NO_SESSION`.
- CSP (report-only), production build on port 3002: the `Content-Security-Policy-Report-Only` nonce differed between two requests and matched every nonce attribute in the HTML (13 of 13, no script tag without a nonce); no enforcing `Content-Security-Policy` header was sent; a clean browser guest window showed an empty console and no issues. Checked on the placeholder page only.
- Browser auth (development server): login returns 200 and redirects to `/`; sign-out calls refresh (200) and then logout (200) and lands on `/login` with no expiry notice; registering an existing email shows the conflict message on the email field.
- Register through the BFF: 201, `tf_refresh` cookie (`HttpOnly; SameSite=strict; Path=/api/auth`, no `Secure` on the development server), body keys `accessToken` and `user` only, so registration signs the user in.
- Production build with the login and register screens: `/`, `/login` and `/register` return 200; nonces match on every page (no script tag without a nonce); no enforcing CSP header; `connect-src 'self'` plus the API origin; `font-src 'self'`. The `/login` console in a clean guest window shows only the anonymous refresh 401 and no CSP violations. The `/register` console was not separately inspected.
- Automated: 145 frontend tests passing, `tsc`, lint and build clean. The branch is on the remote as `feature/frontend-foundation` for review.

## 14. Decisions (CTO, recorded 2026-11-01)

1. Session design: **approved**, subject to a final security review before production.
2. Client-IP forwarding with `trust proxy = 1` (section 12): **approved with conditions**. Only after the deployment topology is verified; trust only the known BFF or proxy hop; prevent spoofed forwarded-IP headers; verify that login throttling uses the actual client IP; never enable blindly in production.
3. Session lifetime (section 10): **sliding 7-day with a 30-day absolute maximum** from initial authentication; reauthentication is required after the limit.
4. Lost refresh response (section 9): **accepted for v1 with mitigation**: reuse handling documented and tested, a clear recovery message, event logging without tokens or secrets, and frequency tracked after launch.
5. CSP (section 8): **required for production**. Resolve all report-only violations, verify nonce handling across the app, and test sign-in, registration, refresh, sign-out and the authenticated application under the enforced policy. Do not ship in report-only mode.

CORS: keep the backend implementation that supports this architecture. Browser requests go directly to the backend, with an explicit `CORS_ALLOWED_ORIGINS` allowlist, only the required methods and headers, and no wildcard origin. The BFF stays limited to the four auth routes; there is no Next.js API proxy.

Branding: the maroon is temporary until the palette and logo are finalized.

Release condition: decisions 1 to 5 are documented, the required security checks pass, and the CORS and trusted-proxy configurations are verified in the real deployment before production authentication is enabled.

Work still to build:
- Backend: the absolute 30-day session limit (section 10).
- BFF: client-IP forwarding with the shared secret, after the topology check (section 12).
- Frontend: a CSP enforcement switch and the enforced-policy test pass (section 8); event logging for lost refresh responses and a message specific to that case (section 9).
- Deployment: verify the CORS and trusted-proxy configuration in the real environment (section 11).
