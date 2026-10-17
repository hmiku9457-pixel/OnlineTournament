import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { StageCard } from '@/components/StageCard';
import { PrestartDrawEditor } from '@/components/PrestartDrawEditor';
import { SetBySetEntry } from '@/components/SetBySetEntry';
import type { TournamentStage, TournamentStatus } from '@/domain/types';
import { buildMockBracket, buildMockGroups, buildSwissStandings } from '@/services/mockCompetitionViews';
import { assignMockMatchToTable, getMockAssignmentBlockReason, getMockRuntimeMatches, getRuntimeParticipantNames } from '@/services/mockRuntime';
import { getMockTournament, updateMockTournamentStatus } from '@/services/mockTournamentStore';
import { getActiveStage, getNextStartableStage, isStageCompleted, isStageEditable, isStageStarted, startFirstStage, startStage } from '@/services/mockPhaseLifecycle';

type ControlTab = 'overview' | 'flow' | 'matches' | 'participants' | 'stages';

const tabs: Array<{ id: ControlTab; label: string }> = [
  { id: 'overview', label: 'Übersicht' },
  { id: 'flow', label: 'Turnierverlauf' },
  { id: 'matches', label: 'Spiele' },
  { id: 'participants', label: 'Teilnehmer' },
  { id: 'stages', label: 'Phasen' },
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

function StageCompetitionView({ tournamentId, stage, tournament }: { tournamentId: string; stage: TournamentStage; tournament: ReturnType<typeof getMockTournament> }) {
  if (stage.type === 'GROUPS') {
    const groups = buildMockGroups(tournament, stage);
    return (
      <section className="competition-stage-section" id={`${tournamentId}-${stage.id}`}>
        <div className="competition-stage-head"><div><span className="badge">GRUPPEN</span><h3>{stage.name}</h3></div><span className="muted">{groups.length} Gruppen</span></div>
        <div className="group-overview-grid">
          {groups.map((group) => (
            <article className="card group-overview-card" key={group.id}>
              <h4>{group.label}</h4>
              <div className="mini-standing-table">
                <div className="mini-standing-head"><span>#</span><span>Spieler</span><span>Sp.</span><span>S</span><span>Sätze</span></div>
                {group.standings.map((row) => (
                  <div className="mini-standing-row" key={row.name}><span>{row.rank}</span><strong>{row.name}</strong><span>{row.played}</span><span>{row.wins}</span><span>{row.sets}</span></div>
                ))}
              </div>
              <div className="group-match-list">
                {group.matches.slice(0, 8).map((match, index) => (
                  <div className="group-match-row" key={`${match.sideA}-${match.sideB}-${index}`}>
                    <span>{match.sideA}</span><strong>{match.score}</strong><span>{match.sideB}</span>
                  </div>
                ))}
                {group.matches.length > 8 && <div className="muted group-more-games">+ {group.matches.length - 8} weitere Spiele</div>}
              </div>
            </article>
          ))}
        </div>
      </section>
    );
  }

  if (stage.type === 'SWISS') {
    const standings = buildSwissStandings(tournament, stage);
    return (
      <section className="competition-stage-section">
        <div className="competition-stage-head"><div><span className="badge">SCHWEIZER SYSTEM</span><h3>{stage.name}</h3></div><span className="muted">{Number(stage.settings.rounds) || 4} Runden</span></div>
        <div className="card table-wrap">
          <table className="compact-table">
            <thead><tr><th>#</th><th>Teilnehmer</th><th>Spiele</th><th>Siege</th><th>Niederlagen</th><th>Sätze</th></tr></thead>
            <tbody>{standings.map((row) => <tr key={row.name}><td>{row.rank}</td><td><strong>{row.name}</strong></td><td>{row.played}</td><td>{row.wins}</td><td>{row.losses}</td><td>{row.sets}</td></tr>)}</tbody>
          </table>
        </div>
      </section>
    );
  }

  if (stage.type === 'KNOCKOUT' || stage.type === 'DOUBLE_ELIMINATION' || stage.type === 'PLACEMENT') {
    const rounds = buildMockBracket(tournament, stage);
    return (
      <section className="competition-stage-section">
        <div className="competition-stage-head"><div><span className="badge">{stage.type === 'DOUBLE_ELIMINATION' ? 'DOPPEL-K.-O.' : 'K.-O.'}</span><h3>{stage.name}</h3></div></div>
        <div className="bracket-scroll">
          <div className="bracket-board">
            {rounds.map((round) => (
              <div className="bracket-round" key={round.label}>
                <h4>{round.label}</h4>
                <div className="bracket-round-matches">
                  {round.matches.map((match) => (
                    <article className="bracket-match" key={match.id}>
                      <div className={match.winner === match.sideA ? 'winner' : ''}><span>{match.sideA}</span><strong>{match.score && match.score !== 'Freilos' ? match.score.split(':')[0] : ''}</strong></div>
                      <div className={match.winner === match.sideB ? 'winner' : ''}><span>{match.sideB}</span><strong>{match.score && match.score !== 'Freilos' ? match.score.split(':')[1] : match.score === 'Freilos' ? 'BYE' : ''}</strong></div>
                    </article>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  return <StageCard stage={stage} />;
}

export function TournamentControlPage() {
  const { tournamentId } = useParams();
  const navigate = useNavigate();
  const initialTournament = useMemo(() => getMockTournament(tournamentId), [tournamentId]);
  const [tournament, setTournament] = useState(initialTournament);
  const [tab, setTab] = useState<ControlTab>('overview');
  const [runtimeVersion, setRuntimeVersion] = useState(0);
  const [drawVersion, setDrawVersion] = useState(0);
  const [phaseVersion, setPhaseVersion] = useState(0);
  const [participantPanel, setParticipantPanel] = useState<{ name: string; mode: 'edit' | 'games' } | null>(null);
  const [withdrawn, setWithdrawn] = useState<Set<string>>(new Set());
  const [assigningMatchId, setAssigningMatchId] = useState<string | null>(null);
  const [assignmentMessage, setAssignmentMessage] = useState<string | null>(null);
  const matches = useMemo(() => getMockRuntimeMatches(tournament), [tournament, runtimeVersion]);
  const participants = useMemo(() => getRuntimeParticipantNames(tournament), [tournament]);
  const nextMatches = matches.filter((match) => match.status === 'WAITING');
  const tableMatches = matches.filter((match) => ['LIVE', 'READY', 'CONFIRMATION'].includes(match.status) && match.table.startsWith('Tisch '));
  const matchesByTable = new Map(tableMatches.map((match) => [match.table, match]));
  const freeTables = Array.from({ length: tournament.tables }, (_, index) => `Tisch ${index + 1}`).filter((table) => !matchesByTable.has(table));
  const activeStage = useMemo(() => getActiveStage(tournament), [tournament, phaseVersion]);
  const nextStartableStage = useMemo(() => getNextStartableStage(tournament), [tournament, phaseVersion]);
  const editableStage = useMemo(() => tournament.stages.find((stage) => isStageEditable(tournament, stage)), [tournament, phaseVersion]);

  function setStatus(status: TournamentStatus) {
    setTournament(updateMockTournamentStatus(tournament.id, status));
  }

  function refreshRuntime() {
    setTournament(getMockTournament(tournament.id));
    setRuntimeVersion((value) => value + 1);
    setPhaseVersion((value) => value + 1);
  }

  function startTournament() {
    const firstStage = tournament.stages[0];
    if (!firstStage) return;
    const confirmed = window.confirm(`Turnier jetzt starten? Die Konfiguration von „${firstStage.name}“ wird damit eingefroren.`);
    if (!confirmed) return;
    if (!startFirstStage(tournament)) return;
    setPhaseVersion((value) => value + 1);
    setStatus('RUNNING');
    refreshRuntime();
  }

  function startNextPhase() {
    if (!nextStartableStage) return;
    const confirmed = window.confirm(`„${nextStartableStage.name}“ jetzt starten? Die aktuelle Zuordnung/Setzung wird damit eingefroren.`);
    if (!confirmed || !startStage(tournament, nextStartableStage)) return;
    setPhaseVersion((value) => value + 1);
    setStatus('RUNNING');
    refreshRuntime();
    setTab('overview');
  }

  function assignToTable(matchId: string, table: string) {
    const blockReason = getMockAssignmentBlockReason(tournament, matchId, table);
    if (blockReason) {
      setAssignmentMessage(blockReason);
      return false;
    }
    if (!assignMockMatchToTable(tournament, matchId, table)) return false;
    setAssignmentMessage(null);
    setAssigningMatchId(null);
    refreshRuntime();
    return true;
  }

  function autoAssignMatch(matchId: string) {
    for (const table of freeTables) {
      if (assignToTable(matchId, table)) return;
    }

    const firstReason = freeTables
      .map((table) => getMockAssignmentBlockReason(tournament, matchId, table))
      .find((reason) => reason);
    setAssignmentMessage(firstReason ?? 'Aktuell ist kein geeigneter Tisch frei.');
  }

  function autoAssignWaitingMatches() {
    const waitingMatches = nextMatches.filter((match) => match.status === 'WAITING');
    let assigned = 0;

    for (const match of waitingMatches) {
      const currentMatches = getMockRuntimeMatches(tournament);
      const currentOccupied = new Set(
        currentMatches
          .filter((item) => ['LIVE', 'READY', 'CONFIRMATION'].includes(item.status) && item.table.startsWith('Tisch '))
          .map((item) => item.table),
      );
      const availableTables = Array.from({ length: tournament.tables }, (_, index) => `Tisch ${index + 1}`)
        .filter((table) => !currentOccupied.has(table));

      const targetTable = availableTables.find((table) => !getMockAssignmentBlockReason(tournament, match.id, table));
      if (targetTable && assignMockMatchToTable(tournament, match.id, targetTable)) assigned += 1;
    }

    setAssignmentMessage(assigned > 0 ? `${assigned} Spiel${assigned === 1 ? '' : 'e'} automatisch zugewiesen und gestartet.` : 'Aktuell konnte kein wartendes Spiel konfliktfrei zugewiesen werden.');
    setAssigningMatchId(null);
    refreshRuntime();
  }

  return (
    <>
      <header className="control-head">
        <div>
          <button className="btn small control-back-button" type="button" onClick={() => navigate(-1)}>← Zurück</button>
          <div className="control-kicker">Turnierleitung</div>
          <div className="tournament-page-status-row">
            <h1>{tournament.name}</h1>
            <span className={tournament.status === 'RUNNING' ? 'badge live' : 'badge'}>{statusLabel(tournament.status)}</span>
          </div>
          <p className="muted">{tournament.phasesLabel} · {tournament.participants} Teilnehmer · {tournament.tables} Tische</p>
        </div>
        <div className="actions no-print">
          <Link className="btn" to={`/player/${tournament.id}`}>Spieleransicht</Link>
          <Link className="btn" to={`/live/${tournament.id}`}>Zuschaueransicht</Link>
          {editableStage && ['GROUPS', 'KNOCKOUT', 'DOUBLE_ELIMINATION'].includes(editableStage.type) && (
            <button className="btn" type="button" onClick={() => setTab('flow')}>Aktuelle Phase bearbeiten</button>
          )}
          {!tournament.hasStarted && tournament.status !== 'FINISHED' && (
            <button className="btn primary" type="button" onClick={startTournament}>Turnier starten</button>
          )}
          {tournament.hasStarted && activeStage && tournament.status !== 'FINISHED' && (
            <>
              {tournament.status === 'RUNNING' ? (
                <button className="btn" type="button" onClick={() => setStatus('PAUSED')}>Turnier pausieren</button>
              ) : (
                <button className="btn" type="button" onClick={() => setStatus('RUNNING')}>Turnier fortsetzen</button>
              )}
            </>
          )}
          {tournament.hasStarted && !activeStage && nextStartableStage && tournament.status !== 'FINISHED' && (
            <button className="btn primary" type="button" onClick={startNextPhase}>Nächste Phase starten</button>
          )}
        </div>
      </header>

      <nav className="control-tabs" aria-label="Turnierleitungsbereiche">
        {tabs.map((item) => (
          <button className={tab === item.id ? 'control-tab active' : 'control-tab'} key={item.id} type="button" onClick={() => setTab(item.id)}>{item.label}</button>
        ))}
      </nav>

      {tab === 'overview' && (
        <section className="control-overview-stack">
          <div>
            <div className="control-section-head control-table-section-head">
              <div>
                <h2>Tische</h2>
                <p className="muted">Alle Spielorte auf einen Blick – auch freie Tische bleiben sichtbar.</p>
              </div>
              <div className="control-table-head-actions">
                <span className="badge live">{tableMatches.length} laufend</span>
                <button
                  className="btn small primary"
                  type="button"
                  disabled={freeTables.length === 0 || !nextMatches.some((match) => match.status === 'WAITING')}
                  onClick={autoAssignWaitingMatches}
                >
                  Automatisch zuweisen
                </button>
              </div>
            </div>
            {assignmentMessage && <div className="assignment-message" role="status">{assignmentMessage}</div>}
            <div className="overview-table-grid">
              {Array.from({ length: tournament.tables }, (_, index) => {
                const tableName = `Tisch ${index + 1}`;
                const match = matchesByTable.get(tableName);
                const isLive = match?.status === 'LIVE' || match?.status === 'CONFIRMATION' || match?.status === 'READY';
                return (
                  <article
                    className={match ? 'card overview-table-card busy' : 'card overview-table-card table-drop-target'}
                    key={tableName}
                    onDragOver={(event) => { if (!match) event.preventDefault(); }}
                    onDrop={(event) => {
                      if (match) return;
                      event.preventDefault();
                      const matchId = event.dataTransfer.getData('text/mock-match-id');
                      if (matchId) assignToTable(matchId, tableName);
                    }}
                  >
                    <div className="table-status-top">
                      <strong>{tableName}</strong>
                      <span className={isLive ? 'badge live' : 'badge'}>{isLive ? 'läuft' : 'frei'}</span>
                    </div>
                    {match ? (
                      <>
                        <span className="muted">{match.phase} · {match.round} · BO{match.bestOf}</span>
                        <SetBySetEntry match={match} onSaved={refreshRuntime} compact />
                      </>
                    ) : (
                      <div className="free-table-message">
                        <strong>Frei für die nächste Partie</strong>
                        <span>Spiel hierher ziehen oder über „Zuweisen“ auswählen.</span>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </div>

          <div className="control-overview-columns">
            <main>
              <div className="control-section-head control-section-spaced"><div><h2>Nächste Spiele</h2><p className="muted">Pausenzeit zeigt, wie lange jeder Teilnehmer seit seinem letzten Spiel frei hat.</p></div></div>
              <div className="match-queue">
                {nextMatches.map((match, index) => (
                  <article
                    className="match-queue-row expanded draggable-match"
                    key={match.id}
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.setData('text/mock-match-id', match.id);
                      event.dataTransfer.effectAllowed = 'move';
                    }}
                  >
                    <span className="queue-position">{index + 1}</span>
                    <div className="match-queue-main">
                      <strong>{match.sideA} <em className="pause-time">{match.pauseA} Min. Pause</em></strong>
                      <strong>{match.sideB} <em className="pause-time">{match.pauseB} Min. Pause</em></strong>
                      <span className="muted">{match.phase} · {match.round}{match.note ? ` · ${match.note}` : ''}</span>
                      {assigningMatchId === match.id && (
                        <div className="table-assignment-picker">
                          {freeTables.length === 0 ? (
                            <span className="muted">Aktuell ist kein Tisch frei.</span>
                          ) : freeTables.map((table) => (
                            <button className="btn small" type="button" key={table} onClick={() => assignToTable(match.id, table)}>{table}</button>
                          ))}
                        </div>
                      )}
                    </div>
                    <span className="badge">{match.table}</span>
                    <div className="queue-row-actions">
                      <>
                        <button className="btn small primary" type="button" disabled={freeTables.length === 0} onClick={() => autoAssignMatch(match.id)}>Automatisch zuweisen</button>
                        <button className="btn small" type="button" onClick={() => setAssigningMatchId((current) => current === match.id ? null : match.id)}>Zuweisen</button>
                      </>
                    </div>
                  </article>
                ))}
              </div>
            </main>
            <aside className="control-side">
              <div className="card control-status-card">
                <h3>Turnierstatus</h3>
                <div className="control-metrics-grid">
                  <div><span className="muted">Laufende Tische</span><strong>{tableMatches.length}/{tournament.tables}</strong></div>
                  <div><span className="muted">Wartende Spiele</span><strong>{nextMatches.length}</strong></div>
                  <div><span className="muted">Offene Bestätigungen</span><strong>{tournament.openConfirmations}</strong></div>
                  <div><span className="muted">Restzeit grob</span><strong>{tournament.estimatedDuration}</strong></div>
                </div>
              </div>
              <div className="card control-alert-card">
                <div className="control-section-head"><h3>Schnellzugriff</h3><span className="badge">Mock</span></div>
                <button className="btn" type="button" onClick={() => setTab('flow')}>Tabellen & Turnierbaum</button>
                <button className="btn" type="button" onClick={() => setTab('participants')}>Teilnehmer verwalten</button>
                <button className="btn" type="button" onClick={() => setTab('matches')}>Alle Spiele</button>
              </div>
            </aside>
          </div>
        </section>
      )}

      {tab === 'flow' && (
        <section className="control-tab-panel competition-flow-page" data-draw-version={drawVersion} data-phase-version={phaseVersion}>
          <div className="control-section-head">
            <div>
              <h2>Turnierverlauf</h2>
              <p className="muted">Eine Phase endet automatisch mit dem letzten abgeschlossenen Spiel. Danach wird die nächste Phase bearbeitbar; mit ihrem Start wird die Auslosung eingefroren.</p>
            </div>
            {nextStartableStage && !activeStage && tournament.hasStarted && (
              <button className="btn primary" type="button" onClick={startNextPhase}>Nächste Phase starten</button>
            )}
          </div>
          <div className="phase-lifecycle-strip">
            {tournament.stages.map((stage, index) => {
              const completed = isStageCompleted(tournament, stage);
              const started = isStageStarted(tournament, stage);
              const editable = isStageEditable(tournament, stage);
              const state = completed ? 'Beendet' : started ? 'Läuft' : editable ? 'Bearbeitbar' : 'Gesperrt';
              return (
                <div className={`phase-lifecycle-item ${state.toLowerCase()}`} key={stage.id}>
                  <span>Phase {index + 1}</span>
                  <strong>{stage.name}</strong>
                  <span className="badge">{state}</span>
                </div>
              );
            })}
          </div>
          {tournament.stages.map((stage) => (
            <div className="prestart-stage-block" key={stage.id}>
              <PrestartDrawEditor
                tournament={tournament}
                stage={stage}
                onChanged={() => setDrawVersion((value) => value + 1)}
              />
              <StageCompetitionView tournamentId={tournament.id} tournament={tournament} stage={stage} />
            </div>
          ))}
        </section>
      )}

      {tab === 'matches' && (
        <section className="card control-tab-panel">
          <div className="control-section-head"><div><h2>Alle Spiele</h2><p className="muted">Zentrale Liste für laufende und kommende Partien.</p></div></div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Status</th><th>Phase</th><th>Spiel</th><th>Pausenzeit</th><th>Tisch</th><th>Stand</th><th></th></tr></thead>
              <tbody>{matches.map((match) => (
                <tr key={match.id}>
                  <td><span className={match.status === 'LIVE' ? 'badge live' : match.status === 'READY' ? 'badge ready' : 'badge'}>{match.status}</span></td>
                  <td>{match.phase}<div className="muted">{match.round}</div></td>
                  <td><strong>{match.sideA}</strong><div>{match.sideB}</div></td>
                  <td>{match.pauseA} / {match.pauseB} Min.</td>
                  <td>{match.table}</td><td>{match.score}</td>
                  <td><Link to={`/score/${match.id}`}>Ergebnis</Link></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </section>
      )}

      {tab === 'participants' && (
        <section className="card control-tab-panel">
          <div className="control-section-head"><div><h2>Teilnehmer</h2><p className="muted">Spielercodes, Daten, Spiele und Rückzug an einer Stelle.</p></div></div>
          <div className="participant-control-list">
            {participants.map((participant, index) => {
              const isWithdrawn = withdrawn.has(participant);
              return (
                <article className={isWithdrawn ? 'participant-control-row withdrawn' : 'participant-control-row'} key={`${participant}-${index}`}>
                  <span className="participant-list-number">{index + 1}</span>
                  <div><strong>{participant}</strong><span className="muted">{isWithdrawn ? 'zurückgezogen' : index % 7 === 0 ? 'spielt gerade' : 'aktiv'}</span></div>
                  <code>{String(4100 + index).slice(-4)}</code>
                  <div className="participant-row-actions">
                    <button className="btn small" type="button" onClick={() => setParticipantPanel({ name: participant, mode: 'edit' })}>Daten bearbeiten</button>
                    <button className="btn small" type="button" onClick={() => setParticipantPanel({ name: participant, mode: 'games' })}>Spielübersicht</button>
                    <button className="btn small danger-outline" type="button" disabled={isWithdrawn} onClick={() => setWithdrawn((current) => new Set([...current, participant]))}>Zurückziehen</button>
                  </div>
                  {participantPanel?.name === participant && (
                    <div className="participant-inline-panel">
                      {participantPanel.mode === 'edit' ? (
                        <>
                          <div className="field participant-edit-field"><label>Anzeigename</label><input defaultValue={participant} /></div>
                          <div className="field participant-edit-field"><label>Spielercode</label><input defaultValue={String(4100 + index).slice(-4)} /></div>
                          <button className="btn small primary" type="button" onClick={() => setParticipantPanel(null)}>Änderungen übernehmen</button>
                        </>
                      ) : (
                        <>
                          <strong>Spielübersicht</strong>
                          <span className="muted">3 Spiele absolviert · 2 Siege · 1 Niederlage · nächstes Spiel laut Warteschlange.</span>
                          <button className="btn small" type="button" onClick={() => setTab('matches')}>Zu allen Spielen</button>
                        </>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      )}

      {tab === 'stages' && (
        <section className="control-tab-panel">
          <div className="control-section-head"><div><h2>Phasen</h2><p className="muted">Konfiguration der Phasen; Gruppenzuordnung und Setzung bearbeiten wir anschließend separat.</p></div></div>
          <div className="grid">{tournament.stages.map((stage) => <div className="span-6" key={stage.id}><StageCard stage={stage} /></div>)}</div>
        </section>
      )}
    </>
  );
}
