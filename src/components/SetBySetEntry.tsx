import { useEffect, useMemo, useState } from 'react';
import type { MatchSet } from '@/domain/types';
import { getMatchFinalization, requiresFinalApproval } from '@/domain/matchFinalization';
import { applySetCorrections } from '@/domain/shortSetNotation';
import { storedResultSnapshot } from '@/domain/storedResultSnapshot';
import { parseSportSet, sportScoring, setTarget } from '@/domain/sportScoring';
import { MatchSetInput } from '@/components/MatchSetInput';
import { completeMockMatch, saveMockMatchSets, type MockRuntimeMatch } from '@/services/mockRuntime';

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
  const rules = sportScoring(match.sport);
  const target = setTarget(match.sport, playedSets.length, match.bestOf);
  const parsedCurrent = parseSportSet(match.sport, match.bestOf, playedSets.length, currentValue);
  const alreadyFinished = !editingFinished && match.status === 'FINISHED';
  const needsFinalApproval = requiresFinalApproval(match.bestOf, playedSets, swissAdminEntry) && !alreadyFinished;

  // Runtime/clock updates create a fresh match.sets array even when its contents
  // have not changed. Only a real change of game or score may reset the editor.
  const storedSetsKey = storedResultSnapshot(match.sets);
  useEffect(() => {
    setPlayedSets(JSON.parse(storedSetsKey) as MatchSet[]);
    setCurrentValue('');
    setError(null);
    setEditingFinished(false);
    setCorrectionOpen(false);
    setCorrectionError(null);
  }, [match.id, storedSetsKey]);

  function confirmSet() {
    if (alreadyFinished) return;
    if (!parsedCurrent) {
      setError(rules.shortSetEntry ? 'Bitte ein gültiges Satzergebnis eingeben, z. B. 7 oder -7.' : `Bitte ein gültiges Satzergebnis eingeben, z. B. ${target}:18.`);
      return;
    }

    const nextSets = [...playedSets, parsedCurrent];
    const nextFinalization = getMatchFinalization(match.bestOf, nextSets);

    setPlayedSets(nextSets);
    setCurrentValue('');
    setError(null);
    // Best-of-1 is unambiguous and finishes after its single confirmed set.
    if (nextFinalization === 'AUTO_FINISH' && !swissAdminEntry) {
      try {
        completeMockMatch(match.id, nextSets, 'FINISHED');
        setEditingFinished(false);
        onSaved?.();
        onCompleted?.(nextSets);
      } catch (cause) {
        setPlayedSets(playedSets);
        setError(cause instanceof Error ? cause.message : 'Ergebnis konnte nicht gespeichert werden.');
      }
      return;
    }
    // With BO3/BO5/BO7 the winning set is saved only as a *live draft*.
    // The table stays occupied until the separate final result confirmation.
    if (!editingFinished) {
      try {
        saveMockMatchSets(match.id, nextSets, 'LIVE');
        onSaved?.();
      } catch (cause) {
        setPlayedSets(playedSets);
        setError(cause instanceof Error ? cause.message : 'Satz konnte nicht gespeichert werden.');
      }
    }
  }

  function finalizeResult() {
    if (!needsFinalApproval) return;
    try {
      completeMockMatch(match.id, playedSets, 'FINISHED', swissAdminEntry);
      setEditingFinished(false);
      setError(null);
      onSaved?.();
      onCompleted?.(playedSets);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Ergebnis konnte nicht gespeichert werden.');
    }
  }

  function openCorrection() {
    if (alreadyFinished || playedSets.length === 0) return;
    setCorrectionValues(playedSets.map(() => ''));
    setCorrectionError(null);
    setCorrectionOpen(true);
  }

  function saveCorrection() {
    const validSets = rules.shortSetEntry
      ? applySetCorrections(playedSets, correctionValues)
      : correctionValues.map((value, index) => value.trim() ? parseSportSet(match.sport, match.bestOf, index, value) : playedSets[index]).filter((value): value is MatchSet => Boolean(value));
    const correctionsValid = correctionValues.every((value, index) => !value.trim() || Boolean(parseSportSet(match.sport, match.bestOf, index, value)));
    if (!validSets || !correctionsValid) {
      setCorrectionError(rules.shortSetEntry ? 'Bitte gültige Satzergebnisse eingeben (z. B. 11:7 oder -7).' : `Bitte gültige Satzergebnisse im Format ${target}:18 eingeben.`);
      return;
    }
    if (validSets.length === 0) {
      setCorrectionError('Mindestens ein Satz muss erhalten bleiben.');
      return;
    }
    if (validSets.length > match.bestOf) {
      setCorrectionError('Es sind mehr Sätze als im gewählten Best-of vorhanden.');
      return;
    }
    // Ein Match darf nicht nach einem bereits entscheidenden Satz fortgesetzt werden.
    if (validSets.slice(0, -1).some((_, index) => getMatchFinalization(match.bestOf, validSets.slice(0, index + 1)) !== 'IN_PROGRESS')) {
      setCorrectionError('Nach einem entscheidenden Satz dürfen keine weiteren Sätze stehen. Bitte den letzten Satz entfernen.');
      return;
    }
    setPlayedSets(validSets);
    setCurrentValue('');
    setError(null);
    setCorrectionOpen(false);
    setCorrectionError(null);
    // Während einer abgeschlossenen Ergebniskorrektur bleibt das Original
    // unverändert, bis das vollständige neue Endergebnis bestätigt wird.
    if (!editingFinished) {
      try {
        saveMockMatchSets(match.id, validSets, 'LIVE');
        onSaved?.();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Sätze konnten nicht gespeichert werden.');
      }
    }
  }

  function cancelFinishedCorrection() {
    setPlayedSets(match.sets ?? []);
    setCurrentValue('');
    setEditingFinished(false);
    setCorrectionOpen(false);
    setCorrectionValues([]);
    setCorrectionError(null);
    setError(null);
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
        <MatchSetInput
          sport={match.sport}
          bestOf={match.bestOf}
          setIndex={playedSets.length}
          value={currentValue}
          onChange={setCurrentValue}
          onConfirm={confirmSet}
          compact={compact}
        />
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
        <div className="prototype-modal-backdrop" role="presentation">
          <section className="prototype-modal result-correction-modal" role="dialog" aria-modal="true" aria-labelledby={`result-correction-${match.id}`} onKeyDown={(event) => {
            if (event.key === 'Escape') setCorrectionOpen(false);
          }}>
            <div className="result-correction-heading">
              <div>
                <h2 id={`result-correction-${match.id}`}>Satzergebnisse korrigieren</h2>
                <p className="muted">{match.sideA} – {match.sideB} · Best-of-{match.bestOf}</p>
              </div>
              <button type="button" className="btn small" onClick={() => setCorrectionOpen(false)}>Schließen</button>
            </div>
            <p className="field-hint">Nur die zu ändernden Sätze ausfüllen. Leere Felder übernehmen das bisherige Ergebnis. {rules.shortSetEntry ? 'Eingabe: 7 = 11:7, -7 = 7:11.' : 'Eingabe: Satzpunkte links:rechts, z. B. 25:19.'}</p>
            <div className="result-correction-table" role="table" aria-label="Satzergebnisse korrigieren">
              <div className="result-correction-row result-correction-header" role="row">
                <span role="columnheader">Satz</span>
                <span role="columnheader">Bisher</span>
                <span role="columnheader">Neues Ergebnis</span>
              </div>
              {correctionValues.map((value, index) => (
                <div className="result-correction-row" role="row" key={index}>
                  <span role="cell">{index + 1}</span>
                  <strong role="cell">{playedSets[index].sideAScore}:{playedSets[index].sideBScore}</strong>
                  <div role="cell">
                    <input
                      aria-label={`Neues Ergebnis für Satz ${index + 1}`}
                      autoFocus={index === 0}
                      inputMode="text"
                      placeholder="unverändert"
                      value={value}
                      onChange={(event) => {
                        setCorrectionValues((previous) => previous.map((entry, entryIndex) => entryIndex === index ? event.target.value : entry));
                        setCorrectionError(null);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') { event.preventDefault(); saveCorrection(); }
                      }}
                    />
                  </div>
                </div>
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
              <button className="btn primary" type="button" disabled={correctionValues.length === playedSets.length && correctionValues.every((value) => !value.trim())} onClick={saveCorrection}>Ergebnisse korrigieren</button>
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
        <div className="finished-result-correction-footer">
          <span className="field-hint">Korrekturmodus: Das bisherige Ergebnis bleibt gespeichert, bis das neue Endergebnis vollständig eingegeben wurde.</span>
          <button className="btn small" type="button" onClick={cancelFinishedCorrection}>Abbrechen</button>
        </div>
      )}
      {error && <div className="field-error">{error}</div>}
    </div>
  );
}
