import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ShieldCheck, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { setAdminStepUpHandler } from '@/lib/adminStepUp';

function hasRecentTotpProof(token: string) {
  try {
    const payload = token.split('.')[1];
    if (!payload) return false;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='));
    const claims = JSON.parse(decoded);
    const totp = Array.isArray(claims.amr)
      ? claims.amr.find((method: any) => method?.method === 'totp')
      : null;
    const timestamp = Number(totp?.timestamp);
    const now = Math.floor(Date.now() / 1000);
    return claims.aal === 'aal2' &&
      Number.isFinite(timestamp) &&
      timestamp > 0 &&
      timestamp <= now + 60 &&
      now - timestamp <= 300;
  } catch {
    return false;
  }
}

export default function AdminStepUpProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [factorId, setFactorId] = useState('');
  const [challengeId, setChallengeId] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [preparing, setPreparing] = useState(false);
  const pendingRef = useRef<{ promise: Promise<void>; resolve: () => void; reject: (error: Error) => void } | null>(null);

  const clearPending = useCallback(() => {
    pendingRef.current = null;
    setOpen(false);
    setFactorId('');
    setChallengeId('');
    setCode('');
    setBusy(false);
    setPreparing(false);
  }, []);

  const beginStepUp = useCallback((): Promise<void> => {
    if (pendingRef.current) return pendingRef.current.promise;
    setError('');
    setOpen(true);
    setPreparing(true);
    const promise = new Promise<void>((resolve, reject) => {
      pendingRef.current = { promise: Promise.resolve(), resolve, reject };
    });
    pendingRef.current.promise = promise;

    void (async () => {
      try {
        const listed = await supabase.auth.mfa.listFactors();
        if (listed.error) throw new Error('Your registered authenticator could not be checked. Try again.');
        const factor = (listed.data?.totp || []).find((item: any) => item.status === 'verified');
        if (!factor) throw new Error('No verified authenticator is registered. Contact the MatMove owner.');
        const challenge = await supabase.auth.mfa.challenge({ factorId: factor.id });
        if (challenge.error || !challenge.data?.id) throw new Error('A fresh authenticator challenge could not be prepared.');
        setFactorId(factor.id);
        setChallengeId(challenge.data.id);
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Authenticator verification could not be prepared.';
        const pending = pendingRef.current;
        clearPending();
        pending?.reject(new Error(message));
      } finally {
        setPreparing(false);
      }
    })();

    return promise;
  }, [clearPending]);

  useEffect(() => {
    setAdminStepUpHandler(beginStepUp);
    return () => {
      setAdminStepUpHandler(null);
      const pending = pendingRef.current;
      clearPending();
      pending?.reject(new Error('Authenticator verification was interrupted.'));
    };
  }, [beginStepUp, clearPending]);

  async function verifyCode(event: React.FormEvent) {
    event.preventDefault();
    if (!factorId || !challengeId || !/^\d{6}$/.test(code)) {
      setError('Enter the current six-digit authenticator code.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const verified = await supabase.auth.mfa.verify({ factorId, challengeId, code });
      if (verified.error) throw new Error('The authenticator code was not accepted. Check your phone time and try again.');
      const [assurance, session] = await Promise.all([
        supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
        supabase.auth.getSession(),
      ]);
      const token = session.data?.session?.access_token || '';
      if (assurance.error || assurance.data?.currentLevel !== 'aal2' || !hasRecentTotpProof(token)) {
        throw new Error('The fresh authenticator verification was not confirmed. Try again.');
      }
      const pending = pendingRef.current;
      clearPending();
      pending?.resolve();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Authenticator verification failed.');
      setCode('');
      setBusy(false);
    }
  }

  function cancel() {
    const pending = pendingRef.current;
    clearPending();
    pending?.reject(new Error('You cancelled the sensitive action. No change was made.'));
  }

  return (
    <>
      {children}
      {open && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-slate-950/70 p-4">
          <section role="dialog" aria-modal="true" aria-labelledby="admin-step-up-title" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center gap-3">
              <span className="rounded-xl bg-emerald-50 p-3 text-emerald-700"><ShieldCheck size={22}/></span>
              <div>
                <h2 id="admin-step-up-title" className="text-lg font-bold text-slate-950">Confirm it’s you</h2>
                <p className="text-xs text-slate-500">Extra security for this sensitive Admin action</p>
              </div>
              <button type="button" onClick={cancel} aria-label="Cancel verification" className="ml-auto rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X size={18}/></button>
            </div>
            <p className="mt-4 text-sm leading-6 text-slate-600">Enter a fresh six-digit code from your MatMove Admin authenticator app. The action will continue only after verification succeeds.</p>
            {error && <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
            <form onSubmit={verifyCode} className="mt-4 space-y-3">
              <label className="block text-sm font-semibold text-slate-700">
                Authenticator code
                <input autoFocus inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={e => setCode(e.target.value.replace(/\D/g,'').slice(0,6))} className="mt-2 min-h-12 w-full rounded-xl border px-4 text-center text-2xl tracking-[0.35em]" placeholder="000000"/>
              </label>
              <button type="submit" disabled={busy || preparing || code.length !== 6 || !challengeId} className="min-h-11 w-full rounded-xl bg-emerald-700 px-4 py-3 font-bold text-white disabled:opacity-50">{preparing ? 'Preparing secure challenge…' : busy ? 'Verifying…' : 'Verify and continue'}</button>
              <button type="button" disabled={busy} onClick={cancel} className="min-h-10 w-full rounded-xl border px-4 py-2 text-sm font-semibold text-slate-700">Cancel action</button>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
