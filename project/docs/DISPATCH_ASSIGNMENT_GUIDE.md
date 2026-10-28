
# Manual driver assignment

This update changes the Admin Dispatch directory and assignment checks. It does not approve a Driver, accept a trip, charge a wallet or change the fare. The same shared Supabase project serves both portals.

## Installation

1. Save the replacement ADMIN_DISPATCH_SETUP.sql, DispatchRadarPage.tsx and admin-dispatch.test.js in their listed Admin project paths. Save the two new documentation files too.
2. Run the supplied Admin typecheck, build and sequential tests in PowerShell.
3. Paste the entire updated docs/ADMIN_DISPATCH_SETUP.sql into the shared Supabase SQL Editor and run it once. This additive migration keeps bookings, fare agreements, audit records and payments. Reruns preserve assignments.
4. Run the entire docs/DISPATCH_READINESS.sql separately. Its first result should contain four true values. Its second result explains current Driver eligibility.
5. After the coordinated Admin deployment, refresh Dispatch. Local file changes alone do not change the production website.

## What the Admin sees

Dispatch lists Driver accounts with their current eligibility rather than silently hiding every unavailable candidate. Ready drivers can be selected. Unavailable drivers remain visible with a reason. The Driver availability and eligibility section shows the same explanation.

Manual assignment works regardless of whether the Driver screen is online or offline. The existing Customer online switch is a screen preference; it is not a shared server presence record. This update does not pretend to provide live online monitoring. An offline Driver can see an assigned request after returning to the Driver Ride screen and switching online. Continuous background delivery, push notifications and live presence are separate features.

Older saved Driver profiles with no role rows use their existing profile role, matching current Customer account resolution. This does not create role rows or grant privileges. Contradictory membership, administrative membership and active staff access remain blocked.

## Reasons a Driver is unavailable

- Approval required: complete the existing KYC review. Assignment cannot approve the Driver.
- Frozen wallet: use the authorized financial review process; do not bypass a freeze to assign a trip.
- Missing SLE wallet: resolve that Driver's existing wallet setup. Never attach another person's or a business treasury wallet.
- Active assignment or unresolved payment: inspect the existing trip and its receipt. An old pending trip can occupy a Driver even while the screen is online. Unassign only an unfunded pending request through Dispatch when appropriate; funded trips require their existing cancellation/refund process.
- Role conflict: review the saved customer membership through the authorized account process. Do not delete roles merely to make an account selectable.
- Customer agreed with another Driver: retain the agreed Driver or use the existing customer cancellation process.

## Safe assignment sequence

Select an unfunded pending request, select a ready Driver, enter a Dispatch note, choose Review assignment, and confirm. The booking remains pending at its current fare. Only the assigned Driver can accept through the existing verified escrow flow.

An assignment locks that Driver against another active assignment. The database rechecks eligibility at confirmation, so stale pages cannot override a newly frozen wallet or another assignment. Completed or payment-started trips cannot be reassigned here. An uncertain response retains the same request key for an explicit retry while the page remains open.

## Production verification

After deployment, use an approved test Driver with an unfrozen SLE wallet and no active assignment. Test assignment with its screen offline, then open the Driver Ride screen and switch online. Verify that the assigned request appears, the fare is unchanged, and assignment itself creates no payment. Repeat with another unfunded test request while online. Do not use an existing live funded trip for this test.

The local automated tests do not establish the eligibility of a specific production account or prove real provider settlement. If a test Driver is unavailable, the read-only diagnostic result supplies its actual reason without guessing from the online switch.
