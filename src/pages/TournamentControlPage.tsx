import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { StageCard } from '@/components/StageCard';
import type { TournamentStatus } from '@/domain/types';
import { getMockRuntimeMatches, getRuntimeParticipantNames } from '@/services/mockRuntime';
import { getMockTournament, updateMockTournamentStatus } from '@/services/mockTournamentStore';

type ControlTab = 'overview' | 'matches' | 'participants' | 'stages' | 'tables';

const tabs: Array<{ id: ControlTab; label: string }> = [
  { id: 'overview', label: 'Übersicht' },
  { id: 'matches', label: 'Spiele' },
  { id: 'participants', label: 'Teilnehmer' },
  { id: 'stages', label: 'Phasen' },
  { id: 'tables', label: 'Tische' },
];

function statusLabel(status: TournamentStatus) {
  switch (status) {
    case 'READY': return 'Bereit';
    case 'RUNNING': return 'Läuft';
    case 'PAUSED': return 'Pausiert';
    case 'REGISTRATION': return 'Anmeldung';
    case 'FINISHED': return 'Beendet';
    default: return status;
  }
}

export function TournamentControlPage() {
  const { tournamentId } = useParams();
  const initialTournament = useMemo(() => getMockTournament(tournamentId), [tournamentId]);
  const [tournament, setTournament] = useState(initialTournament);
  const [tab, setTab] = useState<ControlTab>('overview');
  const matches = useMemo(() => getMockRuntimeMatches(tournament), [tournament]);
  const participants = useMemo(() => getRuntimeParticipantNames(tournament), [tournament]);
  const liveMatches = matches.filter((match) => match.status === 'LIVE' || match.status === 'CONFIRMATION');
  const nextMatches = matches.filter((match) => match.status === 'READY' || match.status === 'WAITING');

  function setStatus(status: TournamentStatus) {
    setTournament(updateMockTournamentStatus(tournament.id, status));
  }

  return (
    <>
      <header className="control-head">
        <div>
          <div className="control-kicker">Turnierleitung</div>
          <div className="tournament-page-status-row">
            <h1>{tournament.name}</h1>
            <span className={tournament.status === 'RUNNING' ? 'badge live' : 'badge'}>{statusLabel(tournament.status)}</span>
          </div>
          <p className="muted">{tournament.phasesLabel} · {tournament.participants} Teilnehmer · {tournament.tables} Tische</p>
        </div>
        <div className="actions no-print">
          <Link className="btn" to={`/tournaments/${tournament.id}`}>Turnierdetails</Link>
          <Link className="btn" to={`/player/${tournament.id}`}>Spieleransicht</Link>
          <Link className="btn" to={`/live/${tournament.id}`}>Zuschaueransicht</Link>
          {tournament.status === 'RUNNING' ? (
            <button className="btn" type="button" onClick={() => setStatus('PAUSED')}>Turnier pausieren</button>
          ) : (
            <button className="btn primary" type="button" onClick={() => setStatus('RUNNING')}>
              {tournament.status === 'PAUSED' ? 'Turnier fortsetzen' : 'Turnier starten'}
            </button>
          )}
        </div>
      </header>

      <nav className="control-tabs" aria-label="Turnierleitungsbereiche">
        {tabs.map((item) => (
          <button
            className={tab === item.id ? 'control-tab active' : 'control-tab'}
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {tab === 'overview' && (
        <section className="control-layout">
          <main className="control-main">
            <div className="control-section-head">
              <div><h2>Laufende Spiele</h2><p className="muted">Die Turnierleitung sieht zuerst, wo gerade etwas passiert.</p></div>
              <span className="badge live">{liveMatches.length} live</span>
            </div>
            <div className="live-match-grid">
              {liveMatches.length === 0 ? (
                <div className="card empty-state">Noch keine Spiele laufen. Starte das Turnier oder weise die ersten Spiele Tischen zu.</div>
              ) : liveMatches.map((match) => (
                <article className="card live-match-card" key={match.id}>
                  <div className="live-match-topline">
                    <span className="badge live">{match.status === 'CONFIRMATION' ? 'Bestätigung offen' : 'LIVE'}</span>
                    <strong>{match.table}</strong>
                  </div>
                  <span className="muted">{match.phase} · {match.round}</span>
                  <div className="live-match-score">
                    <span>{match.sideA}</span><strong>{match.score}</strong><span>{match.sideB}</span>
                  </div>
                  <div className="actions">
                    <Link className="btn small" to={`/score/${match.id}`}>Ergebnis</Link>
                    <button className="btn small" type="button">Tisch ändern</button>
                  </div>
                </article>
              ))}
            </div>

            <div className="control-section-head control-section-spaced">
              <div><h2>Nächste Spiele</h2><p className="muted">Bereite die nächsten Tische vor, ohne die komplette Spielplanansicht zu öffnen.</p></div>
            </div>
            <div className="match-queue">
              {nextMatches.map((match, index) => (
                <article className="match-queue-row" key={match.id}>
                  <span className="queue-position">{index + 1}</span>
                  <div className="match-queue-main">
                    <strong>{match.sideA} – {match.sideB}</strong>
                    <span className="muted">{match.phase} · {match.round}{match.note ? ` · ${match.note}` : ''}</span>
                  </div>
                  <span className={match.status === 'READY' ? 'badge ready' : 'badge'}>{match.table}</span>
                  <button className="btn small" type="button">{match.status === 'READY' ? 'Aufrufen' : 'Zuweisen'}</button>
                </article>
              ))}
            </div>
          </main>

          <aside className="control-side">
            <div className="card control-status-card">
              <h3>Turnierstatus</h3>
              <div className="control-metrics-grid">
                <div><span className="muted">Aktive Tische</span><strong>{Math.min(tournament.tables, liveMatches.length)}</strong></div>
                <div><span className="muted">Wartende Spiele</span><strong>{nextMatches.length}</strong></div>
                <div><span className="muted">Offene Bestätigungen</span><strong>{tournament.openConfirmations}</strong></div>
                <div><span className="muted">Restzeit grob</span><strong>{tournament.estimatedDuration}</strong></div>
              </div>
            </div>
            <div className="card control-alert-card">
              <div className="control-section-head"><h3>Hinweise</h3><span className="badge">Mock</span></div>
              <ul className="control-alert-list">
                <li><strong>Tisch 3</strong><span className="muted">seit 18 Min. belegt</span></li>
                <li><strong>1 Ergebnis</strong><span className="muted">wartet auf Spielerbestätigung</span></li>
                <li><strong>Nächste Phase</strong><span className="muted">wird nach Abschluss automatisch vorbereitet</span></li>
              </ul>
            </div>
          </aside>
        </section>
      )}

      {tab === 'matches' && (
        <section className="card control-tab-panel">
          <div className="control-section-head"><div><h2>Spiele</h2><p className="muted">Zentrale Liste für laufende, kommende und bestätigungsbedürftige Spiele.</p></div><button className="btn">Filter</button></div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Status</th><th>Phase</th><th>Spiel</th><th>Tisch</th><th>Stand</th><th></th></tr></thead>
              <tbody>
                {matches.map((match) => (
                  <tr key={match.id}>
                    <td><span className={match.status === 'LIVE' ? 'badge live' : match.status === 'READY' ? 'badge ready' : 'badge'}>{match.status}</span></td>
                    <td>{match.phase}<div className="muted">{match.round}</div></td>
                    <td><strong>{match.sideA}</strong><div>{match.sideB}</div></td>
                    <td>{match.table}</td>
                    <td>{match.score}</td>
                    <td><Link to={`/score/${match.id}`}>Öffnen</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === 'participants' && (
        <section className="card control-tab-panel">
          <div className="control-section-head"><div><h2>Teilnehmer</h2><p className="muted">Spielercodes und Status bleiben hier schnell erreichbar.</p></div><button className="btn">Teilnehmer bearbeiten</button></div>
          <div className="participant-control-list">
            {participants.map((participant, index) => (
              <article className="participant-control-row" key={`${participant}-${index}`}>
                <span className="participant-list-number">{index + 1}</span>
                <div><strong>{participant}</strong><span className="muted">{index % 7 === 0 ? 'spielt gerade' : 'aktiv'}</span></div>
                <code>{String(4100 + index).slice(-4)}</code>
                <button className="btn small">Öffnen</button>
              </article>
            ))}
          </div>
        </section>
      )}

      {tab === 'stages' && (
        <section className="control-tab-panel">
          <div className="control-section-head"><div><h2>Phasen</h2><p className="muted">Gruppen, Setzung und Bracket-Bearbeitung bauen wir als nächsten Designblock auf diese Ansicht.</p></div></div>
          <div className="grid">
            {tournament.stages.map((stage) => <div className="span-6" key={stage.id}><StageCard stage={stage} /></div>)}
          </div>
        </section>
      )}

      {tab === 'tables' && (
        <section className="control-tab-panel">
          <div className="control-section-head"><div><h2>Tische</h2><p className="muted">Schnelle Hallenansicht für freie, laufende und vorbereitete Tische.</p></div><button className="btn">Bereiche bearbeiten</button></div>
          <div className="table-status-grid">
            {Array.from({ length: tournament.tables }, (_, index) => {
              const live = liveMatches[index];
              const ready = nextMatches[index - liveMatches.length];
              return (
                <article className={`table-status-card ${live ? 'busy' : ready ? 'ready' : ''}`} key={index}>
                  <div className="table-status-top"><strong>Tisch {index + 1}</strong><span className={live ? 'badge live' : ready ? 'badge ready' : 'badge'}>{live ? 'läuft' : ready ? 'bereit' : 'frei'}</span></div>
                  {live ? <><strong>{live.sideA}</strong><span>{live.score}</span><strong>{live.sideB}</strong></> : ready ? <><strong>{ready.sideA}</strong><span className="muted">gegen</span><strong>{ready.sideB}</strong></> : <span className="muted">Kein Spiel zugewiesen</span>}
                </article>
              );
            })}
          </div>
        </section>
      )}
    </>
  );
}
