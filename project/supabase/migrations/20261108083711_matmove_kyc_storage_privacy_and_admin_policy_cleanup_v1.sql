-- MatMove security lockdown phase 6: remove legacy admin table dependencies
-- and close broad Storage object policies.

drop policy if exists "Admins can view all profiles" on public.profiles;
drop policy if exists "Admins can view all kyc" on public.kyc_submissions;

update storage.buckets set public = false where id = 'kyc-documents';

drop policy if exists "Public Access KYC" on storage.objects;
drop policy if exists "Users upload KYC Documents" on storage.objects;
drop policy if exists "Allow authenticated uploads" on storage.objects;

drop policy if exists "Auth Upload" on storage.objects;
drop policy if exists "Merchant Image Upload" on storage.objects;
drop policy if exists matmove_product_image_owner_guard on storage.objects;
drop policy if exists matmove_catalog_upload_scope on storage.objects;
drop policy if exists matmove_catalog_no_delete on storage.objects;
drop policy if exists matmove_catalog_no_overwrite on storage.objects;

drop policy if exists matmove_kyc_private_insert_scope on storage.objects;
create policy matmove_kyc_private_insert_scope
  on storage.objects as restrictive for insert to authenticated
  with check (
    bucket_id <> 'kyc-documents'
    or (
      auth.uid() is not null
      and (storage.foldername(name))[1] = auth.uid()::text
    )
  );

drop policy if exists matmove_kyc_private_select_scope on storage.objects;
create policy matmove_kyc_private_select_scope
  on storage.objects as restrictive for select to anon, authenticated
  using (
    bucket_id <> 'kyc-documents'
    or (
      auth.uid() is not null
      and (storage.foldername(name))[1] = auth.uid()::text
    )
  );

drop policy if exists matmove_product_image_merchant_insert_scope on storage.objects;
create policy matmove_product_image_merchant_insert_scope
  on storage.objects as restrictive for insert to authenticated
  with check (
    bucket_id <> 'product_images'
    or (
      public.matmove_catalog_is_merchant()
      and (
        name like auth.uid()::text || '/%'
        or name like auth.uid()::text || '-%'
      )
    )
  );

drop policy if exists matmove_legacy_product_images_read_only on storage.objects;
create policy matmove_legacy_product_images_read_only
  on storage.objects as restrictive for insert to authenticated
  with check (bucket_id <> 'product-images');

notify pgrst, 'reload schema';
