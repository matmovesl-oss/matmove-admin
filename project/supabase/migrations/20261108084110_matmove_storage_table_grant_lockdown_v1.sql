-- MatMove security lockdown phase 8: reduce Storage table-level grants.

revoke insert, update, delete on table storage.objects from public, anon;
grant select on table storage.objects to anon, authenticated;
grant insert, update, delete on table storage.objects to authenticated;
grant all on table storage.objects to service_role;

revoke insert, update, delete on table storage.buckets from public, anon, authenticated;
grant select on table storage.buckets to anon, authenticated;
grant all on table storage.buckets to service_role;

notify pgrst, 'reload schema';
