-- Keep registered merchant identity and business representative details
-- server-side. No browser portal uses this table directly.
revoke all privileges on table public.merchant_profiles
  from public, anon, authenticated;
grant all privileges on table public.merchant_profiles
  to service_role;

notify pgrst, 'reload schema';
