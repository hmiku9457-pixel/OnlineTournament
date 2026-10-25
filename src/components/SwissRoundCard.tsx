import { MatchResultDetails } from '@/components/MatchResultDetails';
import type { MatchSet } from '@/domain/types';
import type { ScoreDecision } from '@/domain/sportScoring';

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
  sport: string;
  editable: boolean;
  notice?: string | null;
  onEditResult?: (matchId: string) => void;
  canEditResult?: (matchId: string) => boolean;
  venueName?: (table: string) => string;
}

export function SwissRoundCard({ fixtures, matches, sport, editable, notice, onEditResult, canEditResult, venueName }: Props) {
  const { round, matches: currentFixtures } = currentSwissRound(fixtures);
  const matchById = new Map(matches.map((match) => [match.id, match]));
  const finished = currentFixtures.filter((fixture) => fixture.autoWinner || matchById.get(fixture.id)?.status === 'FINISHED').length;
  const running = currentFixtures.filter((fixture) => matchById.get(fixture.id)?.status === 'LIVE').length;

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
      <div className="swiss-round-match-list">
        {currentFixtures.length === 0 && <p className="muted">Für diese Runde sind noch keine Spiele angesetzt.</p>}
        {currentFixtures.map((fixture) => {
          const match = matchById.get(fixture.id);
          const isBye = fixture.sideB === 'Freilos' || Boolean(fixture.autoWinner);
          const isLive = match?.status === 'LIVE';
          const isFinished = isBye || match?.status === 'FINISHED';
          const assigned = match?.table && match.table !== 'Noch offen';
          return (
            <div className={`swiss-round-match${isLive ? ' is-live' : isFinished ? ' is-finished' : ''}`} key={fixture.id}>
              <div className="swiss-round-match-meta">
                <span>{isBye ? 'Freilos' : isLive ? 'Läuft' : isFinished ? 'Beendet' : match?.status === 'READY' ? 'Zugewiesen' : match?.status === 'CONFIRMATION' ? 'Ergebnis prüfen' : editable ? 'Vorschau' : 'Wartet'}</span>
                {assigned && <span>{venueName ? venueName(match.table!) : match.table}</span>}
              </div>
              <div className={`group-match-row swiss-round-match-row${isLive ? ' live' : ''}`}>
                {isLive && <span className="group-match-live-dot" role="img" aria-label="Laufendes Spiel" />}
                <span className="group-match-side" title={fixture.sideA}>{fixture.sideA}</span>
                {isBye
                  ? <strong className="swiss-bye-score">Frei</strong>
                  : <MatchResultDetails
                      score={match?.score ?? '–'}
                      sets={match?.sets}
                      sport={sport}
                      decision={match?.decision}
                      onEdit={isFinished && onEditResult && canEditResult?.(fixture.id) ? () => onEditResult(fixture.id) : undefined}
                    />}
                <span className="group-match-side" title={fixture.sideB}>{fixture.sideB}</span>
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
