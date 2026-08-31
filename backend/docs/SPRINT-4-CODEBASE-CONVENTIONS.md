# Sprint 4 Codebase Conventions

**Status: VERIFIED BASELINE** — derived from the completed Customer module (entities, DTOs, repositories, service, controllers, permission mappings, e2e suite — all built, built-checked, and CI-verified on `origin/develop`).

This document does not define Product & Inventory requirements. It records how the Customer module was actually built, so future modules can be checked against real, working precedent instead of re-deriving conventions from scratch or guessing. Where an eventual CTO directive for Product & Inventory (or Suppliers, or any later module) genuinely requires a deviation from something below, that deviation must be **explicitly documented and justified** at the point it's introduced — not silently substituted.

---

## 1. Routing

- Parent resources are nested under the organization: `organizations/:id/<resource>`. The organization route param is always named `:id`, never `:organizationId`.
- Child resources nest one level deeper under their parent's ID: `organizations/:id/<resource>/:resourceId/<child-resource>`.
  - Example: `organizations/:id/customers/:customerId/addresses`, `organizations/:id/customers/:customerId/notes`.
- Every route param that identifies a specific row uses `ParseUUIDPipe`.
- Independent sub-resources with their own lifecycle rules (e.g. addresses vs. notes) get their **own controller**, not a single fat controller for the whole module.

## 2. Authentication & Authorization

- Every controller class carries `@UseGuards(AuthGuard('jwt'), PermissionsGuard)` and `@ApiBearerAuth()` at the class level.
- Every mutating or resource-scoped method carries `@Permissions(Permission.X)`.
- `PermissionsGuard` only confirms the actor holds the required permission **within the organization identified by the route** — it does not confirm the target row (customer, address, product, etc.) actually belongs to that organization. That check happens one layer down, in the service (see §3).

## 3. Tenant Isolation

- Isolation is **manual**, not structural. There is no shared base repository or base service class that enforces it automatically (Sprint 4 CTO decision).
- The pattern: a private `getOwnedXOrThrow(organizationId, resourceId)` method on the service, called at the start of every method that reads or mutates an existing row. It loads the row by ID, then explicitly compares `row.organizationId !== organizationId` and throws `NotFoundException` if they don't match (not `ForbiddenException` — a mismatch reads as "doesn't exist" from the caller's perspective, which avoids leaking whether a given ID exists in another org).
- For nested child resources (e.g. an address under a customer), the isolation check walks the chain: confirm the parent belongs to the org first, then confirm the child belongs to both the org and the specific parent.
- Child entities **denormalize `organizationId`** onto their own row, even when it's reachable via a join through the parent. This keeps every isolation check a single-column comparison instead of a join — deliberately avoiding the exact class of gap the Sprint 3 RBAC audit found in `listMembers()` (a check present on the obvious path, missing one join away).

## 4. Repository Pattern

- Plain CRUD (`create()`, `save()`, `findById()`) plus purpose-named finders (`findByOrganization()`, `existsByOrganizationAndEmail()`, etc.) — no generic/dynamic query methods.
- `create()` returns a plain (unsaved) entity instance; `save()` persists it. These are always two separate calls, matching every other repository in the codebase (`UsersRepository`, `OrganizationsRepository`, etc.) — never a single `upsert`-style method.
- Deletion uses `repository.softDelete({ id })`, not a hard delete, for any entity extending `BaseEntity` (which carries `deletedAt`). `findById()`/`find()` automatically exclude soft-deleted rows — this is TypeORM's built-in behavior for entities with a `@DeleteDateColumn`.
- **`createQueryBuilder()` does not get this exclusion for free.** Anywhere query builder is used (free-text search, complex filtering, pagination) `andWhere('<table>.deleted_at IS NULL')` must be added explicitly, or soft-deleted rows will leak back into results. This is easy to miss and worth checking specifically in review.
- Pagination (first introduced for `listCustomers`) returns `{ data, total, page, limit, totalPages }`. No response-wrapper class exists for this yet — it's a plain interface local to the repository file.

## 5. DTO Conventions

- Create DTOs omit any field derivable from the route (`organizationId`, parent IDs) or the authenticated user (`createdBy`, `authorId`). These are supplied by the controller/service, never accepted from the client.
- Update DTOs are **hand-written, all fields optional** — no DTO in the codebase uses `PartialType`. Mirrors `UpdateOrganizationDto`/`UpdateUserDto`.
- Cross-field business rules (e.g. "a display name must be derivable from the fields provided") are deliberately **not** encoded as class-validator rules on the DTO. They're enforced in the service layer, where the full context (existing row state, computed defaults) is available.
- Query DTOs use `@Type(() => Number)` from `class-transformer` alongside `class-validator` decorators for numeric query params (pagination), since query strings arrive as raw strings and need explicit coercion. Requires the global `ValidationPipe` to run with `transform: true` (already set in `main.ts`).

