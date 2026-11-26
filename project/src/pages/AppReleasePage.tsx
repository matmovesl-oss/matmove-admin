import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Copy, Download, FileUp, RefreshCw, ShieldCheck, Smartphone, UploadCloud } from 'lucide-react';
import AdminLayout from '@/components/AdminLayout';
import { useAdminAccess } from '@/lib/adminAccess';
import { supabase } from '@/lib/supabase';

const BUCKET = 'matmove-app-releases';
const OBJECT_PATH = 'android/MatMove.apk';
const MAX_SIZE = 50 * 1024 * 1024;
const APK_MIME = 'application/vnd.android.package-archive';

type StoredRelease = {
  name: string;
  updated_at?: string | null;
  created_at?: string | null;
  metadata?: { size?: number; mimetype?: string } | null;
};

function directDownloadUrl(version: string) {
  const base = supabase.storage.from(BUCKET).getPublicUrl(OBJECT_PATH).data.publicUrl;
  const url = new URL(base);
  url.searchParams.set('download', 'MatMove.apk');
  url.searchParams.set('v', version || '1');
  return url.toString();
}

function readableSize(value?: number) {
  if (!value || !Number.isFinite(value)) return 'Size unavailable';
  return value >= 1024 * 1024
    ? `${(value / (1024 * 1024)).toFixed(1)} MB`
    : `${(value / 1024).toFixed(0)} KB`;
}

