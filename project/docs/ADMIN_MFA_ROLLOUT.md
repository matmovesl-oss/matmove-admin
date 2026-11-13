# MatMove Admin authentication model

## Decision

Mandatory authenticator-app (TOTP) enrollment is removed from the normal Admin sign-in flow.

Staff sign in with their own Supabase email address and password. The application does not display a TOTP QR code, setup key, challenge, or six-digit authenticator prompt.

Existing Authenticator factors are not deleted by this application change. Any unfinished factor remains dormant and is not required for Admin access. Do not manually edit `auth.mfa_factors` or delete a verified factor as part of this rollout.

## Required access controls

Removing the TOTP prompt does not make the Admin workspace public. The following checks remain mandatory:

- Supabase validates the user's signed-in bearer token on every protected server API request using `auth.getUser(token)`.
- The user must have an active row in `matmove_staff_access`.
- The requested operation must be included in the staff member's assigned permissions; owner-only actions remain owner-only.
- Removed, inactive, missing, and unassigned staff are denied.
- Database Row Level Security and existing permission-checking RPCs remain enabled.
- Financial actions retain their existing provider-side verification, idempotency, audit logging, and approval rules.
- Password reset is a separate recovery route. It does not create staff membership, restore removed access, or grant permissions.

## Production rollout

1. Run the Admin regression tests, TypeScript check, and production build on the exact reviewed commit.
2. Deploy the Admin app and updated protected API authorization code together.
3. Confirm an active staff account can sign in using email/password and reach only assigned sections.
4. Confirm an invalid/expired token, removed staff member, inactive staff member, and unassigned section are denied.
5. Confirm owner-only actions remain restricted to the owner.
6. Do not apply `20261112135000_matmove_admin_aal2_staff_lockdown.sql` in Production. That migration enforces AAL2 and conflicts with the approved password-only Admin sign-in model.

## Important

Password-only access is a deliberate reduction in authentication assurance compared with mandatory MFA. Protect staff passwords, use unique accounts, keep staff permissions least-privilege, and remove staff access promptly when employment or duties change. Consider adding a separate verified email one-time-code step later if the business wants an additional login factor without authenticator apps.
