# Receipt reconciliation runner

Run from `backend/`:

```bash
# Default: dry-run, limit 100
pnpm reconcile:receipts

# Larger dry-run
pnpm reconcile:receipts -- --limit=500

# One organization, dry-run
pnpm reconcile:receipts -- --organizationId=<uuid>

# Execute explicitly
pnpm reconcile:receipts -- --execute --limit=100
```

The default is always a dry-run. `--execute` is required to write receipts.
The runner is capped at 10,000 per invocation and prints candidate and
reconciled payment IDs. Each execution uses the existing receipt creation
transaction and receipt-number counter, and is safe to rerun.
