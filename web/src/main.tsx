import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

if (window.location.pathname === '/__reel') {
  // Headless reel rendering for the automatic posting job; no app UI.
  import('./reelRenderHost').then((m) => m.installReelRenderHost());
} else {
  // Story photos load from the publishers' servers, and some links die (removed or
  // renamed images). Hide a photo that fails, with its frame, instead of showing a
  // broken image box with alt text.
  document.addEventListener(
    'error',
    (e) => {
      const img = e.target;
      if (!(img instanceof HTMLImageElement) || !img.src || img.src.startsWith(window.location.origin)) return;
      const frame = img.closest('figure, div.border, div[class*="overflow-hidden"]') as HTMLElement | null;
      (frame && frame.querySelectorAll('img').length === 1 ? frame : img).style.display = 'none';
    },
    true,
  );
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
