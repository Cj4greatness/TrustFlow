# TrustFlow Engineering Standards

This document is the source of truth for how TrustFlow code is written, reviewed,
and shipped. Every engineer — human or AI-assisted — follows this. It reflects
real decisions made and real problems solved while building the engineering
foundation (Sprints 1–2), not aspirational rules written in a vacuum.

---

## Code Style

### TypeScript Rules
- **Strict mode is on.** `strictNullChecks` is enabled across both apps.
- **`any` is discouraged, not banned.** ESLint flags it as a warning
  (`@typescript-eslint/no-explicit-any: warn`) — visible in review, but not a hard
  blocker for the rare case it's genuinely needed (e.g. typing third-party
  libraries with poor type definitions).
- **No floating promises.** Every `async` call that isn't awaited or explicitly
  ignored gets flagged.
- **Configuration is centralized and typed.** No module reads `process.env`
  directly — see `backend/src/config/`. All env vars are validated at startup
  with Joi (`env.validation.ts`); the app refuses to boot if required vars are
  missing or malformed, rather than failing confusingly later.

### Naming Conventions
- Files: `kebab-case.ts` (e.g. `http-exception.filter.ts`)
- Classes: `PascalCase` (e.g. `RedisService`)
- Interfaces/Types: `PascalCase`, no `I` prefix (e.g. `AppConfig`, not `IAppConfig`)
- NestJS artifacts follow their suffix convention: `*.module.ts`, `*.service.ts`,
  `*.controller.ts`, `*.filter.ts`, `*.guard.ts`

### Folder Structure
Example: `feature/core-backend-foundation`

