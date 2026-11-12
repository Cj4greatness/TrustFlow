# Stability gate runner

Run from `backend/`:

```bash
./scripts/stability-gate.sh solo
./scripts/stability-gate.sh full
./scripts/stability-gate.sh parallel
./scripts/stability-gate.sh solo --runs 2
```

Modes run the auth rate-limit e2e spec 20 times, the serial full e2e suite 10
times, or the parallel full e2e suite 5 times, respectively. `--runs N` changes
the required consecutive-pass streak. Before every attempt, the runner flushes
Redis and aborts that attempt if the flush fails. It does not modify Postgres.

Each attempt has a full log under
`test-results/stability/<UTC-timestamp>-<mode>/`. `summary.md` and
`summary.json` record preflight details, per-run timing and Jest summaries,
failures, and the final gate result. A failed attempt resets the streak to
zero and is always recorded. By default the runner stops at the first failure.
`--continue-on-failure` keeps attempting until the requested streak is reached;
because the runner has no failure-explanation workflow, any failure still makes
the final result `GATE NOT PASSED`. Ctrl+C or termination writes a partial
summary with status `INTERRUPTED` and result `GATE NOT PASSED`.

Preflight requires the exact Node patch pinned by both `backend/package.json`
and the root `.nvmrc`, the pinned pnpm version, and running Redis and Postgres
Compose services. It records—but does not require—a clean worktree.

`STABILITY_GATE_TEST_CMD` is a test-only hook for validating runner failure
handling; do not use it for an actual gate. The command runs instead of Jest
after the normal Redis flush, with `STABILITY_GATE_RUN_NUMBER` set for each
attempt. For example, this fake command fails only on attempt 2:

```bash
STABILITY_GATE_TEST_CMD='test "$STABILITY_GATE_RUN_NUMBER" -ne 2' \
  ./scripts/stability-gate.sh solo --runs 3
```
