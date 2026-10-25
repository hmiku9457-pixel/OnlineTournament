import { useEffect, useRef, useState } from 'react';
import type { MatchSet } from '@/domain/types';
import { scoreDecisionSuffix, sportScoring, validateCompleteResult, type ScoreDecision, type WinnerSide } from '@/domain/sportScoring';
import { completeMockMatch, saveMockMatchSets, type MockRuntimeMatch } from '@/services/mockRuntime';

interface Props {
  match: MockRuntimeMatch;
  onSaved?: () => void;
  onCompleted?: (sets: MatchSet[]) => void;
  allowEditFinished?: boolean;
  directorEntry?: boolean;
  compact?: boolean;
  sideARecord?: string;
  sideBRecord?: string;
}

type DecisionStep = 'CHOICE' | 'PENALTIES' | 'LOT';
const isInteger = (value: string) => /^\d+$/.test(value.trim()) && Number.isSafeInteger(Number(value));
const formatted = (score: MatchSet) => `${score.sideAScore}:${score.sideBScore}`;

/** Live-Stände und vollständige Entscheidung (FT, Verlängerung, Elfmeterschießen, Los). */
export function ScoreMatchEntry({ match, onSaved, onCompleted, allowEditFinished = false, directorEntry = false, compact = false, sideARecord, sideBRecord }: Props) {
  const [a, setA] = useState(String(match.sets?.[0]?.sideAScore ?? 0));
  const [b, setB] = useState(String(match.sets?.[0]?.sideBScore ?? 0));
  const [regulationScore, setRegulationScore] = useState<MatchSet | undefined>(match.extraTimeProgress?.regulationScore ?? match.decision?.regulationScore);
  const [penaltyA, setPenaltyA] = useState('');
  const [penaltyB, setPenaltyB] = useState('');
  const [decisionSide, setDecisionSide] = useState<WinnerSide | ''>('');
  const [decisionStep, setDecisionStep] = useState<DecisionStep | null>(null);
  const [editingFinished, setEditingFinished] = useState(false);
  const [error, setError] = useState('');
  const [justSaved, setJustSaved] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rules = sportScoring(match.sport);
  const finished = match.status === 'FINISHED' && !editingFinished;
  const storedA = match.sets?.[0]?.sideAScore ?? 0;
  const storedB = match.sets?.[0]?.sideBScore ?? 0;
  const storedRegA = (match.extraTimeProgress?.regulationScore ?? match.decision?.regulationScore)?.sideAScore;
  const storedRegB = (match.extraTimeProgress?.regulationScore ?? match.decision?.regulationScore)?.sideBScore;
  const scoreValid = isInteger(a) && isInteger(b);
  const tie = scoreValid && Number(a) === Number(b);
  const needsDecision = tie && match.requiresWinner && rules.allowsDraw;
  const draft: MatchSet[] = [{ number: 1, sideAScore: Number(a), sideBScore: Number(b) }];
  const validation = scoreValid ? validateCompleteResult(match.sport, 1, draft, match.requiresWinner) : 'Nur nichtnegative ganze Zahlen sind erlaubt.';
  const validExtraTime = !regulationScore || (scoreValid && Number(a) >= regulationScore.sideAScore && Number(b) >= regulationScore.sideBScore);

  useEffect(() => {
    setA(String(storedA));
    setB(String(storedB));
    setRegulationScore(storedRegA === undefined || storedRegB === undefined ? undefined : { number: 1, sideAScore: storedRegA, sideBScore: storedRegB });
    setEditingFinished(false);
    setDecisionStep(null);
    setError('');
  }, [match.id, storedA, storedB, storedRegA, storedRegB]);
  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);

  function clearSaved() {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setJustSaved(false);
  }
  function flashSaved() {
    clearSaved();
    setJustSaved(true);
    saveTimer.current = setTimeout(() => { setJustSaved(false); saveTimer.current = null; }, 1750);
  }
  function resetChoice() {
    setDecisionStep(null);
    setDecisionSide('');
    setError('');
    clearSaved();
  }
  function cancelFinishedCorrection() {
    setA(String(storedA));
    setB(String(storedB));
    setRegulationScore(storedRegA === undefined || storedRegB === undefined
      ? undefined : { number: 1, sideAScore: storedRegA, sideBScore: storedRegB });
    setEditingFinished(false);
    setDecisionStep(null);
    setDecisionSide('');
    setPenaltyA('');
    setPenaltyB('');
    setError('');
    clearSaved();
  }

  function saveProgress() {
    if (!scoreValid || finished || editingFinished) return;
    if (!validExtraTime) { setError('Tore aus der regulären Spielzeit dürfen in der Verlängerung nicht abgezogen werden.'); return; }
    try {
      const saved = saveMockMatchSets(match.id, draft, 'LIVE', regulationScore ? { regulationScore } : undefined);
      if (!saved?.sets.length || saved.status !== 'LIVE' || formatted(saved.sets[0]) !== formatted(draft[0])) {
        setError('Zwischenstand konnte nicht gespeichert werden.');
        return;
      }
      flashSaved();
      setError('');
      onSaved?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Zwischenstand konnte nicht gespeichert werden.');
    }
  }
  function finishWith(sets: MatchSet[], winner?: WinnerSide, decision?: ScoreDecision) {
    try {
      const saved = completeMockMatch(match.id, sets, 'FINISHED', directorEntry, winner, decision);
      if (!saved || saved.status !== 'FINISHED' || JSON.stringify(saved.sets) !== JSON.stringify(sets)) {
        throw new Error('Ergebnis wurde nicht gespeichert.');
      }
      setEditingFinished(false);
      setDecisionStep(null);
      clearSaved();
      setError('');
      onSaved?.();
      onCompleted?.(sets);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Ergebnis konnte nicht gespeichert werden.');
    }
  }
  function finish() {
    if (!validExtraTime) { setError('Der Verlängerungsstand darf nicht kleiner als der reguläre Stand sein.'); return; }
    if (needsDecision) {
      setDecisionStep('CHOICE');
      setPenaltyA('');
      setPenaltyB('');
      setError('');
    } else if (validation) {
      setError(validation);
    } else {
      finishWith(draft, undefined, regulationScore ? { type: 'EXTRA_TIME', regulationScore } : undefined);
    }
  }
  function chooseExtraTime() {
    const initial = draft[0];
    setRegulationScore(initial);
    setDecisionStep(null);
    setError('');
    // Die Verlängerung bleibt auch nach einem Neuladen als laufende Spielphase erkennbar.
    if (!editingFinished) {
      saveMockMatchSets(match.id, draft, 'LIVE', { regulationScore: initial });
      onSaved?.();
    }
  }
  function finishPenalties() {
    if (!isInteger(penaltyA) || !isInteger(penaltyB) || Number(penaltyA) === Number(penaltyB)) {
      setError('Bitte ein eindeutiges Elfmeterschießen-Ergebnis eingeben.');
      return;
    }
    const winner = Number(penaltyA) > Number(penaltyB) ? 'A' : 'B';
    finishWith(draft, winner, {
      type: 'PENALTIES', penaltyScore: { number: 1, sideAScore: Number(penaltyA), sideBScore: Number(penaltyB) }, regulationScore,
    });
  }

  return <div className={compact ? 'set-by-set-entry compact sport-score-entry' : 'set-by-set-entry sport-score-entry'}>
    <div className="set-entry-scoreline">
      <span>{match.sideA}{sideARecord && <em className="swiss-record">{sideARecord}</em>}</span>
      <strong>{a || '0'}:{b || '0'}{finished && match.decision && <small className="sport-score-suffix"> {scoreDecisionSuffix(match.decision)}</small>}</strong>
      <span>{match.sideB}{sideBRecord && <em className="swiss-record">{sideBRecord}</em>}</span>
    </div>
    {regulationScore && <p className="sport-score-phase-label">Verlängerung · Reguläre Spielzeit {formatted(regulationScore)}{!finished && <span className="badge live">LIVE</span>}</p>}
    {!finished ? <>
      {!decisionStep && <div className="sport-score-fields">
        <label className="current-set-field"><span>{rules.plural} · {match.sideA}</span><input aria-label={`${rules.plural} ${match.sideA}`} inputMode="numeric" type="number" min={regulationScore?.sideAScore ?? 0} step="1" value={a} onChange={(event) => { setA(event.target.value); resetChoice(); }} /></label>
        <span className="sport-score-colon">:</span>
        <label className="current-set-field"><span>{rules.plural} · {match.sideB}</span><input aria-label={`${rules.plural} ${match.sideB}`} inputMode="numeric" type="number" min={regulationScore?.sideBScore ?? 0} step="1" value={b} onChange={(event) => { setB(event.target.value); resetChoice(); }} /></label>
      </div>}
      {decisionStep && <div className="sport-score-decision-options" aria-label="Entscheidung bei Gleichstand">
        <strong>Spiel erfordert klaren Sieger</strong>
        {decisionStep === 'CHOICE' && <>
          <div className="sport-score-choice-actions">
            {!regulationScore && <button className="btn small" type="button" onClick={chooseExtraTime}>Verlängerung</button>}
            <button className="btn small sport-score-penalties-button" type="button" onClick={() => { setDecisionStep('PENALTIES'); setError(''); }}>Elfmeterschießen</button>
            <button className="btn small" type="button" onClick={() => { setDecisionStep('LOT'); setError(''); }}>{regulationScore ? 'Losglück' : 'Losen'}</button>
          </div>
        </>}
        {decisionStep === 'PENALTIES' && <>
          <span className="field-hint">Elfmeterschießen · Ergebnis eintragen</span>
          <div className="sport-score-fields">
            <label className="current-set-field"><span>{match.sideA}</span><input aria-label={`Elfmeter ${match.sideA}`} type="number" inputMode="numeric" min="0" step="1" value={penaltyA} onChange={(event) => { setPenaltyA(event.target.value); setError(''); }} /></label>
            <span className="sport-score-colon">:</span>
            <label className="current-set-field"><span>{match.sideB}</span><input aria-label={`Elfmeter ${match.sideB}`} type="number" inputMode="numeric" min="0" step="1" value={penaltyB} onChange={(event) => { setPenaltyB(event.target.value); setError(''); }} /></label>
          </div>
          <button className="btn small primary" type="button" onClick={finishPenalties}>Endergebnis speichern</button>
        </>}
        {decisionStep === 'LOT' && <>
          <span className="field-hint">Sieger nach Losentscheid auswählen</span>
          <div className="sport-score-choice-actions">
            <button className={decisionSide === 'A' ? 'btn small primary' : 'btn small'} type="button" onClick={() => setDecisionSide('A')}>{match.sideA}</button>
            <button className={decisionSide === 'B' ? 'btn small primary' : 'btn small'} type="button" onClick={() => setDecisionSide('B')}>{match.sideB}</button>
          </div>
          <button className="btn small primary" type="button" disabled={!decisionSide} onClick={() => finishWith(draft, decisionSide || undefined, { type: 'LOT', regulationScore })}>Sieger nach Losentscheid speichern</button>
        </>}
        <button className={decisionStep === 'CHOICE' ? 'btn small' : 'btn small sport-score-back'} type="button" onClick={() => { setDecisionStep(decisionStep === 'CHOICE' ? null : 'CHOICE'); setError(''); }}>
          {decisionStep === 'CHOICE' ? 'Ergebnis korrigieren' : '← Zurück'}
        </button>
      </div>}
      {error && <p className="field-error" role="alert">{error}</p>}
      {!decisionStep && <div className="sport-score-actions">
        {!editingFinished && <button className={justSaved ? 'btn small save-success' : 'btn small'} type="button" disabled={!scoreValid || !validExtraTime} onClick={saveProgress}>{justSaved ? 'gespeichert ✓' : 'Zwischenstand speichern'}</button>}
        <button className="btn small primary" type="button" disabled={!scoreValid || !validExtraTime || Boolean(!needsDecision && validation)} onClick={finish}>{editingFinished ? 'Korrigiertes Ergebnis speichern' : 'Spiel abschließen'}</button>
      </div>}
      {editingFinished && <div className="finished-result-correction-footer">
        <span className="field-hint">Das bisherige Ergebnis bleibt gespeichert, bis die Korrektur abgeschlossen ist.</span>
        <button type="button" className="btn small" onClick={cancelFinishedCorrection}>Abbrechen</button>
      </div>}
    </> : <>
      {match.decision && <p className="field-hint">{match.decision.type === 'LOT' ? 'Sieger nach Losentscheid' : match.decision.type === 'PENALTIES' ? 'Sieger im Elfmeterschießen' : 'Sieger nach Verlängerung'}: {match.decisionSide === 'A' || (!match.decisionSide && Number(a) > Number(b)) ? match.sideA : match.sideB}</p>}
      {!match.decision && match.decisionSide && <p className="field-hint">Sieger nach Entscheidung: {match.decisionSide === 'A' ? match.sideA : match.sideB}</p>}
      {allowEditFinished && <button className="btn small" type="button" onClick={() => { setEditingFinished(true); resetChoice(); }}>Ergebnis korrigieren</button>}
    </>}
  </div>;
}
