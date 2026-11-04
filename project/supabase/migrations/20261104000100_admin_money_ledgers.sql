-- MatMove Admin money ledgers (payroll and customer refunds)
-- Server-side access only. No client/anon/authenticated policy is created.

begin;

-- Preserve and restrict the legacy table if it exists. The active refund API uses
-- matmove_admin_refunds below; admin_refunds is not renamed or dropped.
do $$
begin
  if to_regclass('public.admin_refunds') is not null then
    alter table public.admin_refunds enable row level security;
    drop policy if exists "Allow admins full access to refunds" on public.admin_refunds;
    revoke all privileges on table public.admin_refunds from public, anon, authenticated;
    grant all privileges on table public.admin_refunds to service_role;
  end if;
end $$;

-- Refund API audit table. This matches api/admin-refund.js.
create table if not exists public.matmove_admin_refunds (
  id uuid primary key default gen_random_uuid(),
  request_key uuid not null unique,
  initiated_by uuid not null references auth.users(id) on delete restrict,
  recipient_user_id uuid not null references auth.users(id) on delete restrict,
  recipient_account_id text not null check (recipient_account_id ~ '^fac-[A-Za-z0-9_-]+$'),
  source_account_id text not null check (source_account_id ~ '^fac-[A-Za-z0-9_-]+$'),
  amount_minor bigint not null check (amount_minor > 0 and amount_minor <= 1000000000000),
  currency text not null default 'SLE' check (currency = 'SLE'),
  reason text not null check (length(btrim(reason)) between 1 and 300),
  provider_transfer_id text unique,
  provider_status text not null default 'initiating',
  state text not null default 'initiating'
    check (state in ('initiating', 'pending', 'processing', 'completed', 'failed', 'review_required')),
  failure_detail text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint matmove_admin_refunds_source_destination_check check (source_account_id <> recipient_account_id)
);

alter table public.matmove_admin_refunds enable row level security;
revoke all privileges on table public.matmove_admin_refunds from public, anon, authenticated;
grant all privileges on table public.matmove_admin_refunds to service_role;

create index if not exists matmove_admin_refunds_recipient_created_idx
  on public.matmove_admin_refunds (recipient_user_id, created_at desc);
create index if not exists matmove_admin_refunds_state_created_idx
  on public.matmove_admin_refunds (state, created_at desc);

-- Payroll ledger. One UUID request key represents one logical staff payment.
create table if not exists public.matmove_admin_payroll (
  id uuid primary key default gen_random_uuid(),
  request_key uuid not null unique,
  initiated_by uuid not null references auth.users(id) on delete restrict,
  staff_user_id uuid not null,
  wallet_id uuid not null,
  source_account_id text not null check (source_account_id ~ '^fac-[A-Za-z0-9_-]+$'),
  recipient_account_id text not null check (recipient_account_id ~ '^fac-[A-Za-z0-9_-]+$'),
  amount_minor bigint not null check (amount_minor > 0 and amount_minor <= 1000000000000),
  currency text not null default 'SLE' check (currency = 'SLE'),
  reason text not null check (length(btrim(reason)) between 1 and 140),
  provider_transfer_id text unique,
  provider_status text not null default 'initiating',
  state text not null default 'initiating'
    check (state in ('initiating', 'pending', 'processing', 'completed', 'failed', 'review_required')),
  failure_detail text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint matmove_admin_payroll_source_destination_check check (source_account_id <> recipient_account_id)
);

alter table public.matmove_admin_payroll enable row level security;
revoke all privileges on table public.matmove_admin_payroll from public, anon, authenticated;
grant all privileges on table public.matmove_admin_payroll to service_role;

create index if not exists matmove_admin_payroll_staff_created_idx
  on public.matmove_admin_payroll (staff_user_id, created_at desc);
create index if not exists matmove_admin_payroll_state_created_idx
  on public.matmove_admin_payroll (state, created_at desc);

commit;

-- Verification: table names, row security and service-role-only policy posture.
select c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_class c
where c.oid in (
  to_regclass('public.matmove_admin_refunds'),
  to_regclass('public.matmove_admin_payroll')
)
order by c.relname;

select grantee, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('matmove_admin_refunds', 'matmove_admin_payroll')
order by table_name, grantee, privilege_type;
