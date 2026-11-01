import { MatchResultDetails } from '@/components/MatchResultDetails';
import { MatchStatusLegend } from '@/components/MatchStatusLegend';
import { matchVisualClass, matchVisualState, matchVisualLabel } from '@/domain/matchVisualStatus';
import type { MatchSet } from '@/domain/types';
import { sportScoring, type ScoreDecision } from '@/domain/sportScoring';

export interface SwissRoundFixture {
  id: string;
  round: string;
  sideA: string;
  sideB: string;
  autoWinner?: string;
}

export interface SwissRoundMatch {
  id: string;
  score: string;
  status: string;
  table?: string;
  sets?: MatchSet[];
  decision?: ScoreDecision;
}

/** Wertung aus derselben Schweizer Tabelle wie links im Turnierverlauf. */
export interface SwissStandingRecord {
  name: string;
  wins: number;
  losses: number;
  draws: number;
}

/** Neueste angesetzte Schweizer Runde – auch bei Freilosen und nach Phasenende. */
export function currentSwissRound<T extends SwissRoundFixture>(fixtures: readonly T[]) {
  if (!fixtures.length) return { round: 0, matches: [] as T[] };
  const roundNumber = (match: T) => Number(match.round.match(/Runde\s+(\d+)/)?.[1]) || 1;
  const lastRound = Math.max(...fixtures.map(roundNumber));
  return { round: lastRound, matches: fixtures.filter((match) => roundNumber(match) === lastRound) };
}

interface Props {
  fixtures: readonly SwissRoundFixture[];
  matches: readonly SwissRoundMatch[];
  standings?: readonly SwissStandingRecord[];
  sport: string;
  editable: boolean;
  notice?: string | null;
  onEditResult?: (matchId: string) => void;
  canEditResult?: (matchId: string) => boolean;
  venueName?: (table: string) => string;
}

export function SwissRoundCard({ fixtures, matches, standings = [], sport, editable, notice, onEditResult, canEditResult, venueName }: Props) {
  const { round, matches: currentFixtures } = currentSwissRound(fixtures);
  const matchById = new Map(matches.map((match) => [match.id, match]));
  const hasDraws = sportScoring(sport).mode === 'score';
  const recordByPlayer = new Map(standings.map((standing) => [
    standing.name,
    hasDraws
      ? `${standing.wins}:${standing.draws}:${standing.losses}`
      : `${standing.wins}:${standing.losses}`,
  ]));
  const finished = currentFixtures.filter((fixture) => fixture.autoWinner || matchById.get(fixture.id)?.status === 'FINISHED').length;
  const running = currentFixtures.filter((fixture) => matchVisualState(matchById.get(fixture.id)?.status) === 'live').length;

  return (
    <aside className="card swiss-round-card" aria-label="Spiele der aktuellen Schweizer Runde">
      <div className="swiss-round-card-heading">
        <div>
          <h4>{editable ? `Runde ${round || 1} · Vorschau` : `Runde ${round || 1} · Spiele`}</h4>
          <span className="muted">{editable ? 'Vor Phasenstart änderbar' : `${finished} von ${currentFixtures.length} abgeschlossen`}</span>
        </div>
        {running > 0 && <span className="swiss-round-live-count">{running} live</span>}
      </div>
      {notice && editable && <p className="swiss-draw-notice" role="status">{notice}</p>}
      <MatchStatusLegend />
      <div className="swiss-round-match-list">
        {currentFixtures.length === 0 && <p className="muted">Für diese Runde sind noch keine Spiele angesetzt.</p>}
        {currentFixtures.map((fixture) => {
          const match = matchById.get(fixture.id);
          const isBye = fixture.sideB === 'Freilos' || Boolean(fixture.autoWinner);
          const isLive = !isBye && matchVisualState(match?.status) === 'live';
          const isFinished = isBye || matchVisualState(match?.status) === 'finished';
          const visualStatus = isBye ? 'FINISHED' : match?.status;
          const assigned = match?.table && match.table !== 'Noch offen';
          return (
            <div className={`swiss-round-match ${matchVisualClass(visualStatus)}`} key={fixture.id}
              title={isBye ? 'Freilos – abgeschlossen' : matchVisualLabel(visualStatus)}>
              <div className="swiss-round-match-meta">
                <span className="swiss-round-match-status">
                  {isLive && <span className="swiss-round-live-indicator" aria-hidden="true" />}
                  {isBye ? 'Freilos' : match?.status === 'CONFIRMATION' ? 'Ergebnis prüfen' : isLive ? 'Läuft gerade' : isFinished ? 'Abgeschlossen' : matchVisualLabel(visualStatus)}
                </span>
                {assigned && <span>{venueName ? venueName(match.table!) : match.table}</span>}
              </div>
              <div className={`group-match-row swiss-round-match-row ${matchVisualClass(visualStatus)}`}>
                <span className="group-match-side swiss-round-player" title={fixture.sideA}>
                  <span className="swiss-round-player-name">{fixture.sideA}</span>
                  {recordByPlayer.has(fixture.sideA) && (
                    <span className="swiss-round-standing-tag" title="Aktuelle Bilanz" aria-label={`Aktuelle Bilanz ${recordByPlayer.get(fixture.sideA)}`}>
                      {recordByPlayer.get(fixture.sideA)}
                    </span>
                  )}
                </span>
                {isBye
                  ? <strong className="swiss-bye-score">Frei</strong>
                  : <MatchResultDetails
                      score={match?.score ?? '–'}
                      sets={match?.sets}
                      sport={sport}
                      decision={match?.decision}
                      onOpenResult={match && ['LIVE', 'READY', 'CONFIRMATION', 'FINISHED'].includes(match.status) && onEditResult ? () => onEditResult(fixture.id) : undefined}
                      onEdit={isFinished && onEditResult && canEditResult?.(fixture.id) ? () => onEditResult(fixture.id) : undefined}
                    />}
                <span className="group-match-side swiss-round-player swiss-round-player-right" title={fixture.sideB}>
                  {recordByPlayer.has(fixture.sideB) && (
                    <span className="swiss-round-standing-tag" title="Aktuelle Bilanz" aria-label={`Aktuelle Bilanz ${recordByPlayer.get(fixture.sideB)}`}>
                      {recordByPlayer.get(fixture.sideB)}
                    </span>
                  )}
                  <span className="swiss-round-player-name">{fixture.sideB}</span>
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
