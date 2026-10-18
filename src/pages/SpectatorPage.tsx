import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { buildMockBracket, buildMockGroups, buildSwissStandings, getPreviousStageFinishLabels } from '@/services/mockCompetitionViews';
import { getMockRuntimeMatches, getMockStageMatches, isMockParticipantWithdrawn } from '@/services/mockRuntime';
import { MatchResultDetails } from '@/components/MatchResultDetails';
import { resultForParticipant } from '@/services/matchPresentation';
import { getMockTournament } from '@/services/mockTournamentStore';
import { getActiveStage } from '@/services/mockPhaseLifecycle';


export function SpectatorPage() {
  const { tournamentId } = useParams();
  const navigate = useNavigate();
  const [selectedSwiss, setSelectedSwiss] = useState<{ name: string; stageId: string } | null>(null);
  const tournament = useMemo(() => getMockTournament(tournamentId), [tournamentId]);
  const matches = useMemo(() => getMockRuntimeMatches(tournament), [tournament]);
  const live = matches.filter((match) => match.status === 'LIVE' || match.status === 'CONFIRMATION');
  const next = matches.filter((match) => match.status === 'READY' || match.status === 'WAITING');
  const activeStage = getActiveStage(tournament);
  const swissRecords = activeStage?.type === 'SWISS'
    ? new Map(buildSwissStandings(tournament, activeStage).map((row) => [row.name, `${row.wins}:${row.losses}`]))
    : new Map<string, string>();

  return (
    <div className="spectator-shell">
      <header className="page-head spectator-head">
        <div>
          <button className="btn small" type="button" onClick={() => navigate(-1)}>← Zurück</button>
          <div className="control-kicker spectator-kicker">Zuschaueransicht</div>
          <h1>{tournament.name}</h1>
          <p className="muted">{tournament.phasesLabel} · {tournament.participants} Teilnehmer</p>
        </div>
        <div className="actions">
          <span className="badge live">● LIVE</span>
          <Link className="btn" to={`/tournaments/${tournament.id}`}>Turnierinfo</Link>
        </div>
      </header>

      <section className="spectator-section">
        <div className="spectator-section-head"><h2>Live auf den Tischen</h2><span className="muted">{live.length} laufende Spiele</span></div>
        <div className="spectator-live-grid">
          {live.length === 0 ? (
            <div className="card empty-state">Aktuell laufen keine Spiele.</div>
          ) : live.map((match) => (
            <article className="card spectator-match-card" key={match.id}>
              <div className="spectator-match-head"><span className="badge live">LIVE</span><strong>{match.table}</strong></div>
              <span className="muted">{match.round}</span>
              <div className="spectator-team">{match.sideA}{swissRecords.get(match.sideA) && <span className="swiss-record">{swissRecords.get(match.sideA)}</span>}</div>
              <div className="spectator-score">{match.score}</div>
              <div className="spectator-team">{match.sideB}{swissRecords.get(match.sideB) && <span className="swiss-record">{swissRecords.get(match.sideB)}</span>}</div>
            </article>
          ))}
        </div>
      </section>

      <section className="spectator-competition-overview">
        <div className="spectator-section-head"><h2>Turnierstand</h2><span className="muted">Tabellen & Turnierbäume</span></div>
        {tournament.stages.map((stage) => {
          const previousFinishLabels = getPreviousStageFinishLabels(tournament, stage);
          if (stage.type === 'GROUPS') {
            const groups = buildMockGroups(tournament, stage);
            return (
              <section className="spectator-stage-block" key={stage.id}>
                <div className="competition-stage-head"><div><span className="badge">GRUPPEN</span><h3>{stage.name}</h3></div></div>
                <div className="spectator-group-grid">
                  {groups.map((group) => (
                    <article className="card spectator-standing-card" key={group.id}>
                      <h4>{group.label}</h4>
                      <div className="mini-standing-table detailed">
                        <div className="mini-standing-head"><span>#</span><span>Spieler</span><span>Sp.</span><span>S</span><span>N</span><span>Sätze</span><span>±</span><span>Bälle</span><span>±</span></div>
                        {group.standings.map((row) => <div className="mini-standing-row" key={row.name}><span>{row.rank}</span><strong>{row.name}{previousFinishLabels[row.name] && <small className="participant-origin">{previousFinishLabels[row.name]}</small>}</strong><span>{row.played}</span><span>{row.wins}</span><span>{row.losses}</span><span>{row.sets}</span><span>{row.setDifference > 0 ? `+${row.setDifference}` : row.setDifference}</span><span>{row.balls}</span><span>{row.ballDifference > 0 ? `+${row.ballDifference}` : row.ballDifference}</span></div>)}
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
              <section className="spectator-stage-block" key={stage.id}>
                <div className="competition-stage-head"><div><span className="badge">SCHWEIZER SYSTEM</span><h3>{stage.name}</h3></div></div>
                <div className="card table-wrap"><table className="compact-table"><thead><tr><th>#</th><th>Teilnehmer</th><th>Sp.</th><th>Siege</th><th>N.</th><th>Sätze</th><th>Satz ±</th><th>Bälle</th><th>Ball ±</th></tr></thead><tbody>{standings.map((row) => <tr key={row.name}><td>{row.rank}</td><td><button type="button" className="standing-player-button" onClick={() => setSelectedSwiss({ name: row.name, stageId: stage.id })}><strong>{row.name}</strong></button> <span className="swiss-record">{row.wins}:{row.losses}</span>{previousFinishLabels[row.name] && <small className="participant-origin">{previousFinishLabels[row.name]}</small>}</td><td>{row.played}</td><td>{row.wins}</td><td>{row.losses}</td><td>{row.sets}</td><td>{row.setDifference > 0 ? `+${row.setDifference}` : row.setDifference}</td><td>{row.balls}</td><td>{row.ballDifference > 0 ? `+${row.ballDifference}` : row.ballDifference}</td></tr>)}</tbody></table></div>
              </section>
            );
          }

          if (stage.type === 'KNOCKOUT' || stage.type === 'DOUBLE_ELIMINATION' || stage.type === 'PLACEMENT') {
            const rounds = buildMockBracket(tournament, stage);
            return (
              <section className="spectator-stage-block" key={stage.id}>
                <div className="competition-stage-head"><div><span className="badge">K.-O.</span><h3>{stage.name}</h3></div></div>
                <div className="bracket-scroll"><div className="bracket-board">{rounds.map((round) => <div className="bracket-round" key={round.label}><h4>{round.label}</h4><div className="bracket-round-matches">{round.matches.map((match) => <article className="bracket-match" key={match.id}>{match.score === 'W.O.' && <span className="bracket-walkover-label" title="Kampflos entschiedene Partie (Walkover, z. B. bei Rückzug)">Kampflos</span>}<div className={match.winner === match.sideA ? 'winner' : ''}><span>{match.score === 'W.O.' && isMockParticipantWithdrawn(tournament, match.sideA) ? `Rückzug (${match.sideA})` : match.sideA}{previousFinishLabels[match.sideA] && <small className="participant-origin">{previousFinishLabels[match.sideA]}</small>}</span><span className="bracket-score-cells">{(match.sets ?? []).map((set, index) => <span key={index}>{set.sideAScore}</span>)}<strong>{match.score === 'W.O.' ? (match.winner === match.sideA ? '✓' : '–') : match.score && match.score !== 'Freilos' ? match.score.split(':')[0] : ''}</strong></span></div><div className={match.winner === match.sideB ? 'winner' : ''}><span>{match.score === 'W.O.' && isMockParticipantWithdrawn(tournament, match.sideB) ? `Rückzug (${match.sideB})` : match.sideB}{previousFinishLabels[match.sideB] && <small className="participant-origin">{previousFinishLabels[match.sideB]}</small>}</span><span className="bracket-score-cells">{(match.sets ?? []).map((set, index) => <span key={index}>{set.sideBScore}</span>)}<strong>{match.score === 'W.O.' ? (match.winner === match.sideB ? '✓' : '–') : match.score && match.score !== 'Freilos' ? match.score.split(':')[1] : match.score === 'Freilos' ? 'BYE' : ''}</strong></span></div></article>)}</div></div>)}</div></div>
              </section>
            );
          }

          return null;
        })}
      </section>

      {selectedSwiss && (() => {
        const stage = tournament.stages.find((item) => item.id === selectedSwiss.stageId);
        if (!stage) return null;
        const ownMatches = getMockStageMatches(tournament, stage).filter((match) => match.sideA === selectedSwiss.name || match.sideB === selectedSwiss.name);
        return <div className="prototype-modal-backdrop" role="presentation" onMouseDown={() => setSelectedSwiss(null)}>
          <section className="prototype-modal player-games-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            <div className="player-games-modal-head"><h2>{selectedSwiss.name} · Partien</h2><button className="btn small" type="button" onClick={() => setSelectedSwiss(null)}>Schließen</button></div>
            <div className="player-games-list">{ownMatches.map((match) => <div className="player-game-row" key={match.id}>
              <span className="muted">{match.round}</span>
              <strong>vs. {match.sideA === selectedSwiss.name ? match.sideB : match.sideA}</strong>
              <MatchResultDetails {...resultForParticipant(match.status === 'FINISHED' ? match.score : '–', match.sets, match.sideB === selectedSwiss.name)} />
            </div>)}</div>
          </section>
        </div>;
      })()}

      <section className="card spectator-next-card">
        <div className="control-section-head"><div><h2>Nächste Spiele</h2><p className="muted">Tisch- und Warteschlangenübersicht.</p></div></div>
        <div className="spectator-next-list">
          {next.map((match) => (
            <div className="spectator-next-row" key={match.id}>
              <span className={match.status === 'READY' ? 'badge ready' : 'badge'}>{match.table}</span>
              <div><strong>{match.sideA}{swissRecords.get(match.sideA) && <span className="swiss-record">{swissRecords.get(match.sideA)}</span>} – {match.sideB}{swissRecords.get(match.sideB) && <span className="swiss-record">{swissRecords.get(match.sideB)}</span>}</strong><span className="muted">{match.phase} · {match.round}</span></div>
              <span className="muted">{match.status === 'READY' ? 'bereit' : 'wartet'}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
