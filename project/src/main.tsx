import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

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

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
      // The Admin portal remains usable online if offline-shell installation fails.
    });
  }, { once: true });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
