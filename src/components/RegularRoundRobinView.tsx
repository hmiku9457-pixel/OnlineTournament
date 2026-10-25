import { useState } from 'react';
import type { DemoTournament } from '@/data/demoTournaments';
import type { TournamentStage } from '@/domain/types';
import { SwissStandingsTable } from '@/components/SwissStandingsTable';
import { SwissRoundRobinMatrix } from '@/components/SwissRoundRobinMatrix';
import { GroupMatchDayList, type GroupMatchDayItem } from '@/components/GroupMatchDayList';
import { MatchResultDetails } from '@/components/MatchResultDetails';
import { PlayerGameOutcome } from '@/components/PlayerGameOutcome';
import { buildRoundRobinStandings } from '@/services/mockCompetitionViews';
import { getMockStageMatches, getMockStoredResult } from '@/services/mockRuntime';
import { getStageEntrants, isStageCompleted } from '@/services/mockPhaseLifecycle';
import { resultForMatchParticipant } from '@/services/matchPresentation';
import { resultMetrics, sportScoring } from '@/domain/sportScoring';
import type { PlayoffRound } from '@/domain/swissCutoffPlayoff';

interface Props {
  tournament: DemoTournament;
  stage: TournamentStage;
  onEditResult?: (id: string) => void;
}

/** Same ranking / expandable matrix / full-width matchdays layout as the
 * Swiss intermediate round robin, using real multi-set phase games. */
export function RegularRoundRobinView({ tournament, stage, onEditResult }: Props) {
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);
  const matches = getMockStageMatches(tournament, stage);
  const standings = buildRoundRobinStandings(tournament, stage);
  const rules = sportScoring(tournament.sport);
  const scoreSport = rules.mode === 'score';
  const completed = isStageCompleted(tournament, stage);
  const next = tournament.stages[tournament.stages.findIndex((item) => item.id === stage.id) + 1];
  const qualified = completed && next ? new Set(getStageEntrants(tournament, next)) : null;
  const qualifyingPlaces = next
    ? stage.advancement.type === 'top_n' && stage.advancement.value > 0
      ? stage.advancement.value : Math.max(1, Number(next.settings.entrants) || 1)
    : 0;

  const schedule: GroupMatchDayItem[] = matches.map((match) => ({
    id: match.id, sideA: match.sideA, sideB: match.sideB,
    matchDay: match.matchDay,
    score: match.score,
    sets: match.sets,
    status: match.status === 'FINISHED' ? 'played'
      : ['LIVE', 'READY', 'CONFIRMATION'].includes(match.status) ? 'live' : 'open',
  }));

  // For BO1 show concrete set points (11:7); for longer set matches display
  // the won-set tally (3:1). Score sports always show the actual game score.
  const round: PlayoffRound = {
    kind: 'ROUND_ROBIN',
    matches: matches.map((match) => {
      const finished = match.status === 'FINISHED';
      const sets = match.sets ?? [];
      const score = scoreSport
        ? sets[0] ? [sets[0].sideAScore, sets[0].sideBScore] : null
        : stage.bestOf === 1 && sets[0] ? [sets[0].sideAScore, sets[0].sideBScore]
          : sets.length ? (() => {
            const result = resultMetrics(tournament.sport, sets);
            return [result.winsA, result.winsB];
          })() : null;
      return {
        sideA: match.sideA, sideB: match.sideB, matchDay: match.matchDay,
        ...(finished && score ? { pointsA: score[0], pointsB: score[1] } : {}),
      };
    }),
  };

  return <section className="competition-stage-section swiss-intermediate-stage" aria-label={`${stage.name}: Jeder gegen Jeden`}>
    <div className="competition-stage-head">
      <div><span className="badge">JEDER GEGEN JEDEN</span><h3>{stage.name}</h3></div>
      <span className="badge">{completed ? 'Beendet' : 'Läuft'}</span>
    </div>
    <p className="muted">Alle Teilnehmer spielen gegeneinander. Ergebnisse und Spieltage werden wie in der Gruppenphase dokumentiert.</p>
    <div className="swiss-intermediate-grid">
      <div className="card swiss-intermediate-standings">
        <div className="swiss-intermediate-panel-heading"><h4>Tabelle</h4></div>
        <SwissStandingsTable
          standings={standings}
          scoreSport={scoreSport}
          scoreUnit={rules.plural}
          unplayedWinners={new Set<string>()}
          previousFinishLabels={{}}
          withdrawalLabel={() => null}
          qualifyingPlaces={qualifyingPlaces}
          cutoffIndex={qualifyingPlaces > 0 && qualifyingPlaces < standings.length ? qualifyingPlaces - 1 : null}
          finalized={completed}
          hideBuchholz
          onSelectPlayer={setSelectedPlayer}
          onShowBuchholz={() => {}}
          decisionTags={qualified ? Object.fromEntries(standings.map((row) => [
            row.name, { label: 'Qualifikation', qualified: qualified.has(row.name) },
          ])) : undefined}
        />
      </div>
      <SwissRoundRobinMatrix
        players={standings.map((row) => row.name)}
        sport={tournament.sport}
        rounds={[round]}
        matches={matches}
        matchAt={(_round, index) => matches[index]}
        onEditResult={onEditResult}
      />
    </div>
    <article className="card group-overview-card swiss-intermediate-schedule">
      <h4>Spielplan und Ergebnisse</h4>
      <GroupMatchDayList matches={schedule} sport={tournament.sport} onEditResult={onEditResult} />
    </article>
    {selectedPlayer && (
      <div className="prototype-modal-backdrop" role="presentation" onMouseDown={() => setSelectedPlayer(null)}>
        <div className="prototype-modal player-games-modal" role="dialog" aria-modal="true"
          aria-label={`Spieleübersicht ${selectedPlayer}`} onMouseDown={(event) => event.stopPropagation()}>
          <div className="player-games-modal-head">
            <div><span className="badge">{stage.name} · Jeder gegen Jeden</span><h2>{selectedPlayer}</h2></div>
            <button className="btn small" type="button" onClick={() => setSelectedPlayer(null)}>Schließen</button>
          </div>
          <div className="player-games-list">
            {schedule.filter((match) => match.sideA === selectedPlayer || match.sideB === selectedPlayer).map((match) => {
              const opponent = match.sideA === selectedPlayer ? match.sideB : match.sideA;
              const displayed = resultForMatchParticipant({ ...match, sport: tournament.sport }, selectedPlayer);
              const stored = getMockStoredResult(match.id);
              return <div className="player-game-row" key={match.id}>
                <span className="muted">Spieltag {match.matchDay}</span>
                <strong>vs. {opponent}</strong>
                <span className="player-game-result-cell">
                  <PlayerGameOutcome score={displayed.score} finished={match.status === 'played'} />
                  <MatchResultDetails score={displayed.score} sets={displayed.sets} sport={tournament.sport}
                    decision={stored?.decision} decisionReversed={match.sideB === selectedPlayer}
                    onOpenResult={match.status !== 'open' && onEditResult ? () => {
                      setSelectedPlayer(null); onEditResult(match.id);
                    } : undefined} />
                </span>
              </div>;
            })}
          </div>
        </div>
      </div>
    )}
  </section>;
}
