# Backend update for the frontend engineer: 2026-10-17

Everything below was verified against the running API, not just read from code.

## 1. What changed (and what it means for you)

| Change | PR | Status | What you need to do |
|---|---|---|---|
| Orders race conditions fixed (confirm / cancel / complete) | #19 | pending CTO review | Orders is now integration-ready once this merges. See "Order transitions" below. |
| `/users/:id` now requires auth and only works for your own user | #20 | pending CTO review (security fix) | Never call `/users/:id` with another user's id. For members, use `GET /organizations/:id/members`. |
| OpenAPI export, Swagger bearer auth, `GET /organizations/:id/me` | this PR | pending CTO review | Generate your API client from `docs/openapi.json`. Use `/me` for role-aware UI. |

Until those PRs merge into `develop`, build against the contract below; it will not change.

## 2. OpenAPI file

- Committed at `docs/openapi.json` (59 paths, 85 operations, bearer scheme defined).
- Regenerate after any backend change: `cd backend && pnpm openapi:export` (no database needed).
- Live copy while the backend runs: `http://localhost:4000/api/docs` (UI) and `/api/docs-json` (raw). The UI now has an **Authorize** button; paste an access token.
- Auth endpoints now document their real response shape (`AuthResponseDto`).

## 3. New endpoint: my role and permissions

`GET /organizations/:id/me` (any member; non-members get 403, anonymous gets 401)

```json
{
  "organizationId": "5aa683b7-...",
  "memberId": "…",
  "userId": "…",
  "role": "owner",
  "permissions": ["customer:create", "customer:delete", "…"]
}
```

- `permissions` is exactly what the server enforces for that role (alphabetical). Drive show/hide/disable of buttons and routes from this list, **not** from role names.
- It is UX only. The server re-checks every request; a hidden button is never the security boundary.
- Always send the org id in the path. A client-supplied org id never grants anything by itself.
- Refetch when the user switches organization. Roles are per organization.

### Permission matrix (generated from the server's source of truth)

`delivery:create` and `receipt:create` are held by no role on purpose: deliveries and receipts are created automatically (order -> PROCESSING, payment succeeded). There is no endpoint to create them manually.

Staff and Viewer rows below are the current enforced values. They are **not yet confirmed by the CTO as final**, so avoid hard-coding assumptions about those two roles.

| Permission | Owner | Admin | Manager | Staff | Viewer |
|---|:-:|:-:|:-:|:-:|:-:|
| `customer:create` | ✓ | ✓ | ✓ | ✓ |  |
| `customer:delete` | ✓ | ✓ |  |  |  |
| `customer:read` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `customer:update` | ✓ | ✓ | ✓ |  |  |
| `customer_note:create` | ✓ | ✓ | ✓ | ✓ |  |
| `customer_note:read` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `delivery:assign` | ✓ | ✓ | ✓ |  |  |
| `delivery:cancel` | ✓ | ✓ |  |  |  |
| `delivery:create` |  |  |  |  |  |
| `delivery:read` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `delivery:transition` | ✓ | ✓ | ✓ |  |  |
| `inventory:adjust` | ✓ | ✓ | ✓ | ✓ |  |
| `inventory:read` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `inventory:update` | ✓ | ✓ | ✓ |  |  |
| `invoice:approve` | ✓ | ✓ |  |  |  |
| `invoice:create` | ✓ | ✓ | ✓ | ✓ |  |
| `invoice:issue` | ✓ | ✓ |  |  |  |
| `invoice:read` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `invoice:update` | ✓ | ✓ | ✓ |  |  |
| `member:invite` | ✓ | ✓ |  |  |  |
| `member:remove` | ✓ | ✓ |  |  |  |
| `member:update` | ✓ | ✓ |  |  |  |
| `member:view` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `order:cancel` | ✓ | ✓ |  |  |  |
| `order:complete` | ✓ | ✓ | ✓ |  |  |
| `order:confirm` | ✓ | ✓ | ✓ |  |  |
| `order:create` | ✓ | ✓ | ✓ | ✓ |  |
| `order:process` | ✓ | ✓ | ✓ | ✓ |  |
| `order:read` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `order:update` | ✓ | ✓ | ✓ |  |  |
| `organization:create` | ✓ |  |  |  |  |
| `organization:delete` | ✓ |  |  |  |  |
| `organization:update` | ✓ | ✓ |  |  |  |
| `organization:view` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `ownership:transfer` | ✓ |  |  |  |  |
| `payment:create` | ✓ | ✓ | ✓ |  |  |
| `payment:read` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `product:create` | ✓ | ✓ | ✓ |  |  |
| `product:delete` | ✓ | ✓ |  |  |  |
| `product:read` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `product:update` | ✓ | ✓ | ✓ |  |  |
| `receipt:create` |  |  |  |  |  |
| `receipt:read` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `receipt:regenerate` | ✓ |  |  |  |  |
| `receipt:void` | ✓ | ✓ |  |  |  |
| `receipt_settings:read` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `receipt_settings:update` | ✓ | ✓ |  |  |  |
| `supplier:create` | ✓ | ✓ | ✓ |  |  |
| `supplier:delete` | ✓ | ✓ |  |  |  |
| `supplier:read` | ✓ |  |  |  |  |
| `supplier:update` | ✓ | ✓ | ✓ |  |  |
| `supplier_product:manage` | ✓ | ✓ | ✓ |  |  |

