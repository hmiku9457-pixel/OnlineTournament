import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getMockRuntimeMatches } from '@/services/mockRuntime';
import { getMockTournament } from '@/services/mockTournamentStore';

export function SpectatorPage() {
  const { tournamentId } = useParams();
  const tournament = useMemo(() => getMockTournament(tournamentId), [tournamentId]);
  const matches = useMemo(() => getMockRuntimeMatches(tournament), [tournament]);
  const live = matches.filter((match) => match.status === 'LIVE' || match.status === 'CONFIRMATION');
  const next = matches.filter((match) => match.status === 'READY' || match.status === 'WAITING');

  return (
    <div className="spectator-shell">
      <header className="page-head spectator-head">
        <div>
          <div className="control-kicker">Zuschaueransicht</div>
          <h1>{tournament.name}</h1>
          <p className="muted">{tournament.phasesLabel} · {tournament.participants} Teilnehmer</p>
        </div>
        <div className="actions">
          <span className="badge live">● LIVE</span>
          <Link className="btn" to={`/tournaments/${tournament.id}`}>Turnierinfo</Link>
        </div>
      </header>

      <section className="spectator-live-grid">
        {live.length === 0 ? (
          <div className="card empty-state">Aktuell laufen keine Spiele.</div>
        ) : live.map((match) => (
          <article className="card spectator-match-card" key={match.id}>
            <div className="spectator-match-head"><span className="badge live">LIVE</span><strong>{match.table}</strong></div>
            <span className="muted">{match.round}</span>
            <div className="spectator-team">{match.sideA}</div>
            <div className="spectator-score">{match.score}</div>
            <div className="spectator-team">{match.sideB}</div>
          </article>
        ))}
      </section>

      <section className="card spectator-next-card">
        <div className="control-section-head"><div><h2>Nächste Spiele</h2><p className="muted">Automatisch aktualisierte Tisch- und Warteschlangenübersicht.</p></div></div>
        <div className="spectator-next-list">
          {next.map((match) => (
            <div className="spectator-next-row" key={match.id}>
              <span className={match.status === 'READY' ? 'badge ready' : 'badge'}>{match.table}</span>
              <div><strong>{match.sideA} – {match.sideB}</strong><span className="muted">{match.phase} · {match.round}</span></div>
              <span className="muted">{match.status === 'READY' ? 'bereit' : 'wartet'}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
