import { useEffect, useMemo, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { MatchSet } from '@/domain/types';
import { getMatchFinalization, requiresFinalApproval } from '@/domain/matchFinalization';
import { completeMockMatch, saveMockMatchSets, type MockRuntimeMatch } from '@/services/mockRuntime';

export function parseShortSet(value: string, number: number): MatchSet | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (trimmed.includes(':')) {
    const [leftRaw, rightRaw] = trimmed.split(':');
    const left = Number(leftRaw?.trim());
    const right = Number(rightRaw?.trim());
    if (!Number.isFinite(left) || !Number.isFinite(right) || left === right || left < 0 || right < 0) return null;
    return { number, sideAScore: Math.trunc(left), sideBScore: Math.trunc(right) };
  }

  // Die Zeichenfolge -0 ist numerisch -0, und -0 >= 0 ist in JS wahr.
  // Deshalb das Vorzeichen aus dem Originaltext lesen, nicht aus Number().
  if (!/^[+-]?\d+$/.test(trimmed)) return null;
  const numeric = Number(trimmed);
  if (!Number.isFinite(numeric)) return null;
  const loser = Math.abs(Math.trunc(numeric));
  const winner = Math.max(11, loser + 2);

  return !trimmed.startsWith('-')
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
  allowEditFinished?: boolean;
  /** Schweizer System: Admin muss auch BO1 nach der Satzeingabe ausdrücklich bestätigen. */
  swissAdminEntry?: boolean;
}

export function SetBySetEntry({ match, onSaved, onCompleted, compact = false, sideARecord, sideBRecord, allowEditFinished = false, swissAdminEntry = false }: SetBySetEntryProps) {
  const [playedSets, setPlayedSets] = useState<MatchSet[]>(match.sets ?? []);
  const [editingFinished, setEditingFinished] = useState(false);
  const [currentValue, setCurrentValue] = useState('');
  const [editingSetIndex, setEditingSetIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const wins = useMemo(() => winsFromSets(playedSets), [playedSets]);
  const currentSetNumber = editingSetIndex === null ? playedSets.length + 1 : editingSetIndex + 1;
  const parsedCurrent = parseShortSet(currentValue, currentSetNumber);
  const alreadyFinished = !editingFinished && match.status === 'FINISHED';
  const needsFinalApproval = requiresFinalApproval(match.bestOf, playedSets, swissAdminEntry) && !alreadyFinished;

  useEffect(() => {
    setPlayedSets(match.sets ?? []);
    setCurrentValue('');
    setError(null);
    setEditingFinished(false);
    setEditingSetIndex(null);
  }, [match.id, match.sets]);

  function confirmSet() {
    if (alreadyFinished) return;
    if (!parsedCurrent) {
      setError('Bitte ein gültiges Satzergebnis eingeben, z. B. 7 oder -7.');
      return;
    }

    const nextSets = editingSetIndex === null
      ? [...playedSets, parsedCurrent]
      : playedSets.map((set, index) => index === editingSetIndex ? parsedCurrent : set);
    const nextFinalization = getMatchFinalization(match.bestOf, nextSets);

    setPlayedSets(nextSets);
    setCurrentValue('');
    setEditingSetIndex(null);
    setError(null);
    // Best-of-1 is unambiguous and finishes after its single confirmed set.
    if (nextFinalization === 'AUTO_FINISH' && !swissAdminEntry) {
      completeMockMatch(match.id, nextSets, 'FINISHED');
      setEditingFinished(false);
      onSaved?.();
      onCompleted?.(nextSets);
      return;
    }
    // With BO3/BO5/BO7 the winning set is saved only as a *live draft*.
    // The table stays occupied until the separate final result confirmation.
    if (!editingFinished) {
      saveMockMatchSets(match.id, nextSets, 'LIVE');
      onSaved?.();
    }
  }

  function finalizeResult() {
    if (!needsFinalApproval) return;
    completeMockMatch(match.id, playedSets, 'FINISHED', swissAdminEntry);
    setEditingFinished(false);
    setError(null);
    onSaved?.();
    onCompleted?.(playedSets);
  }

  function correctSet(index: number) {
    const previous = playedSets[index];
    if (!previous || alreadyFinished) return;
    setEditingSetIndex(index);
    setCurrentValue(`${previous.sideAScore}:${previous.sideBScore}`);
    setError(null);
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
              <li key={set.number} className="played-set-item">
                <span>{set.sideAScore}:{set.sideBScore}</span>
                {!alreadyFinished && <button className="set-correct-button" type="button" onClick={() => correctSet(set.number - 1)} aria-label={`Satz ${set.number} korrigieren`}>Ändern</button>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {!alreadyFinished && (!needsFinalApproval || editingSetIndex !== null) && currentSetNumber <= match.bestOf && (
        <div className="current-set-entry-row">
          <label className="current-set-field">
            <span>Satz {currentSetNumber}{editingSetIndex !== null ? ' korrigieren' : ''}</span>
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
            Satz {currentSetNumber} {editingSetIndex !== null ? 'korrigieren' : 'bestätigen'}
          </button>
        </div>
      )}


      {needsFinalApproval && editingSetIndex === null && (
        <div className="result-approval-panel" role="status">
          <strong>Vorläufiges Endergebnis: {wins.a}:{wins.b}</strong>
          <p>{swissAdminEntry ? 'Schweizer System: Bitte das Endergebnis als Turnierleitung ausdrücklich bestätigen. Erst danach ist das Spiel endgültig abgeschlossen.' : 'Bitte alle Sätze prüfen. Erst mit der Bestätigung wird das Spiel abgeschlossen und der Tisch wieder frei.'}</p>
          <button className="btn small primary" type="button" onClick={finalizeResult}>Endergebnis bestätigen</button>
        </div>
      )}

      {allowEditFinished && !editingFinished && match.status === 'FINISHED' && (match.sets?.length ?? 0) > 0 && (
        <div className="finished-result-actions">
          <button
            className="btn small"
            type="button"
            onClick={() => {
              setPlayedSets([]);
              setCurrentValue('');
              setError(null);
              setEditingFinished(true);
              setEditingSetIndex(null);
            }}
          >
            Ergebnis neu eingeben
          </button>
        </div>
      )}

      {allowEditFinished && editingFinished && (
        <div className="field-hint">Korrekturmodus: Das bisherige Ergebnis bleibt gespeichert, bis das neue Endergebnis vollständig eingegeben wurde.</div>
      )}
      {error && <div className="field-error">{error}</div>}
    </div>
  );
}
