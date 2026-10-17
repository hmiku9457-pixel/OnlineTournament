import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/AppShell';
import { DashboardPage } from '@/pages/DashboardPage';
import { CreateTournamentPage } from '@/pages/CreateTournamentPage';
import { TournamentPage } from '@/pages/TournamentPage';
import { ScoringPage } from '@/pages/ScoringPage';
import { SpectatorPage } from '@/pages/SpectatorPage';
import { LoginPage } from '@/pages/LoginPage';
import { NotFoundPage } from '@/pages/NotFoundPage';

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/tournaments/new" element={<CreateTournamentPage />} />
        <Route path="/tournaments/:tournamentId" element={<TournamentPage />} />
        <Route path="/score/:matchId" element={<ScoringPage />} />
        <Route path="/live/:tournamentId" element={<SpectatorPage />} />
        <Route path="/404" element={<NotFoundPage />} />
        <Route path="*" element={<Navigate to="/404" replace />} />
      </Route>
    </Routes>
  );
}
