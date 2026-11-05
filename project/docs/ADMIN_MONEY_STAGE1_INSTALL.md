# MatMove Admin money workflow — stage 1

This patch separates payroll from refunds and hardens the payroll API. It does not enable or execute any live payment by itself.

## Files in this patch

- `api/admin-pay-staff.js` — requires a valid Admin session with the existing `special` permission, returns the configured payroll account ID and live SLE available balance, verifies staff profiles and SLE wallet linkage on the server, and writes an audit row before requesting a Monime internal transfer.
- `src/pages/AdministrativePayrollPage.tsx` — calls the API with a staff profile ID (not a client-supplied destination account ID), displays the account ID and live balance, and separates completed / pending / failed / review-required results.
- `src/pages/SpecialOperationsPage.tsx` — customer refunds only; removes the duplicated Pay Staff mode from the refunds screen.
- `supabase/migrations/20261104000100_admin_money_ledgers.sql` — creates the server-only payroll and refund ledgers and removes the previous unrestricted legacy `admin_refunds` policy if it still exists. It preserves the legacy table and records.
- `test/admin-pay-staff.mock.test.mjs` — isolated mock tests. It does not call a live Monime or Supabase service.

## Apply safely

1. Back up the three existing files before copying these replacements into the project root.
2. In Supabase SQL Editor, inspect the migration file and run it as one transaction. It preserves `public.admin_refunds`; the current refund API uses the separate `public.matmove_admin_refunds` table created here.
3. Keep the existing Vercel variable `MONIME_STAFF_PAYROLE_ACCOUNT_ID` for compatibility, or add the corrected `MONIME_STAFF_PAYROLL_ACCOUNT_ID`. The corrected spelling takes priority. Keep `MONIME_API_KEY`, `MONIME_SPACE_ID`, Supabase URL, and service-role key server-side only.
4. Do not use production money movement during the first validation. Run the mock test, `npm run typecheck`, and `npm run build` first.
5. Deploy only after the migration and application checks succeed. Then verify the GET balance endpoint using the intended Monime environment. A test token and a live token are separate Monime environments.

## Money movement safeguards

- The API uses `requireAdmin` with the `special` assignment already used by the `/payroll` page route.
- The API derives the recipient wallet from `staffUserId` by checking `profiles.role = 'staff'` and requiring exactly one SLE wallet. It does not trust a destination account ID sent by the browser.
- A payroll audit record is inserted before a Monime transfer is submitted. If storage is unavailable, no transfer is submitted.
- Each logical payment requires a caller-supplied UUID request key and uses that same value as Monime's `Idempotency-Key`. The browser keeps pending request keys in session storage with their amount and memo for safe retries in the same tab.
- Provider response amount and source/destination account IDs are checked before the ledger is marked completed.
- Pending, processing, failed, and review-required results are not labelled completed.

## Not included in stage 1

Payroll/refund reports and analytics, Concierge management, Concierge customer-side dynamic rendering, and a webhook reconciliation job are later stages. The ledgers created here give those reports a reliable source, but the reports are not yet wired in this patch. A controlled live transfer still requires a separate approval after the test environment has passed.
