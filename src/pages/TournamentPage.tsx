import { Navigate, useParams } from 'react-router-dom';

/**
 * Alte Turnier-Detailroute: weiterhin erreichbar, aber keine zusätzliche
 * Zwischenstation mehr zwischen Erstellung und eigentlicher Turnierleitung.
 * Die kompakte Turnierübersicht liegt jetzt als eigener Tab in der Leitung.
 */
export function TournamentPage() {
  const { tournamentId } = useParams();
  if (!tournamentId) return <Navigate to="/404" replace />;
  return <Navigate to={`/tournaments/${tournamentId}/control`} replace />;
}
