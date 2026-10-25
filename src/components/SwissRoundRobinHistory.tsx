import { useState } from 'react';
import type { StoredSwissCutoffDecision } from '@/services/mockSwissCutoffStore';
import type { MockRuntimeMatch } from '@/services/mockRuntime';
import { SwissStandingsTable } from '@/components/SwissStandingsTable';
import { MatchResultDetails } from '@/components/MatchResultDetails';
import { PlayerGameOutcome } from '@/components/PlayerGameOutcome';
import { resultForMatchParticipant } from '@/services/matchPresentation';
import { SwissRoundRobinMatrix } from '@/components/SwissRoundRobinMatrix';
import { GroupMatchDayList, type GroupMatchDayItem } from '@/components/GroupMatchDayList';
import { playoffBoundaryTie, playoffRankingsWithHeadToHead, type PlayoffRound } from '@/domain/swissCutoffPlayoff';
import { resultScore, sportScoring } from '@/domain/sportScoring';
import type { MockStanding } from '@/services/mockCompetitionViews';

interface Props {
  phaseNumber: string;
  decision: StoredSwissCutoffDecision;
  sport?: string;
  matches?: readonly MockRuntimeMatch[];
  onEditResult?: (id: string) => void;
  onOpenControl?: () => void;
}

/** Independently scored intermediate phase in the tournament timeline, run
 * through the regular match queue and table assignment system. */
