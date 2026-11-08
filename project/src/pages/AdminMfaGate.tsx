import { useEffect, useRef, useState } from 'react';
import { Loader2, LogOut, ShieldCheck } from 'lucide-react';
import { supabase } from '../lib/supabase';

type Props = {
  onComplete: () => Promise<void>;
  onSignOut: () => Promise<void>;
};

type Mode = 'loading' | 'enroll' | 'challenge' | 'blocked' | 'error';

export default function AdminMfaGate({ onComplete, onSignOut }: Props) {
  const [mode, setMode] = useState<Mode>('loading');
  const [factorId, setFactorId] = useState('');
  const [qrCode, setQrCode] = useState('');
  const [secret, setSecret] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    let live = true;
    async function prepare() {
      try {
        const [aal, factors] = await Promise.all([
          supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
          supabase.auth.mfa.listFactors(),
        ]);
        if (aal.error) throw aal.error;
        if (factors.error) throw factors.error;

        const verified = (factors.data.totp || []).filter((factor: any) => factor.status === 'verified');
        const pending = (factors.data.totp || []).filter((factor: any) => factor.status !== 'verified');

        if (verified.length > 0) {
          if (aal.data.currentLevel === 'aal2' && aal.data.nextLevel === 'aal2') {
            await onComplete();
            return;
          }
          if (live) {
            setFactorId(verified[0].id);
            setMode('challenge');
          }
          return;
        }

        if (pending.length > 0) {
          if (live) {
            setError('An unfinished authenticator setup already exists on this account. Contact the MatMove owner to clear the pending factor before trying again.');
            setMode('blocked');
          }
          return;
        }

        const enrolled = await supabase.auth.mfa.enroll({
          factorType: 'totp',
          friendlyName: 'MatMove Admin',
        });
        if (enrolled.error) throw enrolled.error;
        if (!live) return;

        setFactorId(enrolled.data.id);
        setQrCode(enrolled.data.totp.qr_code);
        setSecret(enrolled.data.totp.secret);
        setMode('enroll');
      } catch (cause) {
        if (live) {
          setError(cause instanceof Error ? cause.message : 'Two-factor setup could not be started. Try again or contact the owner.');
          setMode('error');
        }
      }
    }

    void prepare();
    return () => { live = false; };
  }, [onComplete]);

  async function verifyCode(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !factorId) return;
    if (!/^\d{6}$/.test(code.trim())) {
      setError('Enter the six-digit code from your authenticator app.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      const challenge = await supabase.auth.mfa.challenge({ factorId });
      if (challenge.error) throw challenge.error;

      const verified = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.data.id,
        code: code.trim(),
      });
      if (verified.error) throw verified.error;

      const refreshed = await supabase.auth.refreshSession();
      if (refreshed.error) throw refreshed.error;

      const assurance = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (assurance.error || assurance.data.currentLevel !== 'aal2') {
        throw new Error('The second factor was not confirmed. Enter a fresh code and try again.');
      }

      setCode('');
      await onComplete();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The authenticator code could not be verified.');
    } finally {
      setBusy(false);
    }
  }

  async function leave() {
    if (busy) return;
    setBusy(true);
    try {
      await onSignOut();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Sign out could not be confirmed.');
    } finally {
      setBusy(false);
    }
  }

  const enrolling = mode === 'enroll';
  const blocked = mode === 'blocked' || mode === 'error';

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-5">
      <section className="w-full max-w-lg space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-xl sm:p-8">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-700">
          <ShieldCheck size={30} />
        </div>
        <div className="text-center">
          <h1 className="text-2xl font-bold text-slate-900">Secure your MatMove Admin account</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Admin access requires an authenticator-app code in addition to your password.
          </p>
        </div>

        {mode === 'loading' && (
          <p role="status" className="flex items-center justify-center gap-2 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
            <Loader2 size={18} className="animate-spin" /> Preparing two-factor verification…
          </p>
        )}

        {enrolling && (
          <div className="space-y-4">
            <p className="text-sm text-slate-700">
              1. Install or open an authenticator app such as Google Authenticator, Microsoft Authenticator or 1Password.
              2. Scan this QR code, or enter the setup key manually.
            </p>
            {qrCode && (
              <div className="mx-auto flex w-fit rounded-xl border bg-white p-3">
                <img src={qrCode} alt="MatMove Admin authenticator QR code" className="h-48 w-48" />
              </div>
            )}
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Manual setup key</p>
              <p className="mt-1 break-all font-mono text-sm text-slate-900">{secret}</p>
              <p className="mt-2 text-xs text-slate-500">Keep this key private. Anyone who has it can generate your Admin verification codes.</p>
            </div>
          </div>
        )}

        {mode === 'challenge' && (
          <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-700">
            Open your authenticator app and enter the current six-digit code for MatMove Admin.
          </p>
        )}

        {(enrolling || mode === 'challenge') && (
          <form onSubmit={verifyCode} className="space-y-3">
            <label className="block text-sm font-semibold text-slate-700">
              {enrolling ? '3. Verify your authenticator app' : 'Authenticator code'}
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                disabled={busy}
                value={code}
                onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 px-4 text-center font-mono text-xl tracking-[0.35em]"
              />
            </label>
            <button type="submit" disabled={busy || code.length !== 6} className="flex min-h-12 w-full items-center justify-center rounded-xl bg-indigo-700 px-4 py-3 font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">
              {busy ? <><Loader2 size={18} className="mr-2 animate-spin" /> Verifying…</> : enrolling ? 'Enable Admin two-factor security' : 'Verify and continue'}
            </button>
          </form>
        )}

        {blocked && (
          <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            {error}
          </p>
        )}
        {error && !blocked && (
          <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>
        )}

        <div className="border-t pt-4">
          <p className="text-xs leading-5 text-slate-500">
            Keep access to your authenticator device. If it is lost, contact the MatMove owner for an identity-verified factor reset.
          </p>
          <button type="button" disabled={busy} onClick={() => void leave()} className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50">
            <LogOut size={16} /> Sign out
          </button>
        </div>
      </section>
    </main>
  );
}
