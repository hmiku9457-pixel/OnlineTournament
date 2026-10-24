import { useEffect, useState } from 'react';
import type { MatchSet } from '@/domain/types';
import { scoreDecisionSuffix, sportScoring, validateCompleteResult, type ScoreDecision, type WinnerSide } from '@/domain/sportScoring';
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

type DecisionStep = 'EXTRA_QUESTION' | 'EXTRA_SCORE' | 'PENALTY_QUESTION' | 'PENALTY_SCORE' | 'LOT_PICK';
const isInteger = (value: string) => /^\d+$/.test(value.trim()) && Number.isSafeInteger(Number(value));

/** Gesamtspielstand mit eigenständigem Entscheidungsweg für Remis in K.-o.-Partien. */
export function ScoreMatchEntry({ match, onSaved, onCompleted, allowEditFinished = false, compact = false, sideARecord, sideBRecord }: Props) {
  const [a, setA] = useState(String(match.sets?.[0]?.sideAScore ?? 0));
  const [b, setB] = useState(String(match.sets?.[0]?.sideBScore ?? 0));
  const [extraA, setExtraA] = useState('');
  const [extraB, setExtraB] = useState('');
  const [penaltyA, setPenaltyA] = useState('');
  const [penaltyB, setPenaltyB] = useState('');
  const [decisionSide, setDecisionSide] = useState<WinnerSide | ''>('');
  const [decisionStep, setDecisionStep] = useState<DecisionStep | null>(null);
  const [editingFinished, setEditingFinished] = useState(false);
  const [error, setError] = useState('');
  const [savedMessage, setSavedMessage] = useState('');
  const storedA = match.sets?.[0]?.sideAScore ?? 0;
  const storedB = match.sets?.[0]?.sideBScore ?? 0;
  const rules = sportScoring(match.sport);
  const finished = match.status === 'FINISHED' && !editingFinished;
  const scoreValid = isInteger(a) && isInteger(b);
  const tie = scoreValid && Number(a) === Number(b);
  const needsDecision = tie && match.requiresWinner && rules.allowsDraw;
  const draft: MatchSet[] = [{ number: 1, sideAScore: Number(a), sideBScore: Number(b) }];
  const validation = scoreValid ? validateCompleteResult(match.sport, 1, draft, match.requiresWinner) : 'Nur nichtnegative ganze Zahlen sind erlaubt.';

  useEffect(() => {
    setA(String(storedA));
    setB(String(storedB));
    setEditingFinished(false);
    setDecisionStep(null);
    setError('');
  }, [match.id, storedA, storedB]);
  useEffect(() => { setSavedMessage(''); }, [match.id]);

  function resetDecision() {
    setDecisionStep(null);
    setDecisionSide('');
    setError('');
    setSavedMessage('');
  }
  function saveProgress() {
    if (!scoreValid || finished || editingFinished) return;
    saveMockMatchSets(match.id, draft);
    setSavedMessage(`Zwischenstand ${a}:${b} gespeichert ✓`);
    setError('');
    onSaved?.();
  }
  function finishWith(sets: MatchSet[], winner?: WinnerSide, decision?: ScoreDecision) {
    try {
      completeMockMatch(match.id, sets, 'FINISHED', false, winner, decision);
      setEditingFinished(false);
      setDecisionStep(null);
      setSavedMessage('');
      setError('');
      onSaved?.();
      onCompleted?.(sets);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Ergebnis konnte nicht gespeichert werden.');
    }
  }
  function finish() {
    if (needsDecision) {
      setDecisionStep('EXTRA_QUESTION');
      setExtraA(a);
      setExtraB(b);
      setPenaltyA('');
      setPenaltyB('');
      setError('');
    } else if (validation) {
      setError(validation);
    } else {
      finishWith(draft);
    }
  }
  function finishExtraTime() {
    if (!isInteger(extraA) || !isInteger(extraB) || Number(extraA) === Number(extraB)
      || Number(extraA) < Number(a) || Number(extraB) < Number(b)) {
      setError('Bitte einen eindeutigen Endstand nach Verlängerung eintragen. Tore können nicht abgezogen werden.');
      return;
    }
    finishWith([{ number: 1, sideAScore: Number(extraA), sideBScore: Number(extraB) }], undefined,
      { type: 'EXTRA_TIME', regulationScore: draft[0] });
  }
  function finishPenalties() {
    if (!isInteger(penaltyA) || !isInteger(penaltyB) || Number(penaltyA) === Number(penaltyB)) {
      setError('Bitte ein eindeutiges Elfmeterschießen-Ergebnis eingeben.');
      return;
    }
    const winner = Number(penaltyA) > Number(penaltyB) ? 'A' : 'B';
    finishWith(draft, winner, { type: 'PENALTIES', penaltyScore: { number: 1, sideAScore: Number(penaltyA), sideBScore: Number(penaltyB) } });
  }

  return <div className={compact ? 'set-by-set-entry compact sport-score-entry' : 'set-by-set-entry sport-score-entry'}>
    <div className="set-entry-scoreline">
      <span>{match.sideA}{sideARecord && <em className="swiss-record">{sideARecord}</em>}</span>
      <strong>{a || '0'}:{b || '0'}{finished && match.decision && <small className="sport-score-suffix"> {scoreDecisionSuffix(match.decision)}</small>}</strong>
      <span>{match.sideB}{sideBRecord && <em className="swiss-record">{sideBRecord}</em>}</span>
    </div>
    {!finished ? <>
      {!decisionStep && <div className="sport-score-fields">
        <label className="current-set-field"><span>{rules.plural} · {match.sideA}</span><input aria-label={`${rules.plural} ${match.sideA}`} inputMode="numeric" type="number" min="0" step="1" value={a} onChange={(event) => { setA(event.target.value); resetDecision(); }} /></label>
        <span className="sport-score-colon">:</span>
        <label className="current-set-field"><span>{rules.plural} · {match.sideB}</span><input aria-label={`${rules.plural} ${match.sideB}`} inputMode="numeric" type="number" min="0" step="1" value={b} onChange={(event) => { setB(event.target.value); resetDecision(); }} /></label>
      </div>}
      {decisionStep && <div className="sport-score-decision-flow" aria-label="Entscheidung bei Gleichstand">
        <span className="badge">Entscheidung bei {a}:{b}</span>
        {decisionStep === 'EXTRA_QUESTION' && <>
          <strong>Wurde das Spiel in der Verlängerung entschieden?</strong>
          <div className="sport-score-choice-actions">
            <button className="btn small" type="button" onClick={() => { setDecisionStep('EXTRA_SCORE'); setError(''); }}>Ja, nach Verlängerung</button>
            <button className="btn small" type="button" onClick={() => { setDecisionStep('PENALTY_QUESTION'); setError(''); }}>Nein</button>
          </div>
        </>}
        {decisionStep === 'EXTRA_SCORE' && <>
          <strong>Wie lautete der Endstand nach Verlängerung?</strong>
          <div className="sport-score-fields">
            <label className="current-set-field"><span>{match.sideA}</span><input aria-label={`Nach Verlängerung ${match.sideA}`} type="number" inputMode="numeric" min={a} step="1" value={extraA} onChange={(event) => { setExtraA(event.target.value); setError(''); }} /></label>
            <span className="sport-score-colon">:</span>
            <label className="current-set-field"><span>{match.sideB}</span><input aria-label={`Nach Verlängerung ${match.sideB}`} type="number" inputMode="numeric" min={b} step="1" value={extraB} onChange={(event) => { setExtraB(event.target.value); setError(''); }} /></label>
          </div>
          <p className="field-hint">Das Ergebnis erscheint mit „n.V.“.</p>
          <button className="btn small primary" type="button" onClick={finishExtraTime}>Endergebnis speichern</button>
        </>}
        {decisionStep === 'PENALTY_QUESTION' && <>
          <strong>Wurde die Partie im Elfmeterschießen entschieden?</strong>
          <div className="sport-score-choice-actions">
            <button className="btn small" type="button" onClick={() => { setDecisionStep('PENALTY_SCORE'); setError(''); }}>Ja, Elfmeterschießen</button>
            <button className="btn small" type="button" onClick={() => { setDecisionStep('LOT_PICK'); setError(''); }}>Nein</button>
          </div>
        </>}
        {decisionStep === 'PENALTY_SCORE' && <>
          <strong>Ergebnis des Elfmeterschießens</strong>
          <div className="sport-score-fields">
            <label className="current-set-field"><span>{match.sideA}</span><input aria-label={`Elfmeter ${match.sideA}`} type="number" inputMode="numeric" min="0" step="1" value={penaltyA} onChange={(event) => { setPenaltyA(event.target.value); setError(''); }} /></label>
            <span className="sport-score-colon">:</span>
            <label className="current-set-field"><span>{match.sideB}</span><input aria-label={`Elfmeter ${match.sideB}`} type="number" inputMode="numeric" min="0" step="1" value={penaltyB} onChange={(event) => { setPenaltyB(event.target.value); setError(''); }} /></label>
          </div>
          <p className="field-hint">Das Elfmeterschießen wird in Klammern ergänzt.</p>
          <button className="btn small primary" type="button" onClick={finishPenalties}>Endergebnis speichern</button>
        </>}
        {decisionStep === 'LOT_PICK' && <>
          <strong>Sieger nach Losentscheid auswählen</strong>
          <div className="sport-score-choice-actions">
            <button className={decisionSide === 'A' ? 'btn small primary' : 'btn small'} type="button" onClick={() => setDecisionSide('A')}>{match.sideA}</button>
            <button className={decisionSide === 'B' ? 'btn small primary' : 'btn small'} type="button" onClick={() => setDecisionSide('B')}>{match.sideB}</button>
          </div>
          <button className="btn small primary" type="button" disabled={!decisionSide} onClick={() => finishWith(draft, decisionSide || undefined, { type: 'LOT' })}>Sieger nach Losentscheid speichern</button>
        </>}
        <button className="btn small sport-score-back" type="button" onClick={() => { setDecisionStep(null); setError(''); }}>← Zurück zum Spielstand</button>
      </div>}
      {error && <p className="field-error" role="alert">{error}</p>}
      {savedMessage && !decisionStep && <p className="sport-score-saved" role="status">{savedMessage}</p>}
      {!decisionStep && <div className="sport-score-actions">
        {!editingFinished && <button className="btn small" type="button" disabled={!scoreValid} onClick={saveProgress}>Zwischenstand speichern</button>}
        <button className="btn small primary" type="button" disabled={!scoreValid || Boolean(!needsDecision && validation)} onClick={finish}>{editingFinished ? 'Korrigiertes Ergebnis speichern' : 'Spiel abschließen'}</button>
      </div>}
      {editingFinished && <p className="field-hint">Das bisherige Ergebnis bleibt gespeichert, bis die Korrektur abgeschlossen ist.</p>}
    </> : <>
      {match.decision && <p className="field-hint">{match.decision.type === 'LOT' ? 'Sieger nach Losentscheid' : match.decision.type === 'PENALTIES' ? 'Sieger im Elfmeterschießen' : 'Sieger nach Verlängerung'}: {match.decisionSide === 'A' || (!match.decisionSide && Number(a) > Number(b)) ? match.sideA : match.sideB}</p>}
      {!match.decision && match.decisionSide && <p className="field-hint">Sieger nach Entscheidung: {match.decisionSide === 'A' ? match.sideA : match.sideB}</p>}
      {allowEditFinished && <button className="btn small" type="button" onClick={() => { setEditingFinished(true); resetDecision(); }}>Ergebnis korrigieren</button>}
    </>}
  </div>;
}
