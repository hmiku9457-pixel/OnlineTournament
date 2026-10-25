import { useState } from 'react';
import { getSwissCutoffPair, type SwissCutoffStatus } from '@/services/mockRuntime';
import { setTarget, sportScoring } from '@/domain/sportScoring';

interface Props {
  status: SwissCutoffStatus;
  sport: string;
  onSet: (pointsA: number, pointsB: number) => string | null;
  onLot: (winners: string[]) => string | null;
  onReset: () => void;
}

export function SwissCutoffDecisionModal({ status, sport, onSet, onLot, onReset }: Props) {
  const [chosenMode, setChosenMode] = useState<'SET' | 'LOT' | null>(null);
  const [pointsA, setPointsA] = useState('');
  const [pointsB, setPointsB] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState('');
  const mode = status.decision?.sets.length ? 'SET' : chosenMode;
  const pair = getSwissCutoffPair(status);
  const played = status.decision?.sets ?? [];
  const eliminated = new Set(status.decision?.eliminated ?? []);
  const remaining = status.tie.players.filter((name) => !eliminated.has(name));
  const rules = sportScoring(sport);
  const outcomeType = rules.mode === 'score' ? 'Entscheidungsspiel' : 'Entscheidungssatz';
  const validNumber = (value: string) => /^\d+$/.test(value.trim()) && Number.isSafeInteger(Number(value));
  const validScore = validNumber(pointsA) && validNumber(pointsB) && pointsA !== pointsB && Number(pointsA) !== Number(pointsB);

  function submitSet() {
    setError('');
    if (!validScore) { setError('Bitte zwei gültige, unterschiedliche Punktzahlen eingeben.'); return; }
    const result = onSet(Number(pointsA), Number(pointsB));
    if (result) { setError(result); return; }
    setPointsA('');
    setPointsB('');
  }

  function submitLot() {
    setError('');
    const result = onLot(selected);
    if (result) setError(result);
  }

  return (
    <div className="prototype-modal-backdrop swiss-cutoff-backdrop">
      <section className="prototype-modal swiss-cutoff-modal" role="alertdialog" aria-modal="true"
        aria-labelledby="swiss-cutoff-title" aria-describedby="swiss-cutoff-description">
        <div className="swiss-cutoff-heading">
          <span className="badge">ENTSCHEIDUNG ERFORDERLICH</span>
          <h2 id="swiss-cutoff-title">Gleichstand an der Qualifikationsgrenze</h2>
          <p id="swiss-cutoff-description">Die letzte Schweizer Runde ist abgeschlossen. Für die nächste Phase {status.tie.slots === 1 ? 'ist' : 'sind'} noch <strong>{status.tie.slots}</strong> {status.tie.slots === 1 ? 'Platz' : 'Plätze'} offen. Die folgenden {status.tie.players.length} Teilnehmenden liegen nach <strong>allen sportlichen Tie-Breakern gleichauf</strong>.</p>
          <p className="muted">Die Phase bleibt gesperrt, bis die Turnierleitung einen Stichentscheid dokumentiert. Die alphabetische Reihenfolge entscheidet nicht über die Qualifikation.</p>
        </div>

        <div className="swiss-cutoff-candidates" aria-label="Gleichplatzierte Teilnehmer">
          {status.tie.players.map((name) => (
            <div key={name} className={eliminated.has(name) ? 'swiss-cutoff-candidate eliminated' : 'swiss-cutoff-candidate'}>
              <strong>{name}</strong>
              {eliminated.has(name) && <span className="muted">Ausgeschieden im Stichentscheid</span>}
            </div>
          ))}
        </div>

        {!mode && (
          <div className="swiss-cutoff-choice">
            <strong>Wie soll entschieden werden?</strong>
            <div className="actions">
              <button type="button" className="btn primary" autoFocus onClick={() => { setChosenMode('SET'); setError(''); }}>{outcomeType} spielen</button>
              <button type="button" className="btn" onClick={() => { setChosenMode('LOT'); setError(''); }}>Physischer Losentscheid</button>
            </div>
          </div>
        )}

        {mode === 'SET' && (
          <div className="swiss-cutoff-mode">
            <h3>{outcomeType} erfassen</h3>
            <p className="muted">{rules.mode === 'sets'
              ? `Die beiden Spieler spielen einen einzelnen Entscheidungssatz nach den üblichen ${sport}-Regeln (Zielwert ${setTarget(sport, 0, 1)}). Der Satz zählt nur für die Qualifikation, nicht für die Schweizer Tabelle.`
              : 'Ein zusätzliches Entscheidungsspiel mit eindeutigem Sieger austragen. Das Ergebnis zählt nur für die Qualifikation, nicht für die Schweizer Tabelle.'}</p>
            {played.length > 0 && (
              <div className="swiss-cutoff-history">
                <strong>Bereits entschieden</strong>
                {played.map((set, index) => <div key={index}>{set.sideA} – {set.sideB}: {set.pointsA}:{set.pointsB} · Sieger: <strong>{set.winner}</strong></div>)}
              </div>
            )}
            <p><strong>Noch {remaining.length - status.tie.slots} {remaining.length - status.tie.slots === 1 ? 'Entscheidung' : 'Entscheidungen'} erforderlich</strong></p>
            {pair[0] && pair[1] && <div className="swiss-cutoff-score-input">
              <label>{pair[0]}<input aria-label={`Punkte ${pair[0]}`} type="number" inputMode="numeric" min="0" step="1" value={pointsA} onChange={(event) => setPointsA(event.target.value)} /></label>
              <span>:</span>
              <label>{pair[1]}<input aria-label={`Punkte ${pair[1]}`} type="number" inputMode="numeric" min="0" step="1" value={pointsB} onChange={(event) => setPointsB(event.target.value)} /></label>
            </div>}
            <div className="actions">
              <button type="button" className="btn primary" disabled={!validScore} onClick={submitSet}>Ergebnis bestätigen</button>
              {played.length === 0
                ? <button type="button" className="btn" onClick={() => setChosenMode(null)}>Zurück zur Auswahl</button>
                : <button type="button" className="btn" onClick={() => { onReset(); setChosenMode(null); setPointsA(''); setPointsB(''); setError(''); }}>Stichentscheid neu beginnen</button>}
            </div>
            {status.tie.players.length > 2 && <p className="muted">Bei mehreren Gleichplatzierten wird so lange ein weiterer Stichentscheid gespielt, bis nur noch die verfügbaren Qualifikationsplätze übrig sind.</p>}
          </div>
        )}

        {mode === 'LOT' && (
          <div className="swiss-cutoff-mode">
            <h3>Losentscheid vor Ort</h3>
            <p>Die Auslosung findet <strong>physisch</strong> statt. Trage anschließend ein, welche {status.tie.slots === 1 ? 'Person' : 'Personen'} das Los gezogen {status.tie.slots === 1 ? 'hat' : 'haben'}. Die Software lost nicht selbst.</p>
            <div className="swiss-cutoff-lot-choices" role="group" aria-label="Ausgeloste Qualifizierte">
              {status.tie.players.map((name) => (
                <label key={name}>
                  <input type="checkbox" checked={selected.includes(name)} onChange={(event) => {
                    setSelected((current) => event.target.checked ? [...current, name] : current.filter((item) => item !== name));
                    setError('');
                  }} />
                  <span>{name}</span>
                </label>
              ))}
            </div>
            <p className="muted">{selected.length} von {status.tie.slots} Qualifikationsplätzen ausgewählt</p>
            <div className="actions">
              <button type="button" className="btn primary" disabled={selected.length !== status.tie.slots} onClick={submitLot}>Losentscheid verbindlich bestätigen</button>
              <button type="button" className="btn" onClick={() => { setChosenMode(null); setSelected([]); setError(''); }}>Zurück zur Auswahl</button>
            </div>
          </div>
        )}
        {error && <p className="field-error" role="alert">{error}</p>}
      </section>
    </div>
  );
}
