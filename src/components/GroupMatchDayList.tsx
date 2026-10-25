import type { MatchSet } from '@/domain/types';
import { MatchResultDetails } from '@/components/MatchResultDetails';

export interface GroupMatchDayItem {
  id: string;
  sideA: string;
  sideB: string;
  score: string;
  status: 'played' | 'live' | 'open';
  matchDay?: number;
  sets?: MatchSet[];
}

/** Shared matchday presentation used by regular groups and Phase 1.5. */
export function GroupMatchDayList({
  matches, sport, onEditResult, sideLabel,
}: {
  matches: readonly GroupMatchDayItem[];
  sport: string;
  onEditResult?: (matchId: string) => void;
  sideLabel?: (name: string, match: GroupMatchDayItem) => string;
}) {
  const gameDays = [...new Set(matches.map((match) => match.matchDay ?? 0))].sort((a, b) => a - b);
  return <div className="group-match-list">
    {gameDays.map((day) => (
      <div className="group-match-day" key={day}>
        <strong className="group-match-day-label">Spieltag {day}</strong>
        {matches.filter((match) => (match.matchDay ?? 0) === day).map((match) => (
          <div className={match.status === 'live' ? 'group-match-row live' : 'group-match-row'} key={match.id}>
            {match.status === 'live' && <span className="group-match-live-dot" role="img" aria-label="Laufendes Spiel" title="Läuft gerade" />}
            <span className="group-match-side" title={match.sideA}>{sideLabel?.(match.sideA, match) ?? match.sideA}</span>
            <MatchResultDetails score={match.score} sets={match.sets} sport={sport}
              onOpenResult={match.status !== 'open' && onEditResult ? () => onEditResult(match.id) : undefined} />
            <span className="group-match-side" title={match.sideB}>{sideLabel?.(match.sideB, match) ?? match.sideB}</span>
          </div>
        ))}
      </div>
    ))}
  </div>;
}
