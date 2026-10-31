import { Navigate, Route, Routes, useParams } from 'react-router-dom';
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
import { getAllMockTournaments } from '@/services/mockTournamentStore';

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

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/tournaments/new" element={<CreateTournamentPage />} />
        <Route path="/tournaments/:tournamentId" element={<TournamentPage />} />
        <Route path="/tournaments/:tournamentId/control" element={<TournamentControlRoute />} />
        <Route path="/404" element={<NotFoundPage />} />
      </Route>
      <Route path="/player/:tournamentId" element={<PlayerTournamentPage />} />
      <Route path="/score/:matchId" element={<ScoringPage />} />
      <Route path="/live/:tournamentId" element={<SpectatorPage />} />
      <Route path="*" element={<Navigate to="/404" replace />} />
    </Routes>
  );
}
