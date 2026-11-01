import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createHashRouter, RouterProvider } from 'react-router-dom';
import App from './App';
import { initializeLocalTournamentStorage } from './services/localTournamentStorage';
import './styles.css';

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((error) => {
      console.warn('Service worker registration failed', error);
    });
  });
}

// Data router enables blocking all internal navigation while pre-start edits are unsaved.
const router = createHashRouter([{ path: '*', element: <App /> }]);

initializeLocalTournamentStorage().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>,
  );
}).catch((error: unknown) => {
  const container = document.getElementById('root');
  if (!container) return;
  container.textContent = 'Der sichere lokale Turnierspeicher ist nicht verfügbar. Bitte IndexedDB im Browser erlauben und die Seite neu laden. '
    + (error instanceof Error ? error.message : '');
});