## 4. Contract facts you can rely on

**Money has two conventions.**
- Orders, order items, products: **decimal naira strings**, e.g. `"1500.50"`, `"3001.00"`.
- Invoices, payments, receipts: **integer kobo as JSON numbers**, e.g. `300100`. (Order total `"3001.00"` becomes invoice total `300100`.)
- Never do float math on either. Convert at the edge: naira string -> kobo integer = multiply by 100 using string/decimal arithmetic, and format kobo -> naira only for display.

**Errors** always look like:
```json
{ "success": false, "message": "string or string[]", "statusCode": 400, "timestamp": "…", "path": "/…", "details": { "code": "…" } }
```
`message` is an **array** for validation errors (400). `details.code` is only present for a few auth errors.

**Lists** (e.g. orders) return `{ data, total, page, limit, totalPages }`. Query params `page` and `limit`.

**Auth responses** (`/auth/register`, `/auth/login`, `/auth/refresh`) return `{ user, accessToken, refreshToken }`.
- Access token: 15 minutes. Refresh token: 7 days, **single use**: every refresh rotates it.
- Only **one session per user**: logging in on a second device invalidates the first.
- Keep the refresh token out of JS-readable storage (BFF `HttpOnly` cookie, as the CTO approved). No tokens in `localStorage`.
- Serialize refreshes: one in flight at a time, queue the rest. No refresh loops.

**Auth error codes** (in `details.code` on a 401 from `/auth/refresh`):
| Code | Meaning | What to do |
|---|---|---|
| `SESSION_REPLACED_BY_NEW_LOGIN` | The user logged in somewhere else | Sign out and show "You were signed out because you signed in on another device". Do **not** retry. |
| `REFRESH_TOKEN_RECENTLY_ROTATED` | Two refreshes raced; the other one won (10 s window) | Do **not** log the user out. Wait briefly and use the token the winning request stored, then retry once. |
| *(no code)* 401 | Invalid or expired token, or reuse of a stale token (session is wiped) | Sign out. |

**Login rate limit:** 5 attempts per 15 minutes per IP and per email (HTTP 429). Disable the submit button while a request is in flight and surface the 429 clearly; do not auto-retry.

**Order transitions** (`POST /organizations/:id/orders/:orderId/{confirm|process|complete|cancel}`):
- Allowed: DRAFT -> CONFIRMED -> PROCESSING -> COMPLETED; CANCELLED from DRAFT, CONFIRMED or PROCESSING. COMPLETED and CANCELLED are final.
- Success returns the order. These POSTs return **201** (Nest default), not 200; treat any 2xx as success.
- Confirm deducts stock and creates the invoice; cancel from CONFIRMED/PROCESSING restores stock; process needs a `shippingAddressId` and auto-creates the delivery.
- A 400 `Cannot transition order from X to Y` means the order already moved (another tab or user, or a double click). **Refetch the order and re-render**; do not show it as a crash.
- Disable transition buttons while a request is in flight, and drive which buttons appear from the order's current `status`.
- Items can only be edited while the order is DRAFT.

**Invitations:** `POST /organizations/:id/invitations` returns the full invitation including `token`. Treat that response as sensitive and don't log it.

## 5. Not ready / waiting on the CTO

- Staff and Viewer permission rows: not confirmed final (see above).
- Receipt regenerate (`POST …/receipts/regenerate/:paymentId`) is Owner-only for now, pending the Owner vs Owner/Admin decision (D2).
- Cancelling a PROCESSING order does not touch its delivery. Business rule pending; show a warning on that action if you build it.
- Account deletion (`DELETE /users/:id`) does not yet revoke sessions or memberships. Don't expose it in the UI yet.
- n8n automation is on hold; nothing for the frontend there.

## 6. Questions to send back to the backend

Reply with anything that doesn't match this contract and I'll fix the backend or the doc, whichever is wrong.
