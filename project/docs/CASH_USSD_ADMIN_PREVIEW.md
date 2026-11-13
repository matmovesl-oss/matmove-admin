# Cash and Guest USSD — Admin Preview

The Financials page contains a seeded demo component for two separate money paths:

- Cash rides: gross fare, physical cash owed by rider to driver, MatMove's digitally secured 15% fee, fee reserve/capture/refund status, cash handover confirmation and exception note.
- Guest USSD collections: booking/order reference, masked guest phone, Orange Money/Afrimoney channel, provider confirmation status and amount.

The summary cards deliberately do not combine physical cash with the Monime financial-account balance. Cash paid to a driver is not a digital wallet credit. USSD receipt completion is not the same as merchant/driver settlement.

No rows are loaded from production. No button calls an API or changes a database; all buttons operate on local React state. The preview is permission-gated by the existing Financials route, but is not a replacement for production permission-scoped SQL/API endpoints.

Production Admin requirements:
1. Add a dedicated financials-permission RPC that returns only the logged-in Admin's permitted cash/USSD summary, never raw provider/webhook payloads.
2. Add immutable audit logs for manual reconciliation actions. Require reason, staff identity and before/after state.
3. Never allow a manual mark-paid action without a verified provider receipt/current Payment object or an audited cash dispute resolution.
4. Show the Monime transfer/payment references, exact SLE minor units, booking/order reference, provider status and reconciliation outcome.
5. Export separate columns for cash collected physically, fee held digitally, fee captured, refund pending/completed, guest pay-in pending/completed, and exception state.