export default function AppReleasePage() {
  const access = useAdminAccess();
  const owner = access?.is_active === true && access?.is_owner === true;
  const [current, setCurrent] = useState<StoredRelease | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [copied, setCopied] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const refresh = useCallback(async () => {
    if (!owner) { setLoading(false); return; }
    setLoading(true);
    setError('');
    try {
      const { data, error: listError } = await supabase.storage
        .from(BUCKET)
        .list('android', { limit: 20, search: 'MatMove.apk' });
      if (listError) throw listError;
      const file = (data || []).find((item) => item.name === 'MatMove.apk') as StoredRelease | undefined;
      setCurrent(file || null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not check the current Android release.');
    } finally {
      setLoading(false);
    }
  }, [owner]);

  useEffect(() => { void refresh(); }, [refresh]);

  const updatedAt = current?.updated_at || current?.created_at || '';
  const downloadUrl = current ? directDownloadUrl(updatedAt) : '';

  async function upload(file?: File) {
    if (!file || busy || !owner) return;
    setError('');
    setNotice('');
    if (!file.name.toLowerCase().endsWith('.apk')) {
      setError('Choose the Android .apk release file.');
      return;
    }
    if (file.size <= 0 || file.size > MAX_SIZE) {
      setError('The APK must be larger than 0 bytes and no bigger than 50 MB.');
      return;
    }
    try {
      const header = new Uint8Array(await file.slice(0, 4).arrayBuffer());
      if (header.length !== 4 || header[0] !== 0x50 || header[1] !== 0x4b || header[2] !== 0x03 || header[3] !== 0x04) {
        setError('This file does not look like a valid Android APK archive.');
        return;
      }
    } catch {
      setError('The selected APK could not be read. Choose the file again.');
      return;
    }

    setBusy(true);
    try {
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(OBJECT_PATH, file, {
          cacheControl: '60',
          contentType: APK_MIME,
          upsert: true,
        });
      if (uploadError) throw uploadError;
      setSelectedFile(null);
      setNotice('The MatMove Android release has been replaced. The public install address stays the same.');
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The APK could not be uploaded.');
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    if (!downloadUrl) return;
    try {
      await navigator.clipboard.writeText(downloadUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError('Clipboard access is blocked in this browser. Copy the download address from the link below.');
    }
  }

  if (!owner) {
    return (
      <AdminLayout title="Android App Releases" subtitle="Manage the official MatMove Android installation file">
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          <ShieldCheck className="mb-2" size={22} />
          Only the active MatMove owner account can upload or replace the public Android release.
        </section>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="Android App Releases" subtitle="Publish the official MatMove APK at one permanent install address">
      <div className="mx-auto max-w-4xl space-y-5">
        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-[#092c27] via-[#0d5347] to-[#1554a0] p-5 text-white shadow-lg sm:p-7">
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/15 bg-white/10"><Smartphone size={25}/></span>
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[.18em] text-emerald-200">Official Android installer</p>
              <h2 className="mt-1 text-xl font-black sm:text-2xl">MatMove APK release</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-white/80">Upload each approved Median APK here. MatMove’s landing page will always point to the same direct download address, with a fresh version query after each replacement.</p>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold">Owner controlled</span>
            <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold">Direct APK download</span>
            <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold">50 MB maximum</span>
          </div>
        </section>

        {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
        {notice && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-900">{notice}</div>}

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><p className="text-xs font-black uppercase tracking-[.14em] text-slate-500">Current public release</p><h3 className="mt-1 text-lg font-black text-slate-950">MatMove.apk</h3></div>
            <button type="button" onClick={() => void refresh()} disabled={loading || busy} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-bold text-slate-700 disabled:opacity-50"><RefreshCw size={15} className={loading ? 'animate-spin' : ''}/> Refresh</button>
          </div>
          {loading ? <p className="mt-4 text-sm text-slate-500">Checking release storage…</p> : current ? (
            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/70 p-4">
              <div className="flex flex-wrap items-center gap-2 text-sm font-bold text-emerald-900"><CheckCircle2 size={17}/> A direct APK is published</div>
              <p className="mt-2 text-sm text-slate-700">{readableSize(current.metadata?.size)}{updatedAt ? ` · Updated ${new Date(updatedAt).toLocaleString()}` : ''}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <a href={downloadUrl} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#1554a0] px-4 text-sm font-bold text-white"><Download size={16}/> Download current APK</a>
                <button type="button" onClick={() => void copyLink()} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700"><Copy size={15}/> {copied ? 'Copied' : 'Copy install link'}</button>
              </div>
              <p className="mt-3 break-all text-[11px] text-slate-500">{downloadUrl}</p>
            </div>
          ) : (
            <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600">No Android APK has been published yet. Upload the first approved release below.</div>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-50 text-sky-800"><UploadCloud size={20}/></span><div><h3 className="font-black text-slate-950">{current ? 'Replace Android release' : 'Upload first Android release'}</h3><p className="mt-0.5 text-xs text-slate-500">Select the .apk file downloaded from your Median project.</p></div></div>
          <label className={`mt-5 flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-4 py-5 text-center transition ${busy ? 'cursor-wait border-slate-200 bg-slate-50' : 'border-sky-200 bg-sky-50/60 hover:border-sky-400 hover:bg-sky-50'}`}>
            <FileUp size={25} className="text-sky-800"/>
            <span className="mt-2 text-sm font-extrabold text-slate-900">{busy ? 'Uploading release…' : 'Choose APK file'}</span>
            <span className="mt-1 text-xs text-slate-500">APK only · Up to 50 MB · Existing address is preserved</span>
            <input className="sr-only" type="file" accept=".apk,application/vnd.android.package-archive" disabled={busy} onChange={(event) => { const file = event.currentTarget.files?.[0] || null; event.currentTarget.value = ''; setSelectedFile(file); setError(''); setNotice(''); }}/>
          </label>
          {selectedFile && <div className="mt-4 flex flex-col gap-3 rounded-xl border border-sky-200 bg-sky-50 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0"><p className="truncate text-sm font-bold text-slate-900">{selectedFile.name}</p><p className="mt-1 text-xs text-slate-500">{readableSize(selectedFile.size)} · Ready for validation</p></div>
            <button type="button" disabled={busy} onClick={() => void upload(selectedFile)} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#1554a0] px-4 text-sm font-extrabold text-white disabled:opacity-50"><UploadCloud size={16}/>{current ? 'Upload and replace' : 'Publish APK'}</button>
          </div>}
          {busy && <p role="status" className="mt-3 text-sm font-semibold text-sky-800">Uploading the new APK and replacing the current public file…</p>}
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-950">
            <strong>Important for Android updates:</strong> each new APK must use the same Android signing key as the installed app and have a higher version code. After creating a new release in Median, download that APK and upload it here. Updating Median alone does not replace this hosted file or automatically update phones that already have MatMove installed.
          </div>
        </section>

        <section className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs leading-5 text-slate-600">
          <ShieldCheck size={18} className="mt-0.5 shrink-0 text-emerald-700"/>
          <p>The APK is downloadable by the public. Upload, replacement and deletion are protected by Supabase Storage policies and limited to the active owner account. Never upload a test or unsigned build to the public release slot.</p>
        </section>
      </div>
    </AdminLayout>
  );
}
