import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeAndroidApkPayload, ANDROID_APK_MIME } from '../src/lib/androidApkUpload.js';

test('Android app release page is owner-gated and uploads the fixed public APK object', async () => {
  const source = await readFile(new URL('../src/pages/AppReleasePage.tsx', import.meta.url), 'utf8');
  assert.match(source, /access\?\.is_active === true && access\?\.is_owner === true/);
  assert.match(source, /matmove-app-releases/);
  assert.match(source, /android\/MatMove\.apk/);
  assert.match(source, /upsert: true/);
  assert.match(source, /setSelectedFile\(file\)/);
  assert.match(source, /upload\(selectedFile\)/);
  assert.match(source, /normalizeAndroidApkPayload\(file\)/);
  assert.match(source, /upload\(OBJECT_PATH, apkPayload/);
  assert.match(source, /contentType: APK_MIME/);
  assert.match(source, /application\/vnd\.android\.package-archive/);
  assert.match(source, /MAX_SIZE = 50 \* 1024 \* 1024/);
  assert.match(source, /file\.name\.toLowerCase\(\)\.endsWith\('\.apk'\)/);
  assert.match(source, /header\[0\] !== 0x50/);
  assert.match(source, /matmove-app-releases/);
  assert.match(source, /searchParams\.set\('download', 'MatMove\.apk'\)/);
  assert.match(source, /Only the active MatMove owner account can upload or replace/);
  assert.match(source, /same Android signing key/);
});

test('Android release storage migration grants public read and owner-only writes', async () => {
  const sql = await readFile(new URL('../supabase/migrations/20261126171003_matmove_android_app_releases_storage_v1.sql', import.meta.url), 'utf8');
  assert.match(sql, /public = true/);
  assert.match(sql, /matmove_app_releases_public_read/);
  assert.match(sql, /to public/);
  assert.match(sql, /matmove_staff_access/);
  assert.match(sql, /a\.is_owner = true/);
  assert.match(sql, /matmove_app_releases_owner_insert/);
  assert.match(sql, /matmove_app_releases_owner_update/);
  assert.match(sql, /matmove_app_releases_owner_delete/);
  const ownerPolicy = await readFile(new URL('../supabase/migrations/20261126171345_matmove_android_app_release_owner_rls_v1.sql', import.meta.url), 'utf8');
  assert.ok(ownerPolicy.includes('create or replace function public.matmove_is_active_owner()'));
  assert.match(ownerPolicy, /security definer/);
  assert.ok(ownerPolicy.includes('grant execute on function public.matmove_is_active_owner() to authenticated'));
  assert.ok(ownerPolicy.includes('select public.matmove_is_active_owner()'));
  const privateOwnerPolicy = await readFile(new URL('../supabase/migrations/20261126171920_matmove_android_app_release_private_owner_rls_v1.sql', import.meta.url), 'utf8');
  assert.ok(privateOwnerPolicy.includes('create or replace function private.matmove_is_active_owner()'));
  assert.ok(privateOwnerPolicy.includes('select private.matmove_is_active_owner()'));
  assert.ok(privateOwnerPolicy.includes('drop function if exists public.matmove_is_active_owner()'));

  const mimeMigration = await readFile(new URL('../supabase/migrations/20261127222009_allow_octet_stream_mime_for_android_apk.sql', import.meta.url), 'utf8');
  assert.match(mimeMigration, /matmove-app-releases/);
  assert.ok(mimeMigration.includes('application/vnd.android.package-archive'));
  assert.ok(mimeMigration.includes('application/octet-stream'));
});


test('Android APK uploads normalize browser application/octet-stream files to the package MIME type', async () => {
  const browserFile = new Blob([Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0x01, 0x02])], {
    type: 'application/octet-stream',
  });
  const payload = normalizeAndroidApkPayload(browserFile);
  assert.equal(browserFile.type, 'application/octet-stream');
  assert.equal(payload.type, ANDROID_APK_MIME);
  assert.equal(payload.type, 'application/vnd.android.package-archive');
  assert.deepEqual(new Uint8Array(await payload.arrayBuffer()), new Uint8Array(await browserFile.arrayBuffer()));
});
