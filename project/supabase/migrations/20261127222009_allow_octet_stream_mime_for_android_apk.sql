-- The Android release picker can receive APK files with the generic
-- application/octet-stream browser MIME type. Keep the official APK MIME
-- type as the preferred upload type while accepting generic browser uploads.
-- Storage object writes remain restricted to the active MatMove owner.
update storage.buckets
set allowed_mime_types = array[
  'application/vnd.android.package-archive',
  'application/octet-stream'
]::text[]
where id = 'matmove-app-releases';
