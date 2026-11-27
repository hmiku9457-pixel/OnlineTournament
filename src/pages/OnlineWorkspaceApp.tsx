import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import { TournamentControlPage } from '@/pages/TournamentControlPage';
import { ScoringPage } from '@/pages/ScoringPage';
import { getTournamentStorageError, hasPendingRemoteWrites } from '@/services/localTournamentStorage';
import { localOverviewUrl } from '@/services/onlineTournaments';

function OnlineControl({ id }: { id: string }) {
  const params = useParams();
  return params.tournamentId === id ? <TournamentControlPage key={id} /> : <Navigate to={'/tournaments/' + id + '/control'} replace />;
}
export function OnlineWorkspaceApp({ id }: { id: string }) {
  const [, refresh] = useState(0);
  useEffect(() => {
    const changed = () => refresh((n) => n + 1);
    window.addEventListener('tournament-storage-integrity-change', changed);
    changed();
    return () => window.removeEventListener('tournament-storage-integrity-change', changed);
  }, []);
  const pending = hasPendingRemoteWrites();
  const error = getTournamentStorageError();
  const route = '/tournaments/' + id + '/control';
  return <main className="main">
    <section className="card no-print" style={{ marginBottom: 12 }}>
      <div className="actions">
        <strong>Online-Testbetrieb</strong>
        <span role="status">{error ? 'Speicherung nicht bestätigt' : pending ? 'Wird in Supabase gespeichert …' : 'Datenbankstand bestätigt'}</span>
        <a className="btn small" href={localOverviewUrl()} onClick={(event) => { if (pending) event.preventDefault(); }}>Zur Online-Übersicht</a>
      </div>
      {error && <p role="alert">{error} <button className="btn small" onClick={() => window.location.reload()}>Datenbankstand neu laden</button></p>}
      <p className="muted">Nur für Entwicklungstests. Spieler- und Zuschauerzugriff ist noch nicht öffentlich.</p>
    </section>
    {!error && <div inert={pending} aria-busy={pending}>
      <Routes>
        <Route path="/tournaments/:tournamentId/control" element={<OnlineControl id={id} />} />
        <Route path="/score/:matchId" element={<ScoringPage />} />
        <Route path="*" element={<Navigate to={route} replace />} />
      </Routes>
    </div>}
  </main>;
}
