-- MatMove security lockdown phase 7: enforce an allow-list for Storage writes.

drop policy if exists matmove_profile_photo_no_anonymous on storage.objects;
drop policy if exists matmove_profile_photo_no_delete on storage.objects;
drop policy if exists matmove_profile_photo_no_overwrite on storage.objects;
drop policy if exists matmove_product_image_no_overwrite on storage.objects;
drop policy if exists matmove_profile_photo_insert_scope on storage.objects;

drop policy if exists matmove_authenticated_upload_allowlist on storage.objects;
create policy matmove_authenticated_upload_allowlist
  on storage.objects as restrictive
  for insert to authenticated
  with check (
    (
      bucket_id = 'matmove-profile-photos'
      and (storage.foldername(name))[1] = auth.uid()::text
    )
    or (
      bucket_id = 'kyc-documents'
      and (storage.foldername(name))[1] = auth.uid()::text
    )
    or (
      bucket_id = 'product_images'
      and public.matmove_catalog_is_merchant()
      and (
        name like auth.uid()::text || '/%'
        or name like auth.uid()::text || '-%'
      )
    )
    or (
      bucket_id = 'event-flyers'
      and public.matmove_admin_can('events.overview')
    )
  );

drop policy if exists matmove_private_personal_storage_read_scope on storage.objects;
create policy matmove_private_personal_storage_read_scope
  on storage.objects as restrictive
  for select to anon, authenticated
  using (
    bucket_id not in ('kyc-documents','matmove-profile-photos')
    or (
      auth.uid() is not null
      and (storage.foldername(name))[1] = auth.uid()::text
    )
  );

drop policy if exists matmove_authenticated_storage_update_allowlist on storage.objects;
create policy matmove_authenticated_storage_update_allowlist
  on storage.objects as restrictive
  for update to authenticated
  using (bucket_id = 'event-flyers' and public.matmove_admin_can('events.overview'))
  with check (bucket_id = 'event-flyers' and public.matmove_admin_can('events.overview'));

drop policy if exists matmove_authenticated_storage_delete_allowlist on storage.objects;
create policy matmove_authenticated_storage_delete_allowlist
  on storage.objects as restrictive
  for delete to authenticated
  using (bucket_id = 'event-flyers' and public.matmove_admin_can('events.overview'));

notify pgrst, 'reload schema';
