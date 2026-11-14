import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

if (window.location.pathname === '/__reel') {
  // Headless reel rendering for the automatic posting job; no app UI.
  import('./reelRenderHost').then((m) => m.installReelRenderHost());
} else {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
