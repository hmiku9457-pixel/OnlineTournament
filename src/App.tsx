import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { AppShell } from '@/components/AppShell';
import { DashboardPage } from '@/pages/DashboardPage';
import { CreateTournamentPage } from '@/pages/CreateTournamentPage';
import { TournamentPage } from '@/pages/TournamentPage';
import { TournamentControlPage } from '@/pages/TournamentControlPage';
import { PlayerTournamentPage } from '@/pages/PlayerTournamentPage';
import { ScoringPage } from '@/pages/ScoringPage';
import { SpectatorPage } from '@/pages/SpectatorPage';
import { LoginPage } from '@/pages/LoginPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { StorageIntegrityBanner } from '@/components/StorageIntegrityBanner';
import { getAllMockTournaments } from '@/services/mockTournamentStore';
import { getSavedCreationDraftAtomic } from '@/domain/savedCreationDraftStore';
import type { CreationDraft, SavedCreationDraft } from '@/domain/creationDraft';
import { creationRecoveryKey, readCreationRecoveryAtomic } from '@/domain/creationRecoveryStore';

/** Force a fresh controller instance when navigating from tournament A to B.
 * React Router otherwise reuses the same component for the parameterized
 * route, leaving useState(initialTournament) bound to the old tournament.
 * Navigating between tabs inside the same tournament keeps the same key.
 */
function TournamentControlRoute() {
  const { tournamentId } = useParams();
  if (!tournamentId || !getAllMockTournaments().some((entry) => entry.id === tournamentId)) {
    return <Navigate to="/404" replace />;
  }
  return <TournamentControlPage key={tournamentId} />;
}

function DraftEditorLoader({ draftId }: { draftId: string }) {
  const [loaded, setLoaded] = useState<{ saved: SavedCreationDraft | null; recovery: CreationDraft | null }>();
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getSavedCreationDraftAtomic(draftId),
      readCreationRecoveryAtomic(creationRecoveryKey(draftId)).catch(() => null),
    ]).then(([saved, recovery]) => {
      if (!cancelled) setLoaded({ saved, recovery });
    }).catch((failure: unknown) => {
      if (!cancelled) {
        const detail = failure instanceof Error ? failure.message : '';
        setError(`Die gespeicherten Entwürfe sind nicht verfügbar. IndexedDB ist möglicherweise blockiert. Bitte den Browserspeicher freigeben und die Seite erneut öffnen.${detail ? ` (${detail})` : ''}`);
      }
    });
    return () => { cancelled = true; };
  }, [draftId]);
  if (error) return <div className="card" role="alert">{error}</div>;
  if (!loaded) return <p role="status">Gespeicherten Entwurf öffnen …</p>;
  if (loaded.saved === null) return <div className="card" role="alert">Dieser Entwurf ist nicht mehr vorhanden. Bitte einen anderen Entwurf auswählen.</div>;
  return <CreateTournamentPage key={draftId} initialNamedDraft={loaded.saved} initialRecoveryDraft={loaded.recovery} />;
}

function NewTournamentLoader() {
  const [recovery, setRecovery] = useState<CreationDraft | null | undefined>();
  useEffect(() => {
    let cancelled = false;
    readCreationRecoveryAtomic(creationRecoveryKey(null))
      .then((draft) => { if (!cancelled) setRecovery(draft); })
      .catch(() => { if (!cancelled) setRecovery(null); });
    return () => { cancelled = true; };
  }, []);
  if (recovery === undefined) return <p role="status">Turnierentwurf vorbereiten …</p>;
  return <CreateTournamentPage key="new" initialRecoveryDraft={recovery} />;
}

function CreateTournamentRoute() {
  const location = useLocation();
  const draftId = new URLSearchParams(location.search).get('draft');
  return draftId ? <DraftEditorLoader key={draftId} draftId={draftId} />
    : <NewTournamentLoader />;
}

export default function App() {
  return (
    <>
    <StorageIntegrityBanner />
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/tournaments/new" element={<CreateTournamentRoute />} />
        <Route path="/tournaments/:tournamentId" element={<TournamentPage />} />
        <Route path="/tournaments/:tournamentId/control" element={<TournamentControlRoute />} />
        <Route path="/404" element={<NotFoundPage />} />
      </Route>
      <Route path="/player/:tournamentId" element={<PlayerTournamentPage />} />
      <Route path="/score/:matchId" element={<ScoringPage />} />
      <Route path="/live/:tournamentId" element={<SpectatorPage />} />
      <Route path="*" element={<Navigate to="/404" replace />} />
    </Routes>
    </>
  );
}
