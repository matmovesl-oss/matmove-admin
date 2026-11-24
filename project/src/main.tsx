import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { isSupabaseConfigured } from './lib/supabase';

const rootElement = document.getElementById('root');
if (rootElement) {
  document.addEventListener('error', event => {
    const image = event.target;
    if (!(image instanceof HTMLImageElement) || !rootElement.contains(image)) return;
    if (image.closest('.mapboxgl-map, .gm-style, [data-no-image-fallback]')) return;
    if (image.dataset.matmoveFallbackApplied === 'true' || image.getAttribute('src') === '/image-unavailable.svg') return;
    image.dataset.matmoveFallbackApplied = 'true';
    image.src = '/image-unavailable.svg';
  }, true);
}

function SecureAdminPreviewDisconnected() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-5 py-10">
      <section
        role="status"
        className="w-full max-w-md rounded-3xl border border-white/15 bg-white/10 p-7 text-center text-white shadow-2xl backdrop-blur-2xl"
      >
        <img src="/logo.png" alt="MatMove" className="mx-auto mb-6 h-12 w-auto object-contain" />
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">
          Secure Admin preview
        </p>
        <h1 className="text-xl font-bold">
          Preview is not connected to a test database
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-200">
          This build is intentionally disconnected from live staff accounts, customer records, wallets and payment services.
          Admin sign-in and financial actions are disabled until a dedicated non-production backend is configured.
        </p>
        <p className="mt-5 rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-3 text-xs leading-5 text-slate-300">
          The production Admin portal continues to use its configured Supabase connection.
        </p>
      </section>
    </main>
  );
}

if (import.meta.env.PROD && isSupabaseConfigured && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
      // The Admin portal remains usable online if offline-shell installation fails.
    });
  }, { once: true });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isSupabaseConfigured ? <App /> : <SecureAdminPreviewDisconnected />}
  </StrictMode>
);
