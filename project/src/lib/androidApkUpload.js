export const ANDROID_APK_MIME = 'application/vnd.android.package-archive';

/**
 * Normalize the upload body because some desktop browsers report APK files
 * as application/octet-stream even when the file extension is .apk.
 */
export function normalizeAndroidApkPayload(file) {
  if (!(file instanceof Blob)) {
    throw new TypeError('An APK file or Blob is required.');
  }
  return new Blob([file], { type: ANDROID_APK_MIME });
}
