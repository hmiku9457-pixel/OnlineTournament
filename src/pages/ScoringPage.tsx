import { useMemo, useState } from 'react';
import type { ChangeEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { MatchSet } from '@/domain/types';
import { SetBySetEntry } from '@/components/SetBySetEntry';
import { buildSwissStandings } from '@/services/mockCompetitionViews';
import {
  confirmMockMatchSide,
  findMockRuntimeMatch,
  getMockMatchConfirmation,
  getMockMatchCode,
  verifyMockMatchCode,
} from '@/services/mockRuntime';

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

export function ScoringPage() {
  const { matchId } = useParams();
  const navigate = useNavigate();
  const runtime = useMemo(() => findMockRuntimeMatch(matchId), [matchId]);
  const existing = matchId ? getMockMatchConfirmation(matchId) : undefined;
  const [unlocked, setUnlocked] = useState(false);
  const [matchCode, setMatchCode] = useState('');
  const [codeA, setCodeA] = useState('');
  const [codeB, setCodeB] = useState('');
  const [codeError, setCodeError] = useState('');
  const [completed, setCompleted] = useState(runtime?.match.status === 'FINISHED');
  const [completedSets, setCompletedSets] = useState<MatchSet[]>(runtime?.match.sets ?? existing?.sets ?? []);
  const [confirmedA, setConfirmedA] = useState(Boolean(existing?.confirmedA));
  const [confirmedB, setConfirmedB] = useState(Boolean(existing?.confirmedB));
  const sideA = runtime?.match.sideA ?? 'Müller';
  const sideB = runtime?.match.sideB ?? 'Schmidt';
  const bestOf = runtime?.match.bestOf ?? 3;
  const resultSets = completedSets.length ? completedSets : (existing?.sets ?? runtime?.match.sets ?? []);
  const wins = winsFromSets(resultSets);
  const stage = runtime?.tournament.stages.find((item) => item.id === runtime.match.stageId);
  const swissRecords = stage?.type === 'SWISS' && runtime
    ? new Map(buildSwissStandings(runtime.tournament, stage).map((row) => [row.name, `${row.wins}:${row.losses}`]))
    : new Map<string, string>();

  function confirm(side: 'A' | 'B') {
    if (!matchId) return;
    if (!confirmMockMatchSide(matchId, side, side === 'A' ? codeA : codeB)) {
      setCodeError(`Spielercode von ${side === 'A' ? sideA : sideB} ungültig.`);
      return;
    }
    setCodeError('');
    if (side === 'A') setConfirmedA(true);
    else setConfirmedB(true);
  }

  function unlock() {
    if (!matchId || !verifyMockMatchCode(matchId, matchCode)) {
      setCodeError('Falscher Match-Code. Bitte den Code aus der Spieleransicht verwenden.');
      return;
    }
    setCodeError('');
    setUnlocked(true);
  }

  if (!runtime) {
    return (
      <section className="score-grid standalone-score-grid">
        <div className="card">
          <button className="btn small" type="button" onClick={() => navigate(-1)}>← Zurück</button>
          <h1>Spiel nicht gefunden</h1>
          <p className="muted">Das ausgewählte Mock-Spiel ist aktuell nicht verfügbar.</p>
        </div>
      </section>
    );
  }

  if (!unlocked && !completed) {
    return (
      <section className="score-grid standalone-score-grid">
        <div className="card">
          <div className="standalone-back-row">
            <button className="btn small" type="button" onClick={() => navigate(-1)}>← Zurück</button>
          </div>
          <div className="control-kicker">Tablet am Tisch</div>
          <h1>Ergebniseingabe</h1>
          <p className="muted">{sideA} – {sideB} · {runtime.match.table} · Best-of-{bestOf}</p>
          <div className="field">
            <label htmlFor="matchCode">Gemeinsamer Spielcode</label>
            <input
              className="code-box"
              id="matchCode"
              value={matchCode}
              maxLength={8}
              placeholder="z. B. A7K2"
              onChange={(e: ChangeEvent<HTMLInputElement>) => setMatchCode(e.target.value.toUpperCase())}
              onKeyDown={(event) => {
                if (event.key === 'Enter') unlock();
              }}
            />
          </div>
          <p className="field-hint">Testcode dieser Partie: <strong>{matchId ? getMockMatchCode(matchId) : '–'}</strong> (nur lokaler Prototyp)</p>
          {codeError && <p className="field-error" role="alert">{codeError}</p>}
          <div className="actions" style={{ marginTop: 16 }}>
            <button className="btn primary" disabled={!matchCode.trim()} onClick={unlock}>Freischalten</button>
            <Link className="btn" to={`/player/${runtime.tournament.id}`}>Spieleransicht</Link>
          </div>
        </div>
      </section>
    );
  }

  if (completed) {
    return (
      <section className="score-grid standalone-score-grid">
        <div className="card score-finished-card">
          <div className="standalone-back-row">
            <button className="btn small" type="button" onClick={() => navigate(-1)}>← Zurück</button>
          </div>
          <span className="badge ready">SPIEL ABGESCHLOSSEN</span>
          <h1>{sideA}{swissRecords.get(sideA) && <span className="swiss-record">{swissRecords.get(sideA)}</span>} – {sideB}{swissRecords.get(sideB) && <span className="swiss-record">{swissRecords.get(sideB)}</span>}</h1>
          <div className="finished-score">{wins.a} : {wins.b}</div>
          <p className="score-waiting-message">Wartet auf nächste Partie.</p>
          <div className="completed-set-list">
            {resultSets.map((set) => (
              <span key={set.number}>Satz {set.number}: {set.sideAScore}:{set.sideBScore}</span>
            ))}
          </div>
        </div>

        <div className="card">
          <h2>Ergebnis bestätigen</h2>
          <p className="muted">Jede Seite bestätigt separat mit dem eigenen Spielercode. Die Partie ist bereits abgeschlossen; die Bestätigung sichert das Ergebnis zusätzlich ab.</p>
          <div className="confirmation-grid">
            <div className={confirmedA ? 'confirmation-side confirmed' : 'confirmation-side'}>
              <strong>{sideA}</strong>
              <input className="code-box" aria-label={`Spielercode ${sideA}`} placeholder="Spielercode" value={codeA} onChange={(event) => setCodeA(event.target.value)} disabled={confirmedA} />
              <button className="btn" type="button" onClick={() => confirm('A')} disabled={confirmedA}>{confirmedA ? 'Bestätigt ✓' : 'Bestätigen'}</button>
            </div>
            <div className={confirmedB ? 'confirmation-side confirmed' : 'confirmation-side'}>
              <strong>{sideB}</strong>
              <input className="code-box" aria-label={`Spielercode ${sideB}`} placeholder="Spielercode" value={codeB} onChange={(event) => setCodeB(event.target.value)} disabled={confirmedB} />
              <button className="btn" type="button" onClick={() => confirm('B')} disabled={confirmedB}>{confirmedB ? 'Bestätigt ✓' : 'Bestätigen'}</button>
            </div>
          </div>
          {codeError && <p className="field-error" role="alert">{codeError}</p>}
          {confirmedA && confirmedB && <div className="score-confirmed-banner">Ergebnis vollständig bestätigt ✓</div>}
        </div>
      </section>
    );
  }

  return (
    <section className="score-grid standalone-score-grid">
      <div className="card score-match-head">
        <div className="standalone-back-row">
          <button className="btn small" type="button" onClick={() => navigate(-1)}>← Zurück</button>
        </div>
        <div><span className="badge live">LIVE</span><span className="score-table-label">{runtime.match.table}</span></div>
        <h1>{sideA}{swissRecords.get(sideA) && <span className="swiss-record">{swissRecords.get(sideA)}</span>} – {sideB}{swissRecords.get(sideB) && <span className="swiss-record">{swissRecords.get(sideB)}</span>}</h1>
        <p className="muted">Best-of-{bestOf} · Satzweise Eingabe: <strong>7</strong> = 11:7, <strong>-7</strong> = 7:11. Jeden Satz mit Enter oder dem Satz-Button bestätigen.</p>
      </div>

      <div className="card compact-set-entry">
        <div className="control-section-head"><h2>Satzweise Ergebniseingabe</h2><span className="badge">BO{bestOf}</span></div>
        <SetBySetEntry
          match={runtime.match}
          sideARecord={swissRecords.get(sideA)}
          sideBRecord={swissRecords.get(sideB)}
          onCompleted={(sets) => {
            setCompletedSets(sets);
            setCompleted(true);
          }}
        />
      </div>
    </section>
  );
}
