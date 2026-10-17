import { useEffect, useMemo, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { MatchSet } from '@/domain/types';
import { completeMockMatch, saveMockMatchSets, type MockRuntimeMatch } from '@/services/mockRuntime';

function parseShortSet(value: string, number: number): MatchSet | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (trimmed.includes(':')) {
    const [leftRaw, rightRaw] = trimmed.split(':');
    const left = Number(leftRaw?.trim());
    const right = Number(rightRaw?.trim());
    if (!Number.isFinite(left) || !Number.isFinite(right) || left === right || left < 0 || right < 0) return null;
    return { number, sideAScore: Math.trunc(left), sideBScore: Math.trunc(right) };
  }

  const numeric = Number(trimmed);
  if (!Number.isFinite(numeric)) return null;
  const loser = Math.abs(Math.trunc(numeric));
  const winner = Math.max(11, loser + 2);

  return numeric >= 0
    ? { number, sideAScore: winner, sideBScore: loser }
    : { number, sideAScore: loser, sideBScore: winner };
}

function winsFromSets(sets: MatchSet[]) {
  return sets.reduce(
    (wins, set) => {
      if (set.sideAScore > set.sideBScore) wins.a += 1;
      else if (set.sideBScore > set.sideAScore) wins.b += 1;
      return wins;
    },
    { a: 0, b: 0 },
  );
}

interface SetBySetEntryProps {
  match: MockRuntimeMatch;
  onSaved?: () => void;
  onCompleted?: (sets: MatchSet[]) => void;
  compact?: boolean;
  sideARecord?: string;
  sideBRecord?: string;
}

export function SetBySetEntry({ match, onSaved, onCompleted, compact = false, sideARecord, sideBRecord }: SetBySetEntryProps) {
  const [playedSets, setPlayedSets] = useState<MatchSet[]>(match.sets ?? []);
  const [currentValue, setCurrentValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const winsNeeded = Math.ceil(match.bestOf / 2);
  const wins = useMemo(() => winsFromSets(playedSets), [playedSets]);
  const currentSetNumber = playedSets.length + 1;
  const parsedCurrent = parseShortSet(currentValue, currentSetNumber);
  const alreadyFinished = wins.a >= winsNeeded || wins.b >= winsNeeded;

  useEffect(() => {
    setPlayedSets(match.sets ?? []);
    setCurrentValue('');
    setError(null);
  }, [match.id, match.sets]);

  function confirmSet() {
    if (alreadyFinished) return;
    if (!parsedCurrent) {
      setError('Bitte ein gültiges Satzergebnis eingeben, z. B. 7 oder -7.');
      return;
    }

    const nextSets = [...playedSets, parsedCurrent];
    const nextWins = winsFromSets(nextSets);
    const finished = nextWins.a >= winsNeeded || nextWins.b >= winsNeeded;

    if (finished) completeMockMatch(match.id, nextSets, 'FINISHED');
    else saveMockMatchSets(match.id, nextSets, 'LIVE');

    setPlayedSets(nextSets);
    setCurrentValue('');
    setError(null);
    onSaved?.();
    if (finished) onCompleted?.(nextSets);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    confirmSet();
  }

  return (
    <div className={compact ? 'set-by-set-entry compact' : 'set-by-set-entry'}>
      <div className="set-entry-scoreline">
        <span>{match.sideA}{sideARecord && <em className="swiss-record">{sideARecord}</em>}</span>
        <strong>{wins.a}:{wins.b}</strong>
        <span>{match.sideB}{sideBRecord && <em className="swiss-record">{sideBRecord}</em>}</span>
      </div>

      {playedSets.length > 0 && (
        <div className="played-set-history" aria-label="Bisher gespielte Sätze">
          <ul>
            {playedSets.map((set) => (
              <li key={set.number}>{set.sideAScore}:{set.sideBScore}</li>
            ))}
          </ul>
        </div>
      )}

      {!alreadyFinished && currentSetNumber <= match.bestOf && (
        <div className="current-set-entry-row">
          <label className="current-set-field">
            <span>Satz {currentSetNumber}</span>
            <input
              aria-label={`Satz ${currentSetNumber}`}
              inputMode="numeric"
              placeholder="7 / -7"
              value={currentValue}
              onChange={(event) => setCurrentValue(event.target.value)}
              onKeyDown={handleKeyDown}
              title="7 = 11:7, -7 = 7:11"
            />
          </label>
          <button className="btn small primary" type="button" disabled={!parsedCurrent} onClick={confirmSet}>
            Satz {currentSetNumber} bestätigen
          </button>
        </div>
      )}

      {error && <div className="field-error">{error}</div>}
    </div>
  );
}
