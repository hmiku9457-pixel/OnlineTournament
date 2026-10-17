import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getMockPlayerSnapshot, getMockRuntimeMatches } from '@/services/mockRuntime';
import { getMockTournament } from '@/services/mockTournamentStore';

export function PlayerTournamentPage() {
  const { tournamentId } = useParams();
  const tournament = useMemo(() => getMockTournament(tournamentId), [tournamentId]);
  const snapshot = useMemo(() => getMockPlayerSnapshot(tournament), [tournament]);
  const matches = useMemo(() => getMockRuntimeMatches(tournament), [tournament]);
  const upcoming = matches.filter((match) => match.status === 'READY' || match.status === 'WAITING').slice(0, 3);

  return (
    <div className="player-view-shell">
      <header className="player-view-head">
        <div>
          <div className="control-kicker">Spieleransicht</div>
          <h1>{tournament.name}</h1>
          <p className="muted">{snapshot.player} · {snapshot.standing}</p>
        </div>
        <div className="actions">
          <Link className="btn" to={`/live/${tournament.id}`}>Live-Übersicht</Link>
          <Link className="btn" to={`/tournaments/${tournament.id}`}>Turnierinfo</Link>
        </div>
      </header>

      <section className="player-dashboard">
        <main className="player-dashboard-main">
          <article className="card player-primary-card">
            <span className={snapshot.currentMatch ? 'badge live' : 'badge ready'}>{snapshot.currentMatch ? 'DEIN SPIEL LÄUFT' : 'ALS NÄCHSTES'}</span>
            {snapshot.currentMatch ? (
              <>
                <div className="player-match-table">{snapshot.currentMatch.table}</div>
                <h2>{snapshot.currentMatch.sideA}</h2>
                <div className="player-score">{snapshot.currentMatch.score}</div>
                <h2>{snapshot.currentMatch.sideB}</h2>
                <p className="muted">{snapshot.currentMatch.phase} · {snapshot.currentMatch.round}</p>
                <Link className="btn primary player-primary-action" to={`/score/${snapshot.currentMatch.id}`}>Ergebnis / Sätze eintragen</Link>
              </>
            ) : snapshot.nextMatch ? (
              <>
                <div className="player-match-table">{snapshot.nextMatch.table}</div>
                <h2>{snapshot.nextMatch.sideA}</h2>
                <div className="player-versus">gegen</div>
                <h2>{snapshot.nextMatch.sideB}</h2>
                <p className="muted">{snapshot.nextMatch.note ?? 'Bitte rechtzeitig am Tisch bereit sein.'}</p>
              </>
            ) : <p>Aktuell ist kein weiteres Spiel geplant.</p>}
          </article>

          <article className="card">
            <div className="control-section-head"><h2>Deine nächsten Schritte</h2><span className="badge">Prototyp</span></div>
            <div className="player-step-list">
              <div><span>1</span><div><strong>Spielcode am Tisch</strong><p className="muted">Mit dem gemeinsamen Match-Code wird die Satzeingabe freigeschaltet.</p></div></div>
              <div><span>2</span><div><strong>Sätze live erfassen</strong><p className="muted">Nach jedem Satz kann der Zwischenstand gespeichert werden.</p></div></div>
              <div><span>3</span><div><strong>Ergebnis bestätigen</strong><p className="muted">Am Ende bestätigt jede Seite mit einem eigenen Spielercode.</p></div></div>
            </div>
          </article>

          <article className="card">
            <h2>Kommende Spiele</h2>
            <div className="player-upcoming-list">
              {upcoming.map((match) => (
                <div className="player-upcoming-row" key={match.id}>
                  <div><strong>{match.sideA} – {match.sideB}</strong><span className="muted">{match.phase} · {match.round}</span></div>
                  <span className={match.status === 'READY' ? 'badge ready' : 'badge'}>{match.table}</span>
                </div>
              ))}
            </div>
          </article>
        </main>

        <aside className="player-dashboard-side">
          <article className="card player-code-card">
            <span className="muted">Dein Spielercode</span>
            <strong>{snapshot.playerCode}</strong>
            <p className="muted">Diesen Code brauchst du nur zur abschließenden Ergebnisbestätigung.</p>
          </article>
          <article className="card player-code-card secondary">
            <span className="muted">Aktueller Match-Code</span>
            <strong>{snapshot.matchCode}</strong>
            <p className="muted">Der gemeinsame Match-Code kann am Tablet am Tisch eingegeben werden.</p>
          </article>
          <article className="card">
            <h3>Turnierstatus</h3>
            <div className="player-facts">
              <div><span className="muted">Dein Stand</span><strong>{snapshot.standing}</strong></div>
              <div><span className="muted">Turnierform</span><strong>{tournament.phasesLabel}</strong></div>
              <div><span className="muted">Tische</span><strong>{tournament.tables}</strong></div>
            </div>
          </article>
        </aside>
      </section>
    </div>
  );
}
