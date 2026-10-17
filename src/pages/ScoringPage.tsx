import { useMemo, useState } from 'react';
import type { ChangeEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { findMockRuntimeMatch } from '@/services/mockRuntime';

export function ScoringPage() {
  const { matchId } = useParams();
  const runtime = useMemo(() => findMockRuntimeMatch(matchId), [matchId]);
  const [unlocked, setUnlocked] = useState(false);
  const [matchCode, setMatchCode] = useState('');
  const [sets, setSets] = useState<Array<[number, number]>>([[11, 8], [7, 11]]);
  const [saved, setSaved] = useState(false);
  const [confirmedA, setConfirmedA] = useState(false);
  const [confirmedB, setConfirmedB] = useState(false);
  const sideA = runtime?.match.sideA ?? 'Müller';
  const sideB = runtime?.match.sideB ?? 'Schmidt';

  if (!unlocked) {
    return (
      <section className="score-grid standalone-score-grid">
        <div className="card">
          <div className="control-kicker">Tablet am Tisch</div>
          <h1>Ergebniseingabe</h1>
          <p className="muted">{sideA} – {sideB}{runtime ? ` · ${runtime.match.table}` : ` · Match ${matchId}`}</p>
          <div className="field">
            <label htmlFor="matchCode">Gemeinsamer Spielcode</label>
            <input className="code-box" id="matchCode" value={matchCode} maxLength={8} placeholder="z. B. A7K2" onChange={(e: ChangeEvent<HTMLInputElement>) => setMatchCode(e.target.value.toUpperCase())} />
          </div>
          <div className="actions" style={{ marginTop: 16 }}>
            <button className="btn primary" disabled={!matchCode.trim()} onClick={() => setUnlocked(true)}>Freischalten</button>
            {runtime && <Link className="btn" to={`/player/${runtime.tournament.id}`}>Zur Spieleransicht</Link>}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="score-grid standalone-score-grid">
      <div className="card score-match-head">
        <div><span className="badge live">LIVE</span>{runtime && <span className="score-table-label">{runtime.match.table}</span>}</div>
        <h1>{sideA} – {sideB}</h1>
        <p className="muted">Satzstände können sofort gespeichert werden. Offiziell wird das Ergebnis erst nach Bestätigung beider Seiten.</p>
      </div>

      <div className="card">
        <div className="control-section-head"><h2>Sätze</h2>{saved && <span className="badge ready">Live gespeichert</span>}</div>
        {sets.map(([a, b], index) => (
          <div className="score-row" key={index}>
            <strong>Satz {index + 1}</strong>
            <input value={a} type="number" onChange={(e: ChangeEvent<HTMLInputElement>) => { setSaved(false); setSets((current) => current.map((set, i) => i === index ? ([Number(e.target.value), set[1]] as [number, number]) : set)); }} />
            <span>:</span>
            <input value={b} type="number" onChange={(e: ChangeEvent<HTMLInputElement>) => { setSaved(false); setSets((current) => current.map((set, i) => i === index ? ([set[0], Number(e.target.value)] as [number, number]) : set)); }} />
          </div>
        ))}
        <div className="actions" style={{ marginTop: 16 }}>
          <button className="btn" onClick={() => { setSaved(false); setSets((current) => [...current, [0, 0]]); }}>Satz hinzufügen</button>
          <button className="btn primary" onClick={() => setSaved(true)}>Live speichern</button>
        </div>
      </div>

      <div className="card">
        <h2>Ergebnis bestätigen</h2>
        <p className="muted">Jede Seite bestätigt separat mit einem Spielercode. Im Doppel genügt ein Code pro Seite.</p>
        <div className="confirmation-grid">
          <div className={confirmedA ? 'confirmation-side confirmed' : 'confirmation-side'}>
            <strong>{sideA}</strong>
            <input className="code-box" placeholder="Spielercode" disabled={confirmedA} />
            <button className="btn" type="button" onClick={() => setConfirmedA(true)} disabled={confirmedA}>{confirmedA ? 'Bestätigt ✓' : 'Bestätigen'}</button>
          </div>
          <div className={confirmedB ? 'confirmation-side confirmed' : 'confirmation-side'}>
            <strong>{sideB}</strong>
            <input className="code-box" placeholder="Spielercode" disabled={confirmedB} />
            <button className="btn" type="button" onClick={() => setConfirmedB(true)} disabled={confirmedB}>{confirmedB ? 'Bestätigt ✓' : 'Bestätigen'}</button>
          </div>
        </div>
        {confirmedA && confirmedB && <div className="score-confirmed-banner">Ergebnis vollständig bestätigt. Die Turnierleitung kann es jetzt offiziell werten.</div>}
      </div>
    </section>
  );
}