export function SwissRoundRobinHistory({
  phaseNumber, decision, sport = 'table_tennis', matches = [], onEditResult, onOpenControl,
}: Props) {
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);
  const rounds = (decision.extraRounds ?? []).filter((round) => round.kind === 'ROUND_ROBIN');
  const names = [...new Set(rounds.flatMap((round) => round.matches.flatMap((m) => [m.sideA, m.sideB])))];
  const rules = sportScoring(sport);
  const scoreSport = rules.mode === 'score';
  const rankings = playoffRankingsWithHeadToHead(names, rounds as PlayoffRound[], sport);
  const standings: MockStanding[] = rankings.map((row, index) => ({
    rank: index + 1, name: row.name, played: row.played,
    wins: row.wins, losses: row.losses, draws: row.draws,
    points: 3 * row.wins + row.draws,
    buchholz: 0,
    sets: `${row.setsWon}:${row.setsLost}`,
    setDifference: row.setsWon - row.setsLost,
    balls: `${row.ballsWon}:${row.ballsLost}`,
    ballDifference: row.ballsWon - row.ballsLost,
  }));
  const qualified = new Set(decision.winners ?? []);
  const completed = rounds.length > 0 && rounds.every((round) => round.matches.every((m) =>
    m.pointsA !== undefined && m.pointsB !== undefined));
  const qualifyingPlaces = decision.qualificationSlots ?? decision.winners?.length ?? 0;
  const unresolved = qualifyingPlaces
    ? playoffBoundaryTie(names, qualifyingPlaces, rounds, sport)
    : null;
  const lotteryCandidates = new Set(decision.lotPlayers ?? []);
  const lotteryWinners = new Set(decision.lotWinners ?? []);
  const decisionTags: Record<string, { label: string; qualified: boolean }> = {};
  if (completed && decision.winners?.length && decision.mode !== 'LOT') {
    names.forEach((name) => { decisionTags[name] = { label: 'Jeder gegen Jeden', qualified: qualified.has(name) }; });
  }
  const scheduledMatches: GroupMatchDayItem[] = rounds.flatMap((round, roundIndex) =>
    round.matches.map((match, index) => {
      const game = matches.find((item) => item.id.endsWith(`-sw-playoff-r${roundIndex + 1}-m${index + 1}`));
      const finished = match.pointsA !== undefined && match.pointsB !== undefined;
      const recordedSets = finished
        ? [{ number: 1, sideAScore: match.pointsA!, sideBScore: match.pointsB! }]
        : game?.sets ?? [];
      return {
        id: game?.id ?? `sw-playoff-r${roundIndex + 1}-m${index + 1}`,
        sideA: match.sideA,
        sideB: match.sideB,
        matchDay: match.matchDay ?? index + 1,
        score: recordedSets.length ? resultScore(sport, recordedSets) : '–',
        sets: recordedSets,
        status: finished ? 'played'
          : game?.status === 'LIVE' || game?.status === 'CONFIRMATION' ? 'live' : 'open',
      };
    }));
  return (
    <section className="competition-stage-section swiss-intermediate-stage" aria-label={`Phase ${phaseNumber}: Jeder gegen Jeden`}>
      <div className="competition-stage-head">
        <div><span className="badge">ENTSCHEIDUNGSPHASE</span><h3>Phase {phaseNumber} · Jeder gegen Jeden</h3></div>
        <span className="badge">{completed ? 'Partien abgeschlossen' : 'Entscheidung läuft'}</span>
      </div>
      <p className="muted">Die gleichplatzierten Spieler spielen nach einem regulären Jeder-gegen-jeden-Spielplan.
        Tischzuweisung und Ergebniseingabe erfolgen in der normalen Turnierleitung. Die separate Wertung verändert die Schweizer Tabelle und die Sonneborn-Berger-Wertung nicht.</p>
      {!completed && onOpenControl && <div className="actions swiss-intermediate-control-link">
        <button type="button" className="btn primary" onClick={onOpenControl}>Zur Tischzuweisung und Ergebniseingabe</button>
      </div>}
      <div className="swiss-intermediate-grid">
        <div className="card swiss-intermediate-standings">
          <div className="swiss-intermediate-panel-heading">
            <h4>Entscheidungstabelle</h4>
          </div>
          <SwissStandingsTable
            standings={standings}
            scoreSport={scoreSport}
            scoreUnit={rules.plural}
            unplayedWinners={new Set<string>()}
            previousFinishLabels={{}}
            withdrawalLabel={() => null}
            qualifyingPlaces={qualifyingPlaces}
            cutoffIndex={qualifyingPlaces > 0 && qualifyingPlaces < standings.length ? qualifyingPlaces - 1 : null}
            finalized={completed && Boolean(decision.winners?.length)}
            hideBuchholz
            highlightPlayers={new Set(unresolved?.players ?? [])}
            lotParticipants={lotteryCandidates}
            lotWinners={lotteryWinners}
            decisionTags={decisionTags}
            onSelectPlayer={setSelectedPlayer}
            onShowBuchholz={() => {}}
          />
        </div>
        <SwissRoundRobinMatrix
          players={standings.map((row) => row.name)}
          rounds={rounds}
          sport={sport}
          matches={matches}
          onEditResult={onEditResult}
        />
      </div>
      <article className="card group-overview-card swiss-intermediate-schedule">
        <h4>Spielplan und Ergebnisse</h4>
        <GroupMatchDayList matches={scheduledMatches} sport={sport} onEditResult={onEditResult} />
      </article>
      {selectedPlayer && (
        <div className="prototype-modal-backdrop" role="presentation" onMouseDown={() => setSelectedPlayer(null)}>
          <div className="prototype-modal player-games-modal" role="dialog" aria-modal="true"
            aria-label={`Spieleübersicht ${selectedPlayer}`} onMouseDown={(event) => event.stopPropagation()}>
            <div className="player-games-modal-head">
              <div><span className="badge">Phase {phaseNumber} · Jeder gegen Jeden</span><h2>{selectedPlayer}</h2></div>
              <button className="btn small" type="button" onClick={() => setSelectedPlayer(null)}>Schließen</button>
            </div>
            <div className="player-games-list">
              {scheduledMatches.filter((match) => match.sideA === selectedPlayer || match.sideB === selectedPlayer)
                .map((match) => {
                  const opponent = match.sideA === selectedPlayer ? match.sideB : match.sideA;
                  const displayed = resultForMatchParticipant({ ...match, sport }, selectedPlayer);
                  return (
                    <div className="player-game-row" key={match.id}>
                      <span className="muted">Spieltag {match.matchDay}</span>
                      <strong>vs. {opponent}</strong>
                      <span className="player-game-result-cell">
                        <PlayerGameOutcome score={displayed.score} finished={match.status === 'played'} />
                        <MatchResultDetails score={displayed.score} sets={displayed.sets} sport={sport}
                          onOpenResult={match.status !== 'open' && onEditResult ? () => {
                            setSelectedPlayer(null);
                            onEditResult(match.id);
                          } : undefined} />
                      </span>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      )}
      {completed && unresolved && !decision.winners?.length && <p className="swiss-cutoff-still-tied" role="status">
        Der direkte Vergleich der gleichplatzierten Spieler führt zu keiner eindeutigen Qualifikation.
        Ein physischer Losentscheid zwischen {unresolved.players.join(', ')} ist erforderlich.
      </p>}
      {decision.mode === 'LOT' && <p className="muted">Die verbleibende Gleichheit wurde durch einen dokumentierten physischen Losentscheid aufgelöst.</p>}
    </section>
  );
}
