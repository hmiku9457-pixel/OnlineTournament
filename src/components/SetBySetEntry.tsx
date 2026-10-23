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
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [correctionValues, setCorrectionValues] = useState<string[]>([]);
  const [correctionError, setCorrectionError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const wins = useMemo(() => winsFromSets(playedSets), [playedSets]);
  const currentSetNumber = playedSets.length + 1;
  const parsedCurrent = parseShortSet(currentValue, currentSetNumber);
  const alreadyFinished = !editingFinished && match.status === 'FINISHED';
  const needsFinalApproval = requiresFinalApproval(match.bestOf, playedSets, swissAdminEntry) && !alreadyFinished;

  useEffect(() => {
    setPlayedSets(match.sets ?? []);
    setCurrentValue('');
    setError(null);
    setEditingFinished(false);
    setCorrectionOpen(false);
    setCorrectionError(null);
  }, [match.id, match.sets]);

  function confirmSet() {
    if (alreadyFinished) return;
    if (!parsedCurrent) {
      setError('Bitte ein gültiges Satzergebnis eingeben, z. B. 7 oder -7.');
      return;
    }

    const nextSets = [...playedSets, parsedCurrent];
    const nextFinalization = getMatchFinalization(match.bestOf, nextSets);

    setPlayedSets(nextSets);
    setCurrentValue('');
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

  function openCorrection() {
    if (alreadyFinished || playedSets.length === 0) return;
    setCorrectionValues(playedSets.map((set) => `${set.sideAScore}:${set.sideBScore}`));
    setCorrectionError(null);
    setCorrectionOpen(true);
  }

  function saveCorrection() {
    const corrected = correctionValues.map((value, index) => parseShortSet(value, index + 1));
    if (corrected.some((set) => set === null)) {
      setCorrectionError('Bitte alle Sätze gültig eingeben (z. B. 11:7 oder -7).');
      return;
    }
    const nextSets = corrected.filter((set): set is MatchSet => set !== null);
    if (nextSets.length === 0) {
      setCorrectionError('Mindestens ein Satz muss erhalten bleiben.');
      return;
    }
    if (nextSets.length > match.bestOf) {
      setCorrectionError('Es sind mehr Sätze als im gewählten Best-of vorhanden.');
      return;
    }
    // Ein Match darf nicht nach einem bereits entscheidenden Satz fortgesetzt werden.
    if (nextSets.slice(0, -1).some((_, index) => getMatchFinalization(match.bestOf, nextSets.slice(0, index + 1)) !== 'IN_PROGRESS')) {
      setCorrectionError('Nach einem entscheidenden Satz dürfen keine weiteren Sätze stehen. Bitte den letzten Satz entfernen.');
      return;
    }
    setPlayedSets(nextSets);
    setCurrentValue('');
    setError(null);
    setCorrectionOpen(false);
    setCorrectionError(null);
    // Nur den laufenden Entwurf speichern, das Spiel nicht automatisch abschließen.
    saveMockMatchSets(match.id, nextSets, 'LIVE');
    onSaved?.();
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
                {alreadyFinished ? <span>{set.sideAScore}:{set.sideBScore}</span> : (
                  <button className="played-set-result" type="button" onClick={openCorrection} title="Satzergebnisse im Dialog korrigieren" aria-label={`Satzergebnisse korrigieren: Satz ${set.number} ${set.sideAScore}:${set.sideBScore}`}>
                    {set.sideAScore}:{set.sideBScore}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {!alreadyFinished && !needsFinalApproval && currentSetNumber <= match.bestOf && (
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


      {needsFinalApproval && (
        <div className="result-approval-panel" role="status">
          <strong>Vorläufiges Ergebnis</strong>
          <div className="result-approval-actions">
            <button className="btn small primary" type="button" onClick={finalizeResult}>Endergebnis bestätigen</button>
            <button className="btn small" type="button" onClick={openCorrection}>Ergebnis korrigieren</button>
          </div>
        </div>
      )}

      {correctionOpen && (
        <div className="prototype-modal-backdrop" role="presentation" onMouseDown={() => setCorrectionOpen(false)}>
          <section className="prototype-modal result-correction-modal" role="dialog" aria-modal="true" aria-labelledby={`result-correction-${match.id}`} onMouseDown={(event) => event.stopPropagation()} onKeyDown={(event) => {
            if (event.key === 'Escape') setCorrectionOpen(false);
          }}>
            <div className="result-correction-heading">
              <div>
                <h2 id={`result-correction-${match.id}`}>Satzergebnisse korrigieren</h2>
                <p className="muted">{match.sideA} – {match.sideB} · Best-of-{match.bestOf}</p>
              </div>
              <button type="button" className="btn small" onClick={() => setCorrectionOpen(false)}>Schließen</button>
            </div>
            <p className="field-hint">Kurzeingabe: 7 = 11:7, -7 = 7:11. Änderungen werden erst beim Speichern übernommen.</p>
            <div className="result-correction-sets">
              {correctionValues.map((value, index) => (
                <label className="field" key={index}>
                  <span>Satz {index + 1}</span>
                  <input
                    aria-label={`Satz ${index + 1} korrigieren`}
                    autoFocus={index === 0}
                    value={value}
                    onChange={(event) => {
                      setCorrectionValues((previous) => previous.map((entry, entryIndex) => entryIndex === index ? event.target.value : entry));
                      setCorrectionError(null);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') { event.preventDefault(); saveCorrection(); }
                    }}
                  />
                </label>
              ))}
            </div>
            {correctionValues.length > 1 && (
              <button type="button" className="btn small" onClick={() => {
                setCorrectionValues((previous) => previous.slice(0, -1));
                setCorrectionError(null);
              }}>Letzten Satz entfernen</button>
            )}
            {correctionError && <p className="field-error" role="alert">{correctionError}</p>}
            <div className="result-correction-actions">
              <button className="btn" type="button" onClick={() => setCorrectionOpen(false)}>Abbrechen</button>
              <button className="btn primary" type="button" onClick={saveCorrection}>Korrektur speichern</button>
            </div>
          </section>
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
              setCorrectionOpen(false);
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
