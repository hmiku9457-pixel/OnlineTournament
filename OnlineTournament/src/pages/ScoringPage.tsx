import { useState } from 'react';
import { useParams } from 'react-router-dom';

export function ScoringPage() {
  const { matchId } = useParams();
  const [unlocked, setUnlocked] = useState(false);
  const [matchCode, setMatchCode] = useState('');
  const [sets, setSets] = useState<Array<[number, number]>>([[11, 8], [7, 11]]);

  if (!unlocked) {
    return (
      <section className="score-grid">
        <div className="card">
          <h1>Ergebniseingabe</h1>
          <p className="muted">Match {matchId}</p>
          <div className="field">
            <label htmlFor="matchCode">Gemeinsamer Spielcode</label>
            <input className="code-box" id="matchCode" value={matchCode} maxLength={8} onChange={(e) => setMatchCode(e.target.value.toUpperCase())} />
          </div>
          <div className="actions" style={{ marginTop: 16 }}>
            <button className="btn primary" disabled={!matchCode.trim()} onClick={() => setUnlocked(true)}>Freischalten</button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="score-grid">
      <div className="card">
        <span className="badge live">LIVE</span>
        <h1>Müller – Schmidt</h1>
        <p className="muted">Satzstände werden sofort synchronisiert. Die offizielle Wertung erfolgt nach Bestätigung beider Seiten.</p>
      </div>

      <div className="card">
        <h2>Sätze</h2>
        {sets.map(([a, b], index) => (
          <div className="score-row" key={index}>
            <strong>Satz {index + 1}</strong>
            <input value={a} type="number" onChange={(e) => setSets((current) => current.map((set, i) => i === index ? ([Number(e.target.value), set[1]] as [number, number]) : set))} />
            <span>:</span>
            <input value={b} type="number" onChange={(e) => setSets((current) => current.map((set, i) => i === index ? ([set[0], Number(e.target.value)] as [number, number]) : set))} />
          </div>
        ))}
        <div className="actions" style={{ marginTop: 16 }}>
          <button className="btn" onClick={() => setSets((current) => [...current, [0, 0]])}>Satz hinzufügen</button>
          <button className="btn primary">Live speichern</button>
        </div>
      </div>

      <div className="card">
        <h2>Ergebnis bestätigen</h2>
        <div className="form-grid">
          <div className="field"><label>Spielercode Seite A</label><input className="code-box" /></div>
          <div className="field"><label>Spielercode Seite B</label><input className="code-box" /></div>
        </div>
        <p className="muted">Im Doppel genügt ein gültiger Spielercode pro Seite.</p>
      </div>
    </section>
  );
}
