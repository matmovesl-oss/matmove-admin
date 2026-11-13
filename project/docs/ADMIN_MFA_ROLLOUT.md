# MatMove Admin MFA rollout

## Current state

- The Admin Preview contains TOTP enrollment and challenge screens.
- Protected Admin server endpoints require a valid Supabase user session with AAL2.
- The matching database migration is `supabase/migrations/20261112135000_matmove_admin_aal2_staff_lockdown.sql`.
- That database migration is **not installed in Production**. It was syntax-checked and behavior-tested inside a transaction that was rolled back.
- Production currently has four active staff accounts and zero verified TOTP factors (last verified 2026-11-12).

## Staff enrollment

1. Give each of the four currently active staff members the temporary Admin Preview share link through the owner's approved staff communication channel.
2. Each person signs in with their own existing MatMove staff email and password. Do not create shared accounts.
3. A staff member without a verified TOTP factor selects **Set up authenticator**, scans the QR code with an authenticator application, and enters the six-digit one-time code.
4. Each staff member must complete the enrollment and reach the Admin workspace. The owner must not collect or request anyone's QR setup key, password, or one-time code.
5. If an account has an unfinished/unverified factor and is blocked, the owner must resolve it through the verified staff recovery procedure. Do not bypass MFA or delete a verified factor merely to get access.

The Preview uses the same Supabase Auth project as MatMove, so verified factors are retained on the existing staff Auth accounts. Preview access is only a path to the sign-in screen; Supabase staff authorization and MFA are still required.

## Production cutover gate

Do not apply the database migration until all of these checks pass:

- All four active staff accounts have at least one `auth.mfa_factors` row with `status = 'verified'`.
- The Admin PR is approved, non-draft, and its exact head commit has passing regression tests, TypeScript, production build, and Vercel Preview checks.
- A short Admin maintenance window is arranged. The migration changes the database permission helper used by RLS and many direct RPC paths. Applying it before the MFA-capable Admin UI is served will temporarily deny ordinary AAL1 Admin activity.
- The Admin Production deployment and rollback target are identified and ready.

## Safe cutover order

1. Recheck the active staff and verified-factor counts immediately before cutover.
2. Apply the AAL2 database migration to the MatMove Production Supabase project.
3. Immediately release the approved Admin commit containing the MFA gate. Until the new Admin UI is live, AAL1 staff requests are intentionally denied by the database.
4. Have each staff member sign in again and complete an authenticator challenge. Confirm the resulting session is AAL2.
5. Verify ordinary staff can access only their assigned sections, owner-only actions remain owner-only, and unassigned staff remain denied.
6. Verify Admin audit, dispatch, financial and notification operations, then monitor errors and webhook queue health.

Do not merge or promote just to get the MFA screen live before the database rollout has been scheduled. Conversely, do not apply the database migration without the four verified factors and the release window.

## Read-only readiness query

Run immediately before cutover:

```sql
select
  count(*) filter (
    where s.is_active and s.removed_at is null
  ) as active_staff,
  count(distinct s.id) filter (
    where s.is_active and s.removed_at is null and f.status = 'verified'
  ) as staff_with_verified_totp,
  count(*) filter (
    where s.is_active and s.removed_at is null
      and (f.id is null or f.status <> 'verified')
  ) as staff_without_verified_totp
from public.matmove_staff_access s
left join auth.mfa_factors f on f.user_id = s.id;
```

Expected before cutover: `active_staff = 4`, `staff_with_verified_totp = 4`, `staff_without_verified_totp = 0`. Reconcile any legitimate staff-count change before proceeding.

## Recovery and rollback

- Password recovery does not remove or bypass an authenticator factor.
- Factor resets must follow the verified owner/staff identity recovery process and be audited.
- If the MFA-capable Admin deployment fails after the database migration, roll forward the reviewed Admin build or restore the previous DB function definitions only under the incident runbook. Do not silently disable MFA or grant broad RPC access as a workaround.
