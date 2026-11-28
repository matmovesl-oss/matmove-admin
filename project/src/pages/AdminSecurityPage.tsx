import { useCallback, useEffect, useState } from 'react';
import { Fingerprint, KeyRound, Laptop, RefreshCw, ShieldCheck, ShieldOff } from 'lucide-react';
import AdminLayout from '@/components/AdminLayout';
import { supabase } from '@/lib/supabase';

type SessionRow = {
  sessionId: string;
  deviceLabel: string;
  userAgent?: string | null;
  startedAt: string;
  lastActivityAt: string;
  isCurrent: boolean;
};
type PasskeyRow = {
  id: string;
  friendly_name?: string | null;
  created_at?: string | null;
  last_used_at?: string | null;
};
function dateLabel(value?: string | null) {
  if (!value) return 'Not available';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not available' : date.toLocaleString();
}

export default function AdminSecurityPage() {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [passkeys, setPasskeys] = useState<PasskeyRow[]>([]);
  const [totpReady, setTotpReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [passkeyUnavailable, setPasskeyUnavailable] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    const [sessionResult, passkeyResult, factorResult] = await Promise.all([
      supabase.rpc('matmove_admin_list_sessions', { p_user_id: null }),
      supabase.auth.passkey.list(),
      supabase.auth.mfa.listFactors(),
    ]);
    if (sessionResult.error) {
      setError(sessionResult.error.message || 'Your device sessions could not be loaded.');
    } else {
      setSessions(Array.isArray(sessionResult.data?.sessions) ? sessionResult.data.sessions : []);
    }
    if (passkeyResult.error) {
      setPasskeyUnavailable(/passkey_disabled/i.test(passkeyResult.error.message || ''));
      setPasskeys([]);
    } else {
      setPasskeyUnavailable(false);
      setPasskeys(Array.isArray(passkeyResult.data) ? passkeyResult.data : []);
    }
    if (!factorResult.error) {
      setTotpReady((factorResult.data?.totp || []).some((factor: any) => factor.status === 'verified'));
    }
    setLoading(false);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  async function addPasskey() {
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await supabase.auth.registerPasskey();
      if (result.error) throw result.error;
      setNotice('This device passkey has been registered. Use its fingerprint, Face ID, device PIN or security key when signing in.');
      await refresh();
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Passkey registration could not be completed.';
      setPasskeyUnavailable(/passkey_disabled/i.test(message));
      setError(/passkey_disabled/i.test(message)
        ? 'Passkeys are not enabled in the MatMove Supabase Auth settings yet. Password and authenticator sign-in remain available.'
        : message);
    } finally { setBusy(false); }
  }

  async function removePasskey(id: string) {
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await supabase.auth.passkey.delete({ passkeyId: id });
      if (result.error) throw result.error;
      setNotice('The selected device passkey has been removed.');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'This passkey could not be removed.');
    } finally { setBusy(false); }
  }

  async function revokeAllDevices() {
    setBusy(true); setError('');
    try {
      const result = await supabase.rpc('matmove_admin_revoke_sessions', { p_user_id: null });
      if (result.error) throw result.error;
      // The current device is included; all other Admin sessions are rejected by database and server checks.
      await supabase.auth.signOut({ scope: 'local' });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Active Admin sessions could not be revoked.');
      setBusy(false);
    }
  }

  return (
    <AdminLayout title="Security & Devices" subtitle="Manage your Admin authenticator, passkeys and signed-in devices">
      {error && <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</p>}
      {notice && <p role="status" className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{notice}</p>}

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-2xl border bg-white p-5">
          <div className="flex items-center gap-3">
            <span className="rounded-xl bg-emerald-50 p-3 text-emerald-700"><ShieldCheck size={22}/></span>
            <div><h2 className="font-bold">Two-step authentication</h2><p className="text-xs text-slate-500">Password or passkey, followed by TOTP verification</p></div>
          </div>
          <p className="mt-4 text-sm text-slate-700">{totpReady ? 'Your authenticator app is verified and required for Admin access.' : 'An authenticator app must be enrolled before the Admin workspace can open.'}</p>
        </section>

        <section className="rounded-2xl border bg-white p-5">
          <div className="flex items-center gap-3">
            <span className="rounded-xl bg-indigo-50 p-3 text-indigo-700"><Fingerprint size={22}/></span>
            <div><h2 className="font-bold">Biometric passkeys</h2><p className="text-xs text-slate-500">Face ID, fingerprint, device PIN or a security key</p></div>
          </div>
          <p className="mt-4 text-sm text-slate-700">{passkeyUnavailable ? 'Passkeys need to be enabled in Supabase Auth before enrollment.' : passkeys.length + ' device passkey' + (passkeys.length === 1 ? '' : 's') + ' registered.'}</p>
          <button type="button" disabled={busy} onClick={() => void addPasskey()} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-indigo-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"><KeyRound size={16}/>{busy ? 'Working…' : 'Register this device'}</button>
        </section>
      </div>

      <section className="mt-5 rounded-2xl border bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="font-bold">Registered passkeys</h2><p className="mt-1 text-xs text-slate-500">Remove a passkey if a device is lost or no longer trusted.</p></div>
          <button type="button" disabled={loading || busy} onClick={() => void refresh()} className="inline-flex min-h-10 items-center gap-2 rounded-xl border px-3 text-sm font-semibold"><RefreshCw size={15}/>Refresh</button>
        </div>
        <div className="mt-3 divide-y">
          {passkeys.map(passkey => (
            <div key={passkey.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="flex items-center gap-3"><Fingerprint size={18} className="text-indigo-700"/><div><p className="text-sm font-semibold">{passkey.friendly_name || 'Device passkey'}</p><p className="text-xs text-slate-500">Added {dateLabel(passkey.created_at)} · Last used {dateLabel(passkey.last_used_at)}</p></div></div>
              <button type="button" disabled={busy} onClick={() => void removePasskey(passkey.id)} className="min-h-10 rounded-lg border border-red-200 px-3 text-xs font-bold text-red-700 disabled:opacity-50">Remove passkey</button>
            </div>
          ))}
          {!loading && !passkeys.length && <p className="py-3 text-sm text-slate-500">No passkeys registered on this account.</p>}
        </div>
        <p className="mt-3 rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600">Keep your TOTP authenticator as the required second step. For recovery, register a backup authenticator on a separate trusted device as well as a passkey. MatMove does not collect or store your fingerprint or face data.</p>
      </section>

      <section className="mt-5 rounded-2xl border bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="font-bold">Active Admin devices</h2><p className="mt-1 text-xs text-slate-500">Each session expires after 15 minutes of inactivity or 24 hours maximum.</p></div>
          <button type="button" disabled={loading || busy} onClick={() => void refresh()} className="inline-flex min-h-10 items-center gap-2 rounded-xl border px-3 text-sm font-semibold"><RefreshCw size={15}/>Refresh devices</button>
        </div>
        <div className="mt-3 divide-y">
          {sessions.map(session => (
            <div key={session.sessionId} className="flex flex-wrap items-start justify-between gap-3 py-3">
              <div className="flex items-start gap-3"><Laptop size={19} className="mt-0.5 text-slate-500"/><div><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold">{session.deviceLabel || 'Unknown device'}</p>{session.isCurrent && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">This device</span>}</div><p className="mt-1 text-xs text-slate-500">Started {dateLabel(session.startedAt)}</p><p className="text-xs text-slate-500">Last activity {dateLabel(session.lastActivityAt)}</p>{session.userAgent && <p className="mt-1 max-w-2xl break-all text-[10px] text-slate-400">{session.userAgent}</p>}</div></div>
            </div>
          ))}
          {!loading && !sessions.length && <p className="py-3 text-sm text-slate-500">No active Admin sessions were found. Refresh after signing in again if this is unexpected.</p>}
        </div>
        <div className="mt-4 border-t pt-4">
          {!confirmRevoke ? (
            <button type="button" disabled={busy || loading || !sessions.length} onClick={() => setConfirmRevoke(true)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-red-200 px-4 py-2 text-sm font-bold text-red-700 disabled:opacity-50"><ShieldOff size={16}/>Sign out all devices</button>
          ) : (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4">
              <p className="text-sm font-bold text-red-900">Sign out every MatMove Admin device?</p>
              <p className="mt-1 text-xs leading-5 text-red-800">All Admin sessions for this account, including this one, will be revoked. You will need to sign in again with your password or passkey and authenticator.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" disabled={busy} onClick={() => void revokeAllDevices()} className="min-h-10 rounded-lg bg-red-700 px-4 text-sm font-bold text-white">{busy ? 'Revoking sessions…' : 'Confirm sign out all devices'}</button>
                <button type="button" disabled={busy} onClick={() => setConfirmRevoke(false)} className="min-h-10 rounded-lg border bg-white px-4 text-sm font-semibold">Cancel</button>
              </div>
            </div>
          )}
        </div>
      </section>
    </AdminLayout>
  );
}
