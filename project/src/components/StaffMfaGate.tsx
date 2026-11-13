import { useEffect, useState } from 'react';
import { Loader2, ShieldCheck, ShieldAlert } from 'lucide-react';
import { supabase } from '../lib/supabase';

type Stage = 'checking' | 'enroll' | 'setup' | 'challenge' | 'blocked';

type Factor = { id: string; status: string; friendly_name?: string };

export default function StaffMfaGate({
  userId,
  onVerified,
}: {
  userId: string;
  onVerified: () => Promise<void> | void;
}) {
  const [stage, setStage] = useState<Stage>('checking');
  const [factorId, setFactorId] = useState('');
  const [canReplaceSetup, setCanReplaceSetup] = useState(false);
  const [challengeId, setChallengeId] = useState('');
  const [qrCode, setQrCode] = useState('');
  const [secret, setSecret] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function issueChallenge(id: string) {
    const result = await supabase.auth.mfa.challenge({ factorId: id });
    if (result.error || !result.data?.id) {
      throw new Error('Authenticator challenge could not be created. Try again.');
    }
    setFactorId(id);
    setChallengeId(result.data.id);
  }

  async function inspectSession() {
    setStage('checking');
    setError('');
    try {
      const [aal, factors] = await Promise.all([
        supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
        supabase.auth.mfa.listFactors(),
      ]);
      if (aal.error || factors.error) {
        throw new Error('Admin security verification is unavailable. Access remains blocked.');
      }
      if (aal.data?.currentLevel === 'aal2' && aal.data?.nextLevel === 'aal2') {
        await onVerified();
        return;
      }
      const totp = factors.data?.totp || [];
      const verified = totp.find((factor: Factor) => factor.status === 'verified');
      if (verified) {
        setCanReplaceSetup(false);
        await issueChallenge(verified.id);
        setStage('challenge');
        return;
      }
      const unfinished = totp.find((factor: Factor) => factor.status === 'unverified');
      if (unfinished) {
        setFactorId(unfinished.id);
        setCanReplaceSetup(true);
        setQrCode('');
        setSecret('');
        setChallengeId('');
        setStage('blocked');
        setError('An unfinished authenticator setup exists for this account. If its QR code or setup key was exposed, replace that unfinished setup here before enrolling again.');
        return;
      }
      setStage('enroll');
    } catch (e) {
      setStage('blocked');
      setError(e instanceof Error ? e.message : 'Admin security verification failed.');
    }
  }

  useEffect(() => {
    void inspectSession();
    // A new signed-in staff identity must always start a fresh MFA check.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  async function createEnrollment() {
    const enrolled = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: 'MatMove Admin',
    });
    if (enrolled.error) throw enrolled.error;
    if (
      !enrolled.data?.id ||
      !enrolled.data.totp?.qr_code ||
      !enrolled.data.totp?.secret
    ) {
      throw new Error('Supabase did not return the new authenticator QR code and secret. No setup was displayed.');
    }
    setFactorId(enrolled.data.id);
    setCanReplaceSetup(true);
    setQrCode(enrolled.data.totp.qr_code);
    setSecret(enrolled.data.totp.secret);
    setChallengeId('');
    setCode('');
    setStage('setup');
    try {
      const challenge = await supabase.auth.mfa.challenge({ factorId: enrolled.data.id });
      if (challenge.error || !challenge.data?.id) throw new Error('Challenge unavailable.');
      setChallengeId(challenge.data.id);
    } catch {
      // Keep this newly generated QR/setup key visible and let the user retry
      // the challenge; retrying a challenge does not change the setup secret.
      setError('Your new authenticator setup has started, but the verification challenge could not be prepared. Keep this page open and retry the challenge below.');
    }
  }

  async function showExistingUnverifiedFactor(message: string) {
    const listed = await supabase.auth.mfa.listFactors();
    if (listed.error) throw new Error('Supabase reports an existing authenticator, but its status could not be rechecked. Refresh Admin and try the recovery action again.');
    const pending = (listed.data?.totp || []).find((factor: Factor) => factor.status === 'unverified');
    if (!pending) return false;
    setFactorId(pending.id);
    setCanReplaceSetup(true);
    setQrCode('');
    setSecret('');
    setChallengeId('');
    setCode('');
    setStage('blocked');
    setError(message);
    return true;
  }

  async function beginEnrollment() {
    setBusy(true);
    setError('');
    try {
      // Recheck first so a stale pending factor is never met with a second
      // enrollment request using the same friendly name.
      const listed = await supabase.auth.mfa.listFactors();
      if (listed.error) throw new Error('Could not check your existing authenticator setup. Access remains blocked; refresh and retry.');
      const verified = (listed.data?.totp || []).find((factor: Factor) => factor.status === 'verified');
      if (verified) {
        setCanReplaceSetup(false);
        await issueChallenge(verified.id);
        setStage('challenge');
        return;
      }
      const pending = (listed.data?.totp || []).find((factor: Factor) => factor.status === 'unverified');
      if (pending) {
        setFactorId(pending.id);
        setCanReplaceSetup(true);
        setQrCode('');
        setSecret('');
        setChallengeId('');
        setStage('blocked');
        setError('An unfinished MatMove Admin authenticator already exists. Replace that pending setup to generate a fresh QR code; do not start another enrollment.');
        return;
      }
      await createEnrollment();
    } catch (e: any) {
      const message = e instanceof Error ? e.message : 'Authenticator setup failed.';
      const code = String(e?.code || e?.error || '');
      if (code === 'mfa_factor_name_conflict' || /factor.*friendly name.*already exists/i.test(message)) {
        try {
          const shown = await showExistingUnverifiedFactor('Supabase found an unfinished MatMove Admin authenticator for this account. Replace that pending setup below to generate a fresh QR code.');
          if (shown) return;
        } catch (recheckError) {
          setStage('blocked');
          setError(recheckError instanceof Error ? recheckError.message : 'An existing authenticator needs recovery. Do not retry enrollment.');
          return;
        }
        setStage('blocked');
        setError('Supabase says a MatMove Admin authenticator with this name already exists, but it was not returned in the factor list. Do not keep retrying. Sign out, sign in again at matmove-admin.vercel.app, and contact the MatMove owner if the conflict remains.');
      } else {
        setError(message);
      }
    } finally {
      setBusy(false);
    }
  }

  async function replaceUnverifiedSetup() {
    if (!factorId || !canReplaceSetup) return;
    setBusy(true);
    setError('');
    // Hide the exposed secret immediately. Only an unverified factor belonging
    // to the currently signed-in staff account may be removed by this action.
    setQrCode('');
    setSecret('');
    setCode('');
    setChallengeId('');
    try {
      const listed = await supabase.auth.mfa.listFactors();
      if (listed.error) throw new Error('Could not verify the pending authenticator status. Nothing was changed.');
      const pending = (listed.data?.totp || []).find((factor: Factor) => factor.id === factorId);
      if (!pending || pending.status !== 'unverified') {
        throw new Error('This action can only replace an unfinished, unverified authenticator setup.');
      }
      const removed = await supabase.auth.mfa.unenroll({ factorId });
      if (removed.error) throw new Error('The unfinished authenticator setup could not be removed. Contact the MatMove owner for staff recovery.');
      setFactorId('');
      setCanReplaceSetup(false);
      setStage('enroll');
      await createEnrollment();
    } catch (e) {
      setStage('blocked');
      setError(e instanceof Error ? e.message : 'The unfinished authenticator setup could not be safely replaced.');
    } finally {
      setBusy(false);
    }
  }

  async function refreshChallenge() {
    if (!factorId) return;
    setBusy(true);
    setError('');
    try {
      await issueChallenge(factorId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'A new challenge could not be created.');
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    if (!factorId || !challengeId || !/^\d{6}$/.test(code)) {
      setError('Enter the current six-digit code from your authenticator app.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const verified = await supabase.auth.mfa.verify({
        factorId,
        challengeId,
        code,
      });
      if (verified.error) {
        throw new Error('The authenticator code was not accepted. Check your phone time and try again.');
      }
      const assurance = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (
        assurance.error ||
        assurance.data?.currentLevel !== 'aal2' ||
        assurance.data?.nextLevel !== 'aal2'
      ) {
        throw new Error('The second factor was not confirmed. Admin access remains blocked.');
      }
      setCanReplaceSetup(false);
      await onVerified();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Authenticator verification failed.');
      setCode('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <section className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-xl sm:p-8">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-indigo-50 p-3 text-indigo-700"><ShieldCheck size={26} /></div>
          <div>
            <h1 className="text-xl font-bold text-slate-950">Secure MatMove Admin</h1>
            <p className="text-sm text-slate-600">Authenticator verification is required for every staff account.</p>
          </div>
        </div>

        {error && <p role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}

        {stage === 'checking' && (
          <p role="status" className="mt-6 flex items-center gap-2 text-sm text-slate-600"><Loader2 className="animate-spin" size={18}/> Checking your authenticator status…</p>
        )}

        {stage === 'enroll' && (
          <div className="mt-6 space-y-4">
            <p className="text-sm leading-6 text-slate-700">Your staff account has not enrolled an authenticator yet. Set up an authenticator app such as Google Authenticator, Microsoft Authenticator or 1Password before opening the Admin workspace.</p>
            <button type="button" disabled={busy} onClick={beginEnrollment} className="min-h-11 w-full rounded-xl bg-indigo-700 px-4 py-3 font-bold text-white disabled:opacity-60">
              {busy ? 'Preparing secure setup…' : 'Set up authenticator'}
            </button>
          </div>
        )}

        {stage === 'setup' && (
          <div className="mt-6 space-y-4">
            <ol className="list-decimal space-y-2 pl-5 text-sm leading-6 text-slate-700">
              <li>Open your authenticator app and add a new account.</li>
              <li>Scan this QR code, or enter the setup key manually.</li>
              <li>Enter the six-digit code generated by the authenticator to finish setup.</li>
            </ol>
            <div className="flex justify-center rounded-xl border bg-slate-50 p-4">
              <img src={qrCode} alt="MatMove Admin authenticator QR code" className="h-48 w-48 bg-white object-contain" />
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Manual setup key</p>
              <code className="mt-1 block break-all text-sm font-bold text-slate-900">{secret}</code>
            </div>
            <p className="text-xs leading-5 text-slate-500">Keep this key private. MatMove staff will never be asked to send an authenticator code or setup key to support. A new code challenge does not replace this setup key.</p>
          </div>
        )}

        {stage === 'challenge' && (
          <div className="mt-6 space-y-3">
            <p className="text-sm leading-6 text-slate-700">Enter the current six-digit code from your registered authenticator app to continue to the Admin workspace.</p>
          </div>
        )}

        {(stage === 'setup' || stage === 'challenge') && (
          <div className="mt-5 space-y-3">
            {challengeId ? (
              <form onSubmit={verifyCode} className="space-y-3">
                <label className="block text-sm font-semibold text-slate-700">
                  Authenticator code
                  <input
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    required
                    value={code}
                    onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="mt-2 min-h-12 w-full rounded-xl border px-4 text-center text-2xl tracking-[0.35em]"
                    placeholder="000000"
                  />
                </label>
                <button type="submit" disabled={busy || code.length !== 6} className="min-h-11 w-full rounded-xl bg-indigo-700 px-4 py-3 font-bold text-white disabled:opacity-60">
                  {busy ? 'Verifying…' : 'Verify and open Admin'}
                </button>
              </form>
            ) : (
              <button type="button" disabled={busy || !factorId} onClick={refreshChallenge} className="min-h-11 w-full rounded-xl border px-4 py-3 font-semibold text-slate-700 disabled:opacity-60">
                {busy ? 'Preparing challenge…' : 'Prepare verification challenge'}
              </button>
            )}
            {challengeId && (
              <button type="button" disabled={busy} onClick={refreshChallenge} className="min-h-10 w-full rounded-xl border px-4 py-2 text-sm font-semibold text-slate-700">
                {stage === 'setup' ? 'Retry verification challenge (keep this key)' : 'Request a new code challenge'}
              </button>
            )}
            {stage === 'setup' && canReplaceSetup && (
              <button type="button" disabled={busy} onClick={replaceUnverifiedSetup} className="min-h-10 w-full rounded-xl border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 disabled:opacity-60">
                {busy ? 'Replacing unfinished setup…' : 'Cancel this setup and generate a fresh key'}
              </button>
            )}
          </div>
        )}

        {stage === 'blocked' && (
          <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
            <div className="flex items-center gap-2 font-bold"><ShieldAlert size={18}/> Admin access is blocked</div>
            <p className="mt-2 leading-6">If you have lost your authenticator, contact the MatMove owner through the verified staff support process. Password recovery alone does not bypass MFA.</p>
            {canReplaceSetup && (
              <div className="mt-4 space-y-2">
                <p className="leading-6">This account has an unfinished setup that has not been verified. You can safely remove only that pending setup and create a new private QR code.</p>
                <button type="button" disabled={busy} onClick={replaceUnverifiedSetup} className="min-h-11 w-full rounded-xl border border-red-300 bg-white px-4 py-3 font-bold text-red-700 disabled:opacity-60">
                  {busy ? 'Replacing unfinished setup…' : 'Replace unfinished setup and generate a fresh key'}
                </button>
              </div>
            )}
          </div>
        )}

        <p className="mt-6 border-t pt-4 text-xs leading-5 text-slate-500">This protection applies to Admin and staff access only. Customer sign-in is unchanged. Staff access remains unavailable until this verification step is complete.</p>
      </section>
    </main>
  );
}
