import type { StoredSwissCutoffDecision } from '@/services/mockSwissCutoffStore';
import type { MockRuntimeMatch } from '@/services/mockRuntime';
import { SwissStandingsTable } from '@/components/SwissStandingsTable';
import { playoffBoundaryTie, playoffRankingsWithHeadToHead, type PlayoffRound } from '@/domain/swissCutoffPlayoff';
import { sportScoring } from '@/domain/sportScoring';
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
  return (
    <section className="competition-stage-section swiss-intermediate-stage" aria-label={`Phase ${phaseNumber}: Jeder gegen Jeden`}>
      <div className="competition-stage-head">
        <div><span className="badge">ENTSCHEIDUNGSPHASE</span><h3>Phase {phaseNumber} · Jeder gegen Jeden</h3></div>
        <span className="badge">{completed ? 'Partien abgeschlossen' : 'Entscheidung läuft'}</span>
      </div>
      <p className="muted">Die gleichplatzierten Spieler spielen nach einem regulären Jeder-gegen-jeden-Spielplan.
        Tischzuweisung und Ergebniseingabe erfolgen in der normalen Turnierleitung. Die separate Wertung verändert die Schweizer Tabelle und die Buchholzzahl nicht.</p>
      {!completed && onOpenControl && <div className="actions swiss-intermediate-control-link">
        <button type="button" className="btn primary" onClick={onOpenControl}>Zur Tischzuweisung und Ergebniseingabe</button>
      </div>}
      <div className="swiss-intermediate-grid">
        <div className="swiss-intermediate-standings">
          <h4>Entscheidungstabelle</h4>
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
            readOnly
            highlightPlayers={new Set(unresolved?.players ?? [])}
            lotParticipants={lotteryCandidates}
            lotWinners={lotteryWinners}
            decisionTags={decisionTags}
            onSelectPlayer={() => {}}
            onShowBuchholz={() => {}}
          />
        </div>
        <div className="card swiss-intermediate-matches">
          <h4>Spielplan und Ergebnisse</h4>
          {rounds.map((round, roundIndex) => {
            const gameDays = [...new Set(round.matches.map((match, index) => match.matchDay ?? index + 1))]
              .sort((a, b) => a - b);
            return <div key={roundIndex} className="swiss-intermediate-round">
              {rounds.length > 1 && <h5>Durchgang {roundIndex + 1}</h5>}
              {gameDays.map((day) => <div className="swiss-intermediate-matchday" key={day}>
                <h5>Spieltag {day}</h5>
                {round.matches.map((match, index) => {
                  if ((match.matchDay ?? index + 1) !== day) return null;
                  const game = matches.find((item) => item.id.endsWith(`-sw-playoff-r${roundIndex + 1}-m${index + 1}`));
                  return <div className="swiss-intermediate-game" key={index}>
                    <span>{match.sideA}</span>
                    <div className="swiss-intermediate-game-result">
                      <strong>{match.pointsA === undefined ? 'Offen' : `${match.pointsA} : ${match.pointsB}`}</strong>
                      {game && <span className="muted">{game.status === 'LIVE' ? game.table : game.status === 'WAITING' ? 'Wartet auf Tisch' : game.status === 'FINISHED' ? 'Beendet' : game.status}</span>}
                      {game && onEditResult && ['READY', 'LIVE', 'CONFIRMATION', 'FINISHED'].includes(game.status) &&
                        <button type="button" className="btn small" onClick={() => onEditResult(game.id)}>Ergebnis</button>}
                    </div>
                    <span>{match.sideB}</span>
                  </div>;
                })}
              </div>)}
            </div>;
          })}
        </div>
      </div>
      {completed && unresolved && !decision.winners?.length && <p className="swiss-cutoff-still-tied" role="status">
        Der direkte Vergleich der gleichplatzierten Spieler führt zu keiner eindeutigen Qualifikation.
        Ein physischer Losentscheid zwischen {unresolved.players.join(', ')} ist erforderlich.
      </p>}
      {decision.mode === 'LOT' && <p className="muted">Die verbleibende Gleichheit wurde durch einen dokumentierten physischen Losentscheid aufgelöst.</p>}
    </section>
  );
}
