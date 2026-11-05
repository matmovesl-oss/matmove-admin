# Admin money stage 2 — claims, receipts and durable reviewed requests

This update builds on the user's unpushed November 4 Stage 1 files. It hardens payroll/refund code, verified Admin access, assignment validation and related tests/docs. A separate Concierge module is included in this release. It preserves the two Stage 1 ledgers and legacy refunds.
It does not change Customer code or add API filenames.

## Current release sequence

1. Run the signed-by-hash installer locally. It backs up replaced files outside Git,
   verifies every byte hash, runs TypeScript/build and the specified test files.
   It never executes SQL, contacts Monime, commits, pushes or changes environment
   variables. Tests use simulated provider responses and a temporary PostgreSQL engine.
2. Deploy matching stage-2 code with MATMOVE_ADMIN_MONEY_ENABLED absent or false.
   Review an exact file list before committing; exclude .bak, .env and unrelated edits.
   A missing Stage 2 SQL migration makes the money RPC fail closed.
3. Apply the complete
   supabase/migrations/20261104000200_admin_money_claims.sql in the shared Supabase
   SQL Editor. This creates no transfer and leaves campaign/wallet balances unchanged.
4. Run the supplied ADMIN_MONEY_STAGE2_READINESS.sql. Keep RLS enabled. Confirm the
   browser cannot execute the new RPCs or access the receipt index.
   Apply 20261104000300_admin_permission_registry.sql next; it accepts the explicit
   Concierge assignment without granting any new access. The legacy RPC lockdown
   (20261104000400) was already applied through the connected project on November 4.
5. Verify each business source with read-only balance checks. Configure dedicated,
   distinct source IDs and the explicit Monime environment. Keep new payments paused
   until test-environment verification and a reviewed live-release decision.

Server settings (never browser VITE variables):
- MONIME_STAFF_PAYROLL_ACCOUNT_ID (preferred); legacy MONIME_STAFF_PAYROLE_ACCOUNT_ID
  remains supported only if the preferred variable is absent.
- MONIME_REFUND_ACCOUNT_ID — dedicated refund account.
- MONIME_API_KEY and MONIME_SPACE_ID.
- MONIME_ENVIRONMENT=live in production; test for a separate test environment.
- MATMOVE_ADMIN_MONEY_ENABLED=false for the staged deployment. It gates NEW attempts;
  already-known original transfer receipts can still be checked while paused.

The UI reports a paused state when new payments are not enabled. This is intentional.
Environment changes require redeployment. Do not enable payments simply to dismiss
that message. A local build or mock test does not prove real provider settlement.

## What changed

- Authoritative current Admin assignment is checked on the server and again in SQL.
- Source IDs come from server configuration; recipients are resolved and verified.
- A database row lock and single-use claim authorize at most one POST per logical
  payment. Stable provider idempotency remains a second safeguard.
- An uncertain POST without a known provider ID is retained for review. It is never
  automatically re-POSTed, even if the provider's key cache expires.
- A known transfer is retrieved using GET and checked against its original amount,
  SLE currency, account pair, request key, beneficiary and initiating Admin metadata.
- Processing and terminal states cannot be overwritten by late older responses.
- Completed success requires a verified receipt; legacy unverified completed rows
  appear as needing review until the original receipt is confirmed.
- Original requests can be inspected after a wallet freeze or link/configuration
  change, but a new claim must satisfy current recipient eligibility.
- Staff selection, per-person amount, total and reason are reviewed before confirmation.
- Original payloads are saved per Admin identity in durable browser storage BEFORE
  POST. If storage is blocked/corrupt, there is no new transfer request.
- Reopening the page does not automatically submit a restored payment. Explicitly
  choosing Check original requests reuses the original payloads and keys.
- New single/bulk payroll and customer refunds remain separate. A legacy Stage 1
  pending payroll batch blocks fresh requests until it has been reviewed.
- Read-only, per-initiating-Admin history shows the latest 50 records. This is not a
  full-history reporting/export replacement, which remains a later task.

## Manual review and existing records

Existing rows are marked nonclaimable: they might already have reached Monime.
No migration treats an older initiating row as proof that no money was sent.
If an original provider ID is known, use its original request to check the receipt.
If no ID is known, a human must locate the original Monime transfer before receipt
attachment. This batch does not add a manual-attachment action. Never resolve this
by deleting a ledger row, clearing its request key, or issuing a replacement payment.
No customer balance is changed by a browser or by writing a guessed amount locally.

## Limits

This batch does not include new travel changes, ride cancellation changes,
new referral activation, payroll schedules, full analytics or automated worker jobs.
Staff eligibility uses the current authoritative profile role and available inactive/
frozen flags, and also denies any removed/inactive staff-access record. It does not
invent a new HR/employment table. Verify your operational staff setup before release.
No production provider credentials or live payments were used in the local checks.

## Additional access repairs

Admin entry and sidebar now use the verified current owner flag and assignments,
not an email-based bypass. Recovery sessions keep the existing identity/expiry gate.
All current Travel, Events, Games, Civitas and notification routes are retained.
Financials no longer opens a Realtime subscription before its assignment is verified.
Concierge has a new explicit assignment. Existing staff receive no new access.
See NOV04_RELEASE.md for the exact migration and release status.
