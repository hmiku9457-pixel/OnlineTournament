import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createHashRouter, RouterProvider } from 'react-router-dom';
import App from './App';
import { OnlineSpectatorPage } from './pages/OnlineSpectatorPage';
import { OnlineRecoveryPage } from './pages/OnlineRecoveryPage';
import { OnlineWorkspaceApp } from './pages/OnlineWorkspaceApp';
import { initializeOnlineWorkspace, localOverviewUrl, WorkspaceBusyError } from './services/onlineTournaments';
import { initializeLocalTournamentStorage, markLocalTournamentStorageUnavailable } from './services/localTournamentStorage';
import './styles.css';

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((error) => {
      console.warn('Service worker registration failed', error);
    });
  });
}

// Data router enables blocking all internal navigation while pre-start edits are unsaved.
const onlineId = new URLSearchParams(window.location.search).get('online');
const root = createRoot(document.getElementById('root')!);
const router = createHashRouter([{ path: '*', element: onlineId ? <OnlineWorkspaceApp id={onlineId} /> : <App /> }]);
async function boot() {
  const spectator=window.location.hash.match(/^#\/watch\/([^/?#]+)$/);
  if(spectator){root.render(<StrictMode><OnlineSpectatorPage token={spectator[1]}/></StrictMode>);return;}
  if (onlineId !== null) {
    root.render(<main className="main"><p role="status">Online-Turnier wird geladen …</p></main>);
    try {
      const unresolved = await initializeOnlineWorkspace(onlineId);
      if (unresolved.length) { root.render(<StrictMode><OnlineRecoveryPage operations={unresolved}/></StrictMode>); return; }
    }
    catch (error) {
      root.render(<main className="main"><section className="card" role="alert"><h1>{error instanceof WorkspaceBusyError ? 'Turnier wird bereits bearbeitet' : 'Online-Turnier nicht verfügbar'}</h1>
        <p>{error instanceof Error ? error.message : 'Verbindung fehlgeschlagen.'}</p>
        {error instanceof WorkspaceBusyError && <p>Gib die Sperre im bisherigen Arbeitsbereich frei. Nach einem Verbindungsabbruch oder Schließen läuft sie spätestens 90 Sekunden nach der letzten Verlängerung aus.</p>}
        <button className="btn primary" onClick={()=>window.location.reload()}>Erneut versuchen</button>
        <a className="btn" href={localOverviewUrl()}>Zur Online-Übersicht</a>
      </section></main>);
      return;
    }
  } else {
    try { await initializeLocalTournamentStorage(); }
    catch (error) { markLocalTournamentStorageUnavailable(error); }
  }
  root.render(<StrictMode><RouterProvider router={router} /></StrictMode>);
}
void boot();