### Commit Message Format
Types used: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`.

Example from this sprint:

chore: fix gitignore, untrack node_modules and dist, configure husky + lint-staged


### Merge Rules

feature/* → develop → main

- No direct commits to `main`.
- A feature branch merges to `develop` only when its sprint is complete and
  verified locally (see Definition of Done below).
- `develop` merges to `main` only at a release point.

### Pre-commit Enforcement
Every commit runs ESLint + Prettier automatically via Husky + lint-staged,
scoped separately per app (`backend/**` and `frontend/**` use their own local
ESLint/Prettier configs). A commit that fails lint is blocked before it's
created — bad code style cannot enter the repository by accident.

**Known gotcha (solved, keep in mind):** git hooks run in a non-interactive
shell that does not load `nvm`. `.husky/pre-commit` explicitly sources nvm and
selects Node 22 before running lint-staged — if a hook mysteriously fails with
`util.styleText is not a function` or a Node version error, check that this
nvm-loading block is still intact at the top of the hook file.

---

## API Standards

### Response Format
Successful responses return the resource or result directly (no forced envelope
wrapper for success cases — see `/health` for the pattern: a flat object with
clear keys).

### Error Format
Every error, from every part of the application, returns this exact shape,
enforced globally by `HttpExceptionFilter`:
```json
{
  "success": false,
  "message": "Human-readable description",
  "statusCode": 400,
  "timestamp": "2026-07-22T10:00:00.000Z",
  "path": "/api/example",
  "details": { "optional": "structured data for debugging" }
}
```
`details` is included only when the thrown exception carried structured data
beyond a plain message (e.g. the health check's dependency breakdown on a 503).

### Validation Rules
- Every incoming request is validated globally via `ValidationPipe`
  (`whitelist: true, forbidNonWhitelisted: true, transform: true`).
- Unknown properties in a request body are stripped silently; if
  `forbidNonWhitelisted` catches something, the request is rejected with a
  clear validation error — never silently accepted with unexpected fields.
- DTOs (once modules with request bodies are built) use `class-validator`
  decorators; validation messages are user-facing, so they should be clear
  and specific, not generic.

### Swagger Requirements
- Every new controller must be reachable and documented at `/api/docs`.
- As modules are added, use `@ApiTags`, `@ApiOperation`, and `@ApiResponse`
  decorators so the generated docs stay meaningful, not just a bare route list.

---

## Logging

Structured JSON logging via `nestjs-pino`, applied globally. Every HTTP request
is logged automatically with method, path, status code, and response time.

### What Gets Logged
- Every request/response (method, URL, status, timing) — automatic, no
  per-route code needed.
- Application startup/shutdown events.
- Unexpected errors (full stack trace, server-side only).

### What Never Gets Logged
- `Authorization` headers — redacted by default (`redact: ['req.headers.authorization']`
  in the Pino config), in place ahead of Auth being built specifically so this
  isn't forgotten later.
- `Cookie` headers — same reasoning, same redaction.
- Passwords, tokens, or any credential — must never be passed to the logger,
  even accidentally via a logged object that happens to contain one. When
  logging an object that might contain sensitive fields, log an explicitly
  constructed subset, not the raw object.

### PII Handling
Once Customer/User modules exist: never log full customer records. Log
identifiers (e.g. `customerId`) rather than names, emails, or phone numbers
in routine operational logs. PII in logs becomes a compliance liability the
moment it exists — the cheapest time to prevent that is now, before the habit
forms.

---

## Environment Variables

### How Secrets Are Managed
- Real values live in `.env` (backend) / `.env.local` (frontend) — both
  **gitignored**, never committed.
- `.env.example` / `.env.local.example` are committed and list every variable
  with a placeholder or safe default, so any engineer can see what's required
  without needing the real values.
- Required variables are validated at application startup (backend, via Joi).
  Missing a required variable fails the app immediately with a clear error,
  rather than allowing it to start in a broken state.

### Local vs. Production
| | Local | Production |
|---|---|---|
| `DB_HOST` / `REDIS_HOST` | `localhost` (bare) or `postgres`/`redis` (Docker Compose) | managed service hostname |
| `DB_SYNCHRONIZE` | never `true` — migrations are the only schema source of truth, even locally | always `false` |
| Secrets | placeholder/dev values acceptable | must be strong, generated, and stored in a real secrets manager, never in a `.env` file on disk |

---

## Docker

### How Containers Should Be Added
When a new service (e.g. the future AI engine) needs its own container:
1. Add a `Dockerfile` inside that app's own folder (`ai-engine/Dockerfile`),
   following the same pattern as `backend/Dockerfile`: install deps → copy
   source → build → run, with `ENV CI=true` set before any `pnpm`/`npm install`
   step to prevent interactive prompts from hanging the build.
2. Add the service to the root `docker-compose.yml`, with an explicit
   `container_name`, `depends_on` (with `condition: service_healthy` where a
   real dependency exists), and only the ports it actually needs exposed.
3. Add a healthcheck if the service can meaningfully report its own health.

### Naming Conventions
- Container names: `trustflow-<service>` (e.g. `trustflow-backend`,
  `trustflow-postgres`)
- Service names in `docker-compose.yml` (used for internal DNS resolution
  between containers): short and plain — `postgres`, `redis`, `backend`,
  `frontend` — not prefixed, since Docker Compose already namespaces the
  network per-project.

### Networking Rules
- Services communicate using their **Compose service name** as hostname
  (e.g. backend connects to `postgres:5432`, not `localhost:5432` or
  `trustflow-postgres:5432`).
- Only expose ports to the host that genuinely need to be reachable from
  outside Docker (e.g. `4000` for the API, not internal-only future services).
- If a service can't resolve another service's hostname, don't assume it's a
  configuration bug before checking the obvious first: is the target
  container actually running and healthy right now? (`docker compose ps`)

---

## Definition of Done

A sprint is complete only when **all** of the following are true:

- ✅ **Code works** — runs locally without errors, verified by actually running it,
  not just by it compiling.
- ✅ **Docker works** — `docker compose up` boots the full stack successfully,
  verified end-to-end (not just "the containers started" — confirm the actual
  functionality, e.g. hit the endpoint and check the real response).
- ✅ **Swagger updated** — any new endpoint is visible and documented at `/api/docs`.
- ✅ **Tests pass** — once a test suite exists for the module in question.
- ✅ **Documentation updated** — this file and/or `docs/` reflects any new
  pattern, gotcha, or standard introduced by the sprint.
- ✅ **Merged into `develop`** — via the branch flow above, not left dangling
  on a feature branch.

If any of these is false, the sprint is not done — regardless of how much of
the original scope was completed.

---

## Notes From Building This Foundation

A few real lessons from Sprints 1–2, kept here so they aren't relearned the
hard way twice:

- **`git status` line count is a fast sanity check.** If a routine change
  shows thousands of lines changed, something is being tracked that
  shouldn't be (usually `node_modules` or a build output folder missing from
  `.gitignore`) — stop and investigate before committing.
- **New terminal sessions don't inherit `nvm`'s selected Node version**
  automatically in every context (new tabs, git hooks). If a command that
  worked a moment ago suddenly complains about an old Node version, check
  `node --version` first.
- **`docker compose` commands must be run from the directory containing
  `docker-compose.yml`** (the repo root) — running them from a subfolder
  fails with "no configuration file provided."
- **Transient Docker networking hiccups happen**, especially on the very
  first `up` after creating fresh networks/volumes. If a service can't reach
  another by hostname, a clean `docker compose down && docker compose up -d`
  is a reasonable first troubleshooting step before assuming a config bug.