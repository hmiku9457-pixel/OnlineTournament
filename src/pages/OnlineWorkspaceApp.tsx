import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import { TournamentControlPage } from '@/pages/TournamentControlPage';
import { ScoringPage } from '@/pages/ScoringPage';
import { getTournamentStorageError, hasPendingRemoteWrites, getRemoteRecovery, retryRemoteTournamentWrite } from '@/services/localTournamentStorage';
import { localOverviewUrl } from '@/services/onlineTournaments';

function OnlineControl({ id }: { id: string }) {
  const params = useParams();
  return params.tournamentId === id ? <TournamentControlPage key={id} /> : <Navigate to={'/tournaments/' + id + '/control'} replace />;
}
export function OnlineWorkspaceApp({ id }: { id: string }) {
  const [, refresh] = useState(0);
  const [connected, setConnected] = useState(navigator.onLine);
  useEffect(() => {
    const changed = () => refresh((n) => n + 1);
    window.addEventListener('tournament-storage-integrity-change', changed);
    const connectionChanged = () => setConnected(navigator.onLine);
    window.addEventListener('online', connectionChanged);
    window.addEventListener('offline', connectionChanged);
    changed();
    return () => { window.removeEventListener('tournament-storage-integrity-change', changed); window.removeEventListener('online', connectionChanged); window.removeEventListener('offline', connectionChanged); };
  }, []);
  const pending = hasPendingRemoteWrites();
  const error = getTournamentStorageError();
  const recovery = getRemoteRecovery();
  const route = '/tournaments/' + id + '/control';
  return <main className="main">
    <section className="card no-print" style={{ marginBottom: 12 }}>
      <div className="actions">
        <strong>Online-Testbetrieb</strong>
        <span role="status">{pending ? 'Wird in Supabase gespeichert …' : error ? 'Speicherung nicht bestätigt' : !connected ? 'Offline – Bearbeitung gesperrt' : 'Datenbankstand bestätigt'}</span>
        <a className="btn small" href={localOverviewUrl()} onClick={(event) => { if (pending) event.preventDefault(); }}>Zur Online-Übersicht</a>
      </div>
      {!connected && <p role="alert">Keine Internetverbindung. Bereits laufende Partien können am Tisch beendet werden. Neue Änderungen werden erst nach Wiederverbindung zugelassen.</p>}
      {error && <div role="alert"><p>{error}</p><div className="actions">
        {recovery?.retryable && <button className="btn primary small" disabled={!connected || pending} onClick={() => void retryRemoteTournamentWrite().catch(() => {})}>Speicherung erneut versuchen</button>}
        {recovery && <button className="btn small" disabled={pending} onClick={() => {
          const url = URL.createObjectURL(new Blob([JSON.stringify(recovery.snapshot, null, 2)], { type: 'application/json' }));
          const a = document.createElement('a'); a.href = url; a.download = 'unbestaetigter-turnierstand-' + id + '.json'; a.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        }}>Unbestätigten Stand als JSON sichern</button>}
        <button className="btn small" disabled={pending || !connected} onClick={() => window.location.reload()}>Datenbankstand neu laden</button>
      </div>{recovery && <p className="muted">Die ursprüngliche Anfrage wird vor der Übertragung in diesem Browser journalisiert. Bei Speicherproblemen zusätzlich die JSON-Datei sichern. Die JSON-Datei ist keine bestätigte Cloud-Version und darf nicht blind überschrieben werden.</p>}</div>}
      <p className="muted">Nur für Entwicklungstests. Spieler- und Zuschauerzugriff ist noch nicht öffentlich.</p>
    </section>
    {!error && <div inert={pending || !connected} aria-busy={pending}>
      <Routes>
        <Route path="/tournaments/:tournamentId/control" element={<OnlineControl id={id} />} />
        <Route path="/score/:matchId" element={<ScoringPage />} />
        <Route path="*" element={<Navigate to={route} replace />} />
      </Routes>
    </div>}
  </main>;
}
