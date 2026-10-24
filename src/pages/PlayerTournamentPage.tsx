import { useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { getMockPlayerSnapshot, getMockRuntimeMatches } from '@/services/mockRuntime';
import { getActiveSwissRecordLookup } from '@/services/activeSwissRecords';
import { getMockTournament } from '@/services/mockTournamentStore';
import { displayVenueMessage, getVenueTerminology } from '@/domain/venueTerminology';

export function PlayerTournamentPage() {
  const { tournamentId } = useParams();
  const navigate = useNavigate();
  const tournament = useMemo(() => getMockTournament(tournamentId), [tournamentId]);
  const venue = getVenueTerminology(tournament.sport);
  const venueName = (name: string) => displayVenueMessage(tournament.sport, name);
  const snapshot = useMemo(() => getMockPlayerSnapshot(tournament), [tournament]);
  const matches = useMemo(() => getMockRuntimeMatches(tournament), [tournament]);
  const upcoming = matches.filter((match) => match.status === 'READY' || match.status === 'WAITING').slice(0, 3);
  const swissRecordFor = getActiveSwissRecordLookup(tournament);

  return (
    <div className="player-view-shell">
      <header className="player-view-head">
        <div>
          <button className="btn small" type="button" onClick={() => navigate(-1)}>← Zurück</button>
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
                <div className="player-match-table">{venueName(snapshot.currentMatch.table)}</div>
                <h2>{snapshot.currentMatch.sideA}{swissRecordFor(snapshot.currentMatch, snapshot.currentMatch.sideA) && <span className="swiss-record">{swissRecordFor(snapshot.currentMatch, snapshot.currentMatch.sideA)}</span>}</h2>
                <div className="player-score">{snapshot.currentMatch.score}</div>
                <h2>{snapshot.currentMatch.sideB}{swissRecordFor(snapshot.currentMatch, snapshot.currentMatch.sideB) && <span className="swiss-record">{swissRecordFor(snapshot.currentMatch, snapshot.currentMatch.sideB)}</span>}</h2>
                <p className="muted">{snapshot.currentMatch.phase} · {snapshot.currentMatch.round}</p>
                <Link className="btn primary player-primary-action" to={`/score/${snapshot.currentMatch.id}`}>Ergebnis / Sätze eintragen</Link>
              </>
            ) : snapshot.nextMatch ? (
              <>
                <div className="player-match-table">{venueName(snapshot.nextMatch.table)}</div>
                <h2>{snapshot.nextMatch.sideA}{swissRecordFor(snapshot.nextMatch, snapshot.nextMatch.sideA) && <span className="swiss-record">{swissRecordFor(snapshot.nextMatch, snapshot.nextMatch.sideA)}</span>}</h2>
                <div className="player-versus">gegen</div>
                <h2>{snapshot.nextMatch.sideB}{swissRecordFor(snapshot.nextMatch, snapshot.nextMatch.sideB) && <span className="swiss-record">{swissRecordFor(snapshot.nextMatch, snapshot.nextMatch.sideB)}</span>}</h2>
                <p className="muted">{snapshot.nextMatch.note ? venueName(snapshot.nextMatch.note) : 'Bitte rechtzeitig am Spielort bereit sein.'}</p>
              </>
            ) : <p>Aktuell ist kein weiteres Spiel geplant.</p>}
          </article>

          <article className="card">
            <div className="control-section-head"><h2>Deine nächsten Schritte</h2><span className="badge">Prototyp</span></div>
            <div className="player-step-list">
              <div><span>1</span><div><strong>Spielcode am Spielort</strong><p className="muted">Mit dem gemeinsamen Match-Code wird die Satzeingabe freigeschaltet.</p></div></div>
              <div><span>2</span><div><strong>Sätze erfassen</strong><p className="muted">Die Sätze werden möglichst kurz eingegeben, z. B. 7 für 11:7 oder -7 für 7:11.</p></div></div>
              <div><span>3</span><div><strong>Ergebnis bestätigen</strong><p className="muted">Am Ende bestätigt jede Seite mit einem eigenen Spielercode.</p></div></div>
            </div>
          </article>

          <article className="card">
            <h2>Kommende Spiele</h2>
            <div className="player-upcoming-list">
              {upcoming.map((match) => (
                <div className="player-upcoming-row" key={match.id}>
                  <div><strong>{match.sideA}{swissRecordFor(match, match.sideA) && <span className="swiss-record">{swissRecordFor(match, match.sideA)}</span>} – {match.sideB}{swissRecordFor(match, match.sideB) && <span className="swiss-record">{swissRecordFor(match, match.sideB)}</span>}</strong><span className="muted">{match.phase} · {match.round}</span></div>
                  <span className={match.status === 'READY' ? 'badge ready' : 'badge'}>{venueName(match.table)}</span>
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
            <p className="muted">Der gemeinsame Match-Code kann am Tablet am Spielort eingegeben werden.</p>
          </article>
          <article className="card">
            <h3>Turnierstatus</h3>
            <div className="player-facts">
              <div><span className="muted">Dein Stand</span><strong>{snapshot.standing}</strong></div>
              <div><span className="muted">Turnierform</span><strong>{tournament.phasesLabel}</strong></div>
              <div><span className="muted">{venue.plural}</span><strong>{tournament.tables}</strong></div>
            </div>
          </article>
        </aside>
      </section>
    </div>
  );
}