## 6. Entity Conventions

- All entities extend `BaseEntity` (`id`, `createdAt`, `updatedAt`, `deletedAt`).
- Foreign key relations follow the `Invitation.invitedBy` / `inviter` pattern: a bare `uuid` column for the raw FK value, plus a separately-named `@ManyToOne` relation via `@JoinColumn` pointing at the same column, with `onDelete: 'CASCADE'`.
- Business-state enums (e.g. `CustomerStatus.ARCHIVED`) are kept explicitly distinct from `deletedAt` — archiving is a business decision the data stays queryable for; soft-delete is a data-lifecycle removal. Do not conflate the two on any future entity.
- Partial unique indexes are used for conditional uniqueness (e.g. unique per-org email, but only where the email is non-null and the row isn't soft-deleted).

## 7. API Response Convention

- Controllers return raw entities directly unless the entity carries a field that must never be serialized to the client (e.g. `User.passwordHash`), in which case a dedicated `@Exclude()`/`@Expose()` response DTO is used (`UserResponseDto`, `OrganizationResponseDto`, `MemberResponseDto`).
- Customer has no such sensitive fields, so no `CustomerResponseDto` exists — this is a deliberate omission, not an oversight. A future entity with sensitive fields should get its own response DTO following the existing `@Exclude()`/`@Expose()` pattern, not skip it by precedent.

## 8. E2E Convention

- E2E specs live at `test/smoke/*.e2e-spec.ts`. **Not** under `src/`.
- This is a hard constraint, not just convention: `test/jest-e2e.json` sets `"rootDir": "."` (which resolves relative to the config file's own location, i.e. `test/`) and `"testRegex": ".e2e-spec.ts$"`. A spec placed outside `test/` will never be discovered or run — it will fail silently, with no error, giving false confidence that coverage exists.
- Each suite is self-contained and rerunnable: test users are registered with randomized emails per run (`randomUUID().slice(0, 8)` suffix), no manual DB seeding or cleanup required between runs.
- `beforeAll` hooks that perform multiple sequential register+login round trips (real HTTP calls, real argon2 hashing) can exceed Jest's default 5000ms hook timeout under system load — especially with more than ~5 users being set up. Pass an explicit higher timeout as the second argument: `beforeAll(async () => { ... }, 30000)`. This is not a sign of a broken app; it's test-harness plumbing, and should be set proactively for any new suite with a similarly heavy `beforeAll`.
- Cross-organization isolation must be an explicit test case: create a resource under Org A, then attempt to reach it through Org B's route (with a valid Org B token and the real resource UUID), and assert `404`. This is the regression class the Sprint 3 audit exists to prevent.
- RBAC tests should assert **actual current behavior**, including known gaps under CTO review (e.g. the flagged `CUSTOMER_UPDATE` permission gap for Manager/Staff). A test's job is to document what the system does, not to silently "fix" an unresolved permission question by asserting what it thinks the behavior *should* be.

## 9. Verification Sequence (required before calling any module complete)

1. `pnpm build` (or `nest build`) — confirms compilation, no TypeScript errors.
2. `pnpm test:e2e` (or `npx jest --config ./test/jest-e2e.json --runInBand`) — confirms the new suite is explicitly listed as `PASS` by name, not just a green summary count. A suite that never ran is indistinguishable from a suite that isn't needed unless you check its name appears.
3. `git status` — confirms nothing is left uncommitted or untracked before considering the module "done."
4. `git push` + CI — local green is necessary but not sufficient. A module is only complete once GitHub Actions independently confirms it, since CI runs in a clean environment and catches anything that was accidentally dependent on local machine state.

---

## Explicitly Out of Scope for This Document

The following are Product & Inventory (or later-module) design questions, not conventions extractable from Customer. They are **not** addressed here and should not be inferred from anything above:

- Product variants / SKUs
- Stock movements / adjustments / warehouses
- Reorder thresholds / procurement triggers
- AI Inventory Intelligence (forecasting, recommendations, automation) — architecture vision only, scope for Sprint 4 unconfirmed
- Supplier entity design or its relationship to Product/Procurement
- Anything from the Order Management, Delivery/Logistics, Finance/Accounting, Workflow Automation, Communication Hub, or Marketplace/Plugin modules

These remain open until their respective CTO directives arrive.
