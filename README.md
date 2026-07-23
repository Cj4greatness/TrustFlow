# TrustFlow

**TrustFlow** is an AI-powered Business Operating System for small and medium-sized businesses (SMBs). It helps business owners manage customers, products, inventory, orders, finance, deliveries, and communication — all from one intelligent platform, with an AI assistant that automates repetitive operational work instead of replacing the business owner's judgment.

TrustFlow is not a chatbot, not a CRM, and not accounting software. It's the operating system a business runs on.

**Who it's for:** SMB owners — starting with businesses in Nigeria and expanding across Africa — who currently run their operations across spreadsheets, WhatsApp, and paper, and need one connected system instead.

> **Status:** Engineering foundation complete (Sprints 1–2). No business features are implemented yet — see [Roadmap](#roadmap). See [`docs/engineering-standards.md`](docs/engineering-standards.md) for coding, Git, and API conventions.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js (App Router), TypeScript, Tailwind CSS, shadcn/ui |
| Backend | NestJS, TypeScript |
| Database | PostgreSQL |
| Cache | Redis |
| Infrastructure | Docker, Docker Compose |
| Package Manager | pnpm |
| AI (planned) | Python, FastAPI — not yet implemented |

---

## Folder Structure
trustflow/
├── frontend/ # Next.js web application
├── backend/ # NestJS API server
├── docker/ # Reserved for infra configs (nginx, init scripts) as the project grows
├── docs/ # Project documentation (architecture, API, deployment, sprint reports)
├── docker-compose.yml
└── README.md

- **`frontend/`** — The customer-facing web app. Currently a placeholder landing page confirming the environment is wired up correctly.
- **`backend/`** — The API server. Currently provides application infrastructure only: validated configuration, PostgreSQL + Redis connections with health checks, structured logging, global error handling and request validation, and live API docs at `/api/docs`. No business modules (Auth, CRM, Inventory, Orders, Finance, etc.) yet — those are added sprint by sprint.
- **`docker/`** — Empty for now. Will hold shared infrastructure configuration that doesn't belong to a single app (e.g. reverse proxy config) as the project grows.
- **`docs/`** — Empty for now. Will hold architecture decisions, API references, deployment guides, and sprint reports as they're written.

---

## Installation

### Prerequisites
- **Node.js 22+** — check with `node --version`
- **pnpm** — install with `npm install -g pnpm`
- **Docker Desktop** (with WSL2 integration enabled, if on Windows)
- **Git**

### Steps

```bash
git clone <your-repo-url> trustflow
cd trustflow

# Frontend
cd frontend
pnpm install
cp .env.local.example .env.local
cd ..

# Backend
cd backend
pnpm install
cp .env.example .env
cd ..
```

---

## Running with Docker

This is the recommended way to run the full stack — it starts the frontend, backend, PostgreSQL, and Redis together, networked correctly.

**First time, or after pulling new code:** always rebuild before starting, since
Docker does not automatically detect code changes and will silently run stale
images otherwise:
```bash
docker compose build
docker compose up -d
```

**Subsequent starts with no code changes** (e.g. restarting your machine):
```bash
docker compose up -d
```

If something seems out of date or a container is behaving unexpectedly, force a
completely clean rebuild:
```bash
docker compose down
docker compose build --no-cache
docker compose up -d
```

### Running without Docker (local development)

You can also run each app directly on your machine, useful for faster iteration:

```bash
# Terminal 1 — frontend
cd frontend
pnpm dev

# Terminal 2 — backend (requires Postgres/Redis running separately, e.g. via `docker compose up postgres redis -d`)
cd backend
pnpm run start:dev
```

---

## Development Workflow

```bash
# 1. Clone
git clone <your-repo-url> trustflow
cd trustflow

# 2. Install dependencies (per app)
cd frontend && pnpm install && cd ..
cd backend && pnpm install && cd ..

# 3. Run
docker compose up -d
# or run frontend/backend individually as shown above

# 4. Make your changes, then commit
git add .
git commit -m "Describe what changed"

# 5. Push and open a PR into develop
git push origin <branch-name>
```

Branching follows `feature/* → develop → main` — see
[`docs/engineering-standards.md`](docs/engineering-standards.md#git) for full
branch naming and merge rules. Never commit directly to `main`.

---

## Architecture Overview

TrustFlow is a two-application system (frontend + backend) backed by PostgreSQL and Redis, containerized with Docker Compose for consistent local development.

- **Frontend (Next.js)** communicates with the **Backend (NestJS)** over HTTP via a REST API.
- **Backend** owns all business logic and data access — the frontend never talks to the database directly.
- **PostgreSQL** is the system of record for all business data (no tables yet — this is added module by module).
- **Redis** will be used for caching, session storage, and rate limiting once those features are built.
- An **AI service** (Python/FastAPI) is planned for a future sprint. It will call backend tools/APIs rather than accessing the database directly — the AI is never the source of business logic.

A more detailed architecture document will be added to `docs/` as the system grows.

---

## Environment Variables

### `frontend/.env.local`

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_API_URL` | Base URL the frontend uses to call the backend API (e.g. `http://localhost:4000`) |

### `backend/.env`

| Variable | Description |
|---|---|
| `NODE_ENV` | Environment mode (`development`, `production`) |
| `PORT` | Port the API server listens on (default `4000`) |
| `DB_HOST` | PostgreSQL host (`localhost` locally, `postgres` inside Docker) |
| `DB_PORT` | PostgreSQL port (default `5432`) |
| `DB_USERNAME` | PostgreSQL username |
| `DB_PASSWORD` | PostgreSQL password |
| `DB_NAME` | PostgreSQL database name |
| `REDIS_HOST` | Redis host (`localhost` locally, `redis` inside Docker) |
| `REDIS_PORT` | Redis port (default `6379`) |

Never commit real `.env` files — only `.env.example` / `.env.local.example` are tracked in git.

---

## Troubleshooting

**`docker compose up` fails with "address already in use" on port 5432 or 6379**
Something else on your machine (often a native Postgres/Redis install) is already using that port. Find and stop it:
```bash
sudo ss -tlnp | grep 5432
sudo service postgresql stop   # if it's a native Postgres service
```

**Backend fails with `getaddrinfo EAI_AGAIN postgres`**
The backend container can't resolve the `postgres` hostname. This usually resolves itself on a clean restart:
```bash
docker compose down
docker compose up -d
```
If it persists, confirm both containers are on the same network:
```bash
docker network inspect trustflow_default
```

**`pnpm install` fails with `ERR_PNPM_IGNORED_BUILDS`**
pnpm is blocking a native build script pending approval. Run:
```bash
pnpm approve-builds
```

**Docker build fails with `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`**
pnpm is trying to prompt interactively inside a non-interactive Docker build. Already handled in this repo's Dockerfiles via `ENV CI=true` — if you see this again, confirm that line is present.

**Docker build fails with `ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION`**
pnpm's supply-chain policy is rejecting a recently-published package. Ensure `pnpm-workspace.yaml` (which contains the `minimumReleaseAgeExclude` list) is copied into the Docker build context before `pnpm install` runs.

**`nvm: command not found` in a new terminal**
Your shell hasn't loaded nvm yet. Run:
```bash
source ~/.bashrc
```

---

## Roadmap

### Version 1 (in progress)
- ✅ Sprint 1 — Engineering foundation (repo, frontend/backend scaffolds, Docker)
- ✅ Sprint 2 — Core framework (config, logging, database + Redis modules, global exception handling, validation, Swagger, code quality tooling)
- ⏳ Sprint 3 — Identity & Multi-Tenant Foundation (Auth, Organizations, Users, RBAC)
- Customers (CRM)
- Product Catalog & Inventory
- Orders
- Finance (invoicing, ledger, payments)
- Delivery & Logistics
- Communication Hub (WhatsApp, Instagram, Messenger, email, web chat)
- TrustFlow AI — single AI orchestrator with internal backend tools

### Version 2 (future)
- Multi-agent AI workforce (see product vision documentation)
- Marketplace & plugin architecture
- Advanced analytics & forecasting
- Multi-country expansion (Ghana, Kenya, Rwanda, South Africa)

### AI (future)
- Python/FastAPI AI service
- Tool-calling architecture connecting AI to backend modules
- AI-assisted onboarding, insights, and daily briefings

---

## Team

- **Founder** — Vision & Product
- **CTO** — Architecture & Technical Direction
- **Engineer** — Implementation

Built one sprint at a time, foundation before features.
