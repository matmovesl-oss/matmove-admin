# Financial production-readiness findings

Review date: 2026-11-04  
Scope: read-only review of the production Supabase project and the Admin application branch. This document is an engineering review, not a statement that live transfers or provider reconciliation have been performed.

## Verified database facts

- `matmove_admin_refunds` and `matmove_admin_payroll` exist.
- Both ledgers have Row Level Security enabled.
- The ledgers have unique constraints on `request_key` and `provider_transfer_id`, positive `amount_minor` checks, SLE currency checks, and state/account validation checks.
- The ledger grants observed are for `service_role` and `postgres`; no `anon` or `authenticated` grants were returned.
- Both money ledgers currently contain zero records.
- `wallet_transactions` currently contains zero records; `ledger_transactions` has five records, all in opening-balance or reversal categories.

## Wallet-link and payment reconciliation

- SLE wallets: 34 total, 26 with a Monime account link, 8 without a link.
- USD wallets: 21 total, 3 with a Monime account link, 18 without a link.
- No duplicate account IDs or direct-column/metadata link conflicts were found in the current wallet set.
- `payment_transactions` contains 11 Monime SLE wallet top-up records. All are still marked `pending`, all have provider references and a stored initial provider response whose result status is `pending`, and all were last updated from 2026-09-12 through 2026-09-16.
- All 11 pending payment records are older than 24 hours. Do not mark them completed, failed, or cancelled based only on their age. Each must be reconciled against Monime using its provider reference and the current documented retrieval API.
- Current local `wallets.balance` totals are 0.00 for both SLE and USD. These values must not be treated as proof that the corresponding Monime balances are zero. The Admin Financials page separately reads verified provider balances.

## Webhook release blocker

The existing `api/monime-webhook.ts` handler needs a security and schema rewrite before this route is approved for production use:

1. It applies incoming event payloads without verifying a provider signature or authenticating the sender.
2. It does not deduplicate webhook event deliveries before applying balance/payment/transaction changes.
3. Its `wallet_transactions` insert uses `user_id` and `type`, while the live table schema uses `transaction_type`, `currency`, and other required columns and does not expose those two fields as written.
4. It ignores errors from several database updates/inserts and may still acknowledge an event with HTTP 200.
5. Its event names and payload field paths must be checked against the current Monime event specification before mapping provider statuses or balances.

Do not guess the signature algorithm or event schema. The public Monime API reference available during this review describes its API release and minor-unit money representation, but did not expose an authoritative webhook signing contract or test vectors. Obtain Monime's current official webhook signing instructions, sample raw event payloads, event names, retry behavior, and payment retrieval endpoint before implementing verification. Keep the service-role secret server-side.

## Work already on the Admin working branch

- Guarded the Monime account-balance API so hitting the 100-page pagination safety limit returns an explicit error rather than silently falling through without a response.
- Refactored the refund API to support injected authorization, environment and fetch dependencies for isolated tests; production defaults remain unchanged.
- Added mocked refund tests for SLE customer-wallet linkage, amount validation, completed request replay and pending-transfer recovery.
- Added `npm test` and GitHub Actions checks for tests, type-checking and production build.

## Release gates

- Get the webhook signing and event contract directly from Monime; implement raw-body signature verification, timestamp tolerance/replay protection, event deduplication and schema-correct idempotent database writes.
- Reconcile all 11 stale pending payment references with Monime and record the verified outcome. Do not bulk-update statuses.
- Investigate and repair the 26 unlinked wallet records only with verified account ownership. Do not infer account links.
- Run refund and payroll mocks, type-check and build; then conduct provider sandbox tests with test accounts only.
- Verify SLE and USD remain separate denomination ledgers. Any conversion must use an explicit quote/rate, defined fee/rounding rules, expiry and a confirmed source/destination currency pair.
- Add reporting that keeps provider minor units, local major-unit values and currencies clearly distinguished.
- Keep production changes unmerged and undeployed until release gates are satisfied.
