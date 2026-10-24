import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { buildMockBracket, buildMockGroups, buildSwissStandings, getPreviousStageFinishLabels } from '@/services/mockCompetitionViews';
import { getMockRuntimeMatches, getMockStageMatches, isMockParticipantWithdrawn, getSwissRecordBeforeRound, getSwissCurrentRecord } from '@/services/mockRuntime';
import { MatchResultDetails } from '@/components/MatchResultDetails';
import { PlayerGameOutcome } from '@/components/PlayerGameOutcome';
import { resultForMatchParticipant } from '@/services/matchPresentation';
import { getMockTournament } from '@/services/mockTournamentStore';
import { displayVenueMessage, getVenueTerminology } from '@/domain/venueTerminology';
import { getActiveSwissRecordLookup } from '@/services/activeSwissRecords';
import { sportScoring } from '@/domain/sportScoring';


export function SpectatorPage() {
  const { tournamentId } = useParams();
  const navigate = useNavigate();
  const [selectedSwiss, setSelectedSwiss] = useState<{ name: string; stageId: string } | null>(null);
  const tournament = useMemo(() => getMockTournament(tournamentId), [tournamentId]);
  const venue = getVenueTerminology(tournament.sport);
  const scoreSport = sportScoring(tournament.sport).mode === 'score';
  const scoreUnit = sportScoring(tournament.sport).plural;
  const venueName = (name: string) => displayVenueMessage(tournament.sport, name);
  const matches = useMemo(() => getMockRuntimeMatches(tournament), [tournament]);
  const live = matches.filter((match) => match.status === 'LIVE' || match.status === 'CONFIRMATION');
  const next = matches.filter((match) => match.status === 'READY' || match.status === 'WAITING');
  const swissRecordFor = getActiveSwissRecordLookup(tournament);

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
        <div className="spectator-section-head"><h2>Live auf den {venue.dativePlural}</h2><span className="muted">{live.length} laufende Spiele</span></div>
        <div className="spectator-live-grid">
          {live.length === 0 ? (
            <div className="card empty-state">Aktuell laufen keine Spiele.</div>
          ) : live.map((match) => (
            <article className="card spectator-match-card" key={match.id}>
              <div className="spectator-match-head"><span className="badge live">LIVE</span><strong>{venueName(match.table)}</strong></div>
              <span className="muted">{match.round}</span>
              <div className="spectator-team">{match.sideA}{swissRecordFor(match, match.sideA) && <span className="swiss-record">{swissRecordFor(match, match.sideA)}</span>}</div>
              <div className="spectator-score">{match.score}</div>
              <div className="spectator-team">{match.sideB}{swissRecordFor(match, match.sideB) && <span className="swiss-record">{swissRecordFor(match, match.sideB)}</span>}</div>
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
                      <div className={scoreSport ? 'mini-standing-table detailed score-standing-table' : 'mini-standing-table detailed'}>
                        <div className="mini-standing-head"><span>#</span><span>Spieler</span><span>Sp.</span><span>S</span><span>{scoreSport ? 'U' : 'N'}</span><span>{scoreSport ? 'N' : 'Sätze'}</span><span>{scoreSport ? scoreUnit : '±'}</span><span>{scoreSport ? '±' : 'Bälle'}</span><span>{scoreSport ? 'Pkt.' : '±'}</span></div>
                        {group.standings.map((row) => <div className="mini-standing-row" key={row.name}><span>{row.rank}</span><strong>{row.name}{isMockParticipantWithdrawn(tournament, row.name) && <span className="standing-withdrawn" title="Teilnehmer zurückgezogen">Zurückgezogen</span>}{previousFinishLabels[row.name] && <small className="participant-origin">{previousFinishLabels[row.name]}</small>}</strong><span>{row.played}</span><span>{row.wins}</span><span>{scoreSport ? row.draws : row.losses}</span>{scoreSport ? <><span>{row.losses}</span><span>{row.balls}</span><span>{row.ballDifference > 0 ? `+${row.ballDifference}` : row.ballDifference}</span><strong>{row.points}</strong></> : <><span>{row.sets}</span><span>{row.setDifference > 0 ? `+${row.setDifference}` : row.setDifference}</span><span>{row.balls}</span><span>{row.ballDifference > 0 ? `+${row.ballDifference}` : row.ballDifference}</span></>}</div>)}
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
                <div className="card table-wrap"><table className="compact-table"><thead><tr><th>#</th><th>Teilnehmer</th><th>Sp.</th><th>Siege</th><th>{scoreSport ? 'Unent.' : 'N.'}</th><th>{scoreSport ? 'Niederlagen' : 'Sätze'}</th><th>{scoreSport ? scoreUnit : 'Satz ±'}</th><th>{scoreSport ? 'Differenz' : 'Bälle'}</th><th>{scoreSport ? 'Punkte' : 'Ball ±'}</th></tr></thead><tbody>{standings.map((row) => <tr key={row.name}><td>{row.rank}</td><td><button type="button" className="standing-player-button" onClick={() => setSelectedSwiss({ name: row.name, stageId: stage.id })}><strong>{row.name}</strong></button>{isMockParticipantWithdrawn(tournament, row.name) && <span className="standing-withdrawn" title="Teilnehmer zurückgezogen">Zurückgezogen</span>} {previousFinishLabels[row.name] && <small className="participant-origin">{previousFinishLabels[row.name]}</small>}</td><td>{row.played}</td><td>{row.wins}</td><td>{scoreSport ? row.draws : row.losses}</td>{scoreSport ? <><td>{row.losses}</td><td>{row.balls}</td><td>{row.ballDifference > 0 ? `+${row.ballDifference}` : row.ballDifference}</td><td>{row.points}</td></> : <><td>{row.sets}</td><td>{row.setDifference > 0 ? `+${row.setDifference}` : row.setDifference}</td><td>{row.balls}</td><td>{row.ballDifference > 0 ? `+${row.ballDifference}` : row.ballDifference}</td></>}</tr>)}</tbody></table></div>
              </section>
            );
          }

          if (stage.type === 'KNOCKOUT' || stage.type === 'DOUBLE_ELIMINATION' || stage.type === 'PLACEMENT') {
            const allRounds = buildMockBracket(tournament, stage);
            const rounds = allRounds.filter((round) => round.label !== 'Spiel um Platz 3');
            const thirdPlaceRound = allRounds.find((round) => round.label === 'Spiel um Platz 3');
            type BracketMatch = (typeof allRounds)[number]['matches'][number];
            const renderMatch = (match: BracketMatch) => (
              <article className="bracket-match" key={match.id}>
                {match.score === 'W.O.' && <span className="bracket-walkover-label" title="Kampflos entschiedene Partie (Walkover)">Kampflos</span>}
                {match.score === 'Beide Platz 3' && <span className="bracket-walkover-label">Gemeinsamer 3. Platz</span>}
                {[match.sideA, match.sideB].map((side, sideIndex) => (
                  <div className={match.winner === side ? 'winner' : ''} key={`${match.id}-${sideIndex}`}>
                    <span>
                      {match.score === 'W.O.' && isMockParticipantWithdrawn(tournament, side) ? `Rückzug (${side})` : side}
                      {previousFinishLabels[side] && <small className="participant-origin">{previousFinishLabels[side]}</small>}
                    </span>
                    <span className="bracket-score-cells">
                      {!scoreSport && (match.sets ?? []).map((set, index) => <span key={index}>{sideIndex === 0 ? set.sideAScore : set.sideBScore}</span>)}
                      <strong>{match.score === 'W.O.' ? (match.winner === side ? '✓' : '–') : match.score === 'Beide Platz 3' ? '3.' : match.score && match.score !== 'Freilos' ? match.score.split(':')[sideIndex] : sideIndex === 1 && match.score === 'Freilos' ? 'BYE' : ''}</strong>
                    </span>
                  </div>
                ))}
              </article>
            );
            return (
              <section className="spectator-stage-block" key={stage.id}>
                <div className="competition-stage-head"><div><span className="badge">K.-O.</span><h3>{stage.name}</h3></div></div>
                <div className="bracket-scroll"><div className="bracket-board">
                  {rounds.map((round, roundIndex) => (
                    <div className="bracket-round" key={round.label}>
                      <h4>{round.label}</h4>
                      <div className={roundIndex === rounds.length - 1 ? 'bracket-round-matches bracket-final-round-matches' : 'bracket-round-matches'}>
                        {round.matches.map(renderMatch)}
                      {roundIndex === rounds.length - 1 && thirdPlaceRound && (
                        <div className="bracket-third-place-block">
                          <h4>Spiel um Platz 3</h4>
                          {thirdPlaceRound.matches.map(renderMatch)}
                        </div>
                      )}
                      </div>
                    </div>
                  ))}
                </div></div>
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
            <div className="player-games-list swiss-history-list"><div className="swiss-history-head" aria-hidden="true"><span>Runde</span><span>Gegner · Bilanz vor Runde / Aktuelle Bilanz</span><span>Ausgang</span><span>Ergebnis</span></div>{ownMatches.map((match) => {
              const result = resultForMatchParticipant({ ...match, score: match.status === 'FINISHED' ? match.score : '–' }, selectedSwiss.name);
              const opponent = match.sideA === selectedSwiss.name ? match.sideB : match.sideA;
              const roundNumber = Number(match.round.match(/\d+/)?.[0]) || 1;
              const opponentRecord = getSwissRecordBeforeRound(tournament, stage, opponent, roundNumber);
              const opponentCurrentRecord = getSwissCurrentRecord(tournament, stage, opponent);
              return <div className="player-game-row swiss-player-game-row" key={match.id}>
                <span className="muted">{match.round}</span>
                <span className="swiss-history-opponent"><strong>{opponent}</strong><span className="swiss-record" title="Bilanz des Gegners vor dieser Runde">{opponentRecord}</span><span className="swiss-record swiss-record-current" title="Aktuelle Bilanz des Gegners">{opponentCurrentRecord}</span></span>
                <PlayerGameOutcome score={result.score} finished={match.status === 'FINISHED'} wonByDecision={match.decisionSide ? match.decisionSide === (match.sideA === selectedSwiss.name ? 'A' : 'B') : undefined} /><MatchResultDetails {...result} sport={tournament.sport} />
              </div>;
            })}</div>
          </section>
        </div>;
      })()}

      <section className="card spectator-next-card">
        <div className="control-section-head"><div><h2>Nächste Spiele</h2><p className="muted">Spielort- und Warteschlangenübersicht.</p></div></div>
        <div className="spectator-next-list">
          {next.map((match) => (
            <div className="spectator-next-row" key={match.id}>
              <span className={match.status === 'READY' ? 'badge ready' : 'badge'}>{venueName(match.table)}</span>
              <div><strong>{match.sideA}{swissRecordFor(match, match.sideA) && <span className="swiss-record">{swissRecordFor(match, match.sideA)}</span>} – {match.sideB}{swissRecordFor(match, match.sideB) && <span className="swiss-record">{swissRecordFor(match, match.sideB)}</span>}</strong><span className="muted">{match.phase} · {match.round}</span></div>
              <span className="muted">{match.status === 'READY' ? 'bereit' : 'wartet'}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
