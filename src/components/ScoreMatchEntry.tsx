import { useEffect, useState } from 'react';
import type { MatchSet } from '@/domain/types';
import { sportScoring, validateCompleteResult, type WinnerSide } from '@/domain/sportScoring';
import { completeMockMatch, saveMockMatchSets, type MockRuntimeMatch } from '@/services/mockRuntime';

interface Props {
  match: MockRuntimeMatch;
  onSaved?: () => void;
  onCompleted?: (sets: MatchSet[]) => void;
  allowEditFinished?: boolean;
  compact?: boolean;
  sideARecord?: string;
  sideBRecord?: string;
}

/** Tore/Körbe werden als Gesamtstand erfasst – unabhängig von den Satzregeln. */
export function ScoreMatchEntry({ match, onSaved, onCompleted, allowEditFinished = false, compact = false, sideARecord, sideBRecord }: Props) {
  const [a, setA] = useState(String(match.sets?.[0]?.sideAScore ?? 0));
  const [b, setB] = useState(String(match.sets?.[0]?.sideBScore ?? 0));
  const [decisionSide, setDecisionSide] = useState<WinnerSide | ''>(match.decisionSide ?? '');
  const [editingFinished, setEditingFinished] = useState(false);
  const [error, setError] = useState('');
  const rules = sportScoring(match.sport);
  const finished = match.status === 'FINISHED' && !editingFinished;
  const isInteger = (value: string) => /^\d+$/.test(value.trim()) && Number.isSafeInteger(Number(value));
  const scoreValid = isInteger(a) && isInteger(b);
  const tie = scoreValid && Number(a) === Number(b);
  const needsDecision = tie && match.requiresWinner && rules.allowsDraw;
  const draft: MatchSet[] = [{ number: 1, sideAScore: Number(a), sideBScore: Number(b) }];
  const validation = scoreValid ? validateCompleteResult(match.sport, 1, draft, match.requiresWinner, decisionSide || undefined) : 'Nur nichtnegative ganze Zahlen sind erlaubt.';

  useEffect(() => {
    setA(String(match.sets?.[0]?.sideAScore ?? 0));
    setB(String(match.sets?.[0]?.sideBScore ?? 0));
    setDecisionSide(match.decisionSide ?? '');
    setEditingFinished(false);
    setError('');
  }, [match.id, match.sets, match.decisionSide]);

  function saveProgress() {
    if (!scoreValid || finished || editingFinished) return;
    saveMockMatchSets(match.id, draft);
    setError('');
    onSaved?.();
  }

  function finish() {
    if (validation) { setError(validation); return; }
    try {
      completeMockMatch(match.id, draft, 'FINISHED', false, decisionSide || undefined);
      setEditingFinished(false);
      setError('');
      onSaved?.();
      onCompleted?.(draft);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Ergebnis konnte nicht gespeichert werden.');
    }
  }

  return <div className={compact ? 'set-by-set-entry compact sport-score-entry' : 'set-by-set-entry sport-score-entry'}>
    <div className="set-entry-scoreline">
      <span>{match.sideA}{sideARecord && <em className="swiss-record">{sideARecord}</em>}</span>
      <strong>{a || '0'}:{b || '0'}</strong>
      <span>{match.sideB}{sideBRecord && <em className="swiss-record">{sideBRecord}</em>}</span>
    </div>
    {!finished ? <>
      <div className="sport-score-fields">
        <label className="current-set-field"><span>{rules.plural} · {match.sideA}</span><input aria-label={`${rules.plural} ${match.sideA}`} inputMode="numeric" type="number" min="0" step="1" value={a} onChange={(event) => { setA(event.target.value); setDecisionSide(''); setError(''); }} /></label>
        <span className="sport-score-colon">:</span>
        <label className="current-set-field"><span>{rules.plural} · {match.sideB}</span><input aria-label={`${rules.plural} ${match.sideB}`} inputMode="numeric" type="number" min="0" step="1" value={b} onChange={(event) => { setB(event.target.value); setDecisionSide(''); setError(''); }} /></label>
      </div>
      {needsDecision && <fieldset className="sport-score-decision">
        <legend>{rules.allowsDraw ? 'Sieger nach Entscheidung (z. B. Verlängerung/Strafstoßschießen)' : 'Sieger nach Verlängerung'}</legend>
        <label><input type="radio" name={`decision-${match.id}`} checked={decisionSide === 'A'} onChange={() => setDecisionSide('A')} /> {match.sideA}</label>
        <label><input type="radio" name={`decision-${match.id}`} checked={decisionSide === 'B'} onChange={() => setDecisionSide('B')} /> {match.sideB}</label>
        <p className="field-hint">Der reguläre Spielstand bleibt bestehen. Die Entscheidung bestimmt nur, wer weiterkommt.</p>
      </fieldset>}
      {rules.allowsDraw && !match.requiresWinner && tie && <p className="field-hint">Ein Unentschieden ist in dieser Phase erlaubt.</p>}
      {error && <p className="field-error" role="alert">{error}</p>}
      <div className="sport-score-actions">
        {!editingFinished && <button className="btn small" type="button" disabled={!scoreValid} onClick={saveProgress}>Zwischenstand speichern</button>}
        <button className="btn small primary" type="button" disabled={Boolean(validation)} onClick={finish}>{editingFinished ? 'Korrigiertes Ergebnis speichern' : 'Spiel abschließen'}</button>
      </div>
      {editingFinished && <p className="field-hint">Das bisherige Ergebnis bleibt gespeichert, bis die Korrektur abgeschlossen ist.</p>}
    </> : <>
      {match.decisionSide && <p className="field-hint">Sieger nach Entscheidung: {match.decisionSide === 'A' ? match.sideA : match.sideB}</p>}
      {allowEditFinished && <button className="btn small" type="button" onClick={() => { setEditingFinished(true); setError(''); }}>Ergebnis korrigieren</button>}
    </>}
  </div>;
}
