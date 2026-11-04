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
- All 11 provider references use the `scs-` prefix and match the stored checkout-session response IDs. These are Monime **Checkout Session IDs**, not Payment IDs; the documented read endpoint is `GET /v1/checkout-sessions/{id}`.
- The stored checkout-session snapshots have `status: pending`, metadata that matches each local payment and wallet ID, a single SLE line item of 100 minor units (SLE 1.00), and a line-item reference matching the local payment ID.
- Important settlement finding: all 11 stored checkout-session snapshots point to the same `financialAccountId` (a platform account), while each local payment links to a different customer SLE wallet account. This may be an intentional platform-settlement design followed by a separate wallet-credit step, but that credit flow is not yet proven. Do not treat a completed checkout session as proof that a customer wallet was credited.
- All 11 pending payment records are older than 24 hours. Do not mark them completed, failed, or cancelled based only on their age. Reconcile each session using the official checkout-session retrieval endpoint, verify current provider status, wallet/user/amount metadata and the intended settlement-to-wallet-credit process.
- Current local `wallets.balance` totals are 0.00 for both SLE and USD. These values must not be treated as proof that the corresponding Monime balances are zero. The Admin Financials page separately reads verified provider balances.

## Webhook release blocker

The existing `api/monime-webhook.ts` handler needs a security and schema rewrite before this route is approved for production use:

1. It applies incoming event payloads without verifying a provider signature or authenticating the sender.
2. It does not deduplicate webhook event deliveries before applying balance/payment/transaction changes.
3. Its `wallet_transactions` insert uses `user_id` and `type`, while the live table schema uses `transaction_type`, `currency`, and other required columns and does not expose those two fields as written.
4. It ignores errors from several database updates/inserts and may still acknowledge an event with HTTP 200.
5. Its event names and payload field paths must be checked against the current Monime event specification before mapping provider statuses or balances. The documented Checkout Session event names include `checkout_session.completed`, `checkout_session.cancelled`, and `checkout_session.expired`.

Do not guess the signature algorithm or event schema. The public Monime API reference confirms webhook envelope structure and Checkout Session events, but the accessible official documentation did not provide the full HMAC signing construction and verification test vectors needed to safely implement the signature check. Obtain Monime's current official webhook signing instructions, exact signature header/canonical payload rules, timestamp tolerance, sample raw event payloads, retry behavior, and event retrieval contract before implementing verification. Keep the service-role secret server-side.

## Work already on the Admin working branch

- Guarded the Monime account-balance API so hitting the 100-page pagination safety limit returns an explicit error rather than silently falling through without a response.
- Refactored the refund API to support injected authorization, environment and fetch dependencies for isolated tests; production defaults remain unchanged.
- Added read-only GET history views for the last 100 refund and payroll ledger records.
- Added mocked refund and payroll tests for SLE wallet linkage, amount validation, idempotency/replay and pending recovery.
- Added read-only `GET /api/admin-reconcile-topups` to retrieve pending Checkout Sessions from Monime and compare status, local payment/wallet identity, currency and amount. Every result is explicitly `safeToAutoUpdate: false`; this endpoint has not yet been deployed or executed against live Monime sessions.
- Added a read-only pending-top-up preview to the Admin Gateway Transactions page.
- Added mocked reconciliation tests for completed/cancelled/expired sessions, metadata mismatches, wallet mismatches, provider errors and the no-write guarantee.
- Added `npm test`, a focused `npm run test:finance` suite, and GitHub Actions checks for tests, type-checking and production build.

## Release gates

- Get the webhook signing and event contract directly from Monime; implement raw-body signature verification, timestamp tolerance/replay protection, event deduplication and schema-correct idempotent database writes.
- Deploy the read-only top-up reconciliation preview only to an authorised staging/admin environment with server-side Monime credentials, run it against the 11 pending Checkout Sessions, and inspect the result. Do not change payment statuses or wallet balances until the platform settlement and wallet-credit design is verified.
- Reconcile all 11 stale pending payment references with Monime and record the verified outcome. Do not bulk-update statuses.
- Investigate and repair the 26 unlinked wallet records only with verified account ownership. Do not infer account links.
- Run refund and payroll mocks, type-check and build; then conduct provider sandbox tests with test accounts only.
- Verify SLE and USD remain separate denomination ledgers. Any conversion must use an explicit quote/rate, defined fee/rounding rules, expiry and a confirmed source/destination currency pair.
- Add reporting that keeps provider minor units, local major-unit values and currencies clearly distinguished.
- Keep production changes unmerged and undeployed until release gates are satisfied.
