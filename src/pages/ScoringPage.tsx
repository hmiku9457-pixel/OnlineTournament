import { useMemo, useState } from 'react';
import type { ChangeEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { MatchSet } from '@/domain/types';
import {
  completeMockMatch,
  confirmMockMatchSide,
  findMockRuntimeMatch,
  getMockMatchConfirmation,
} from '@/services/mockRuntime';

function parseShortSet(value: string, number: number): MatchSet | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.includes(':')) {
    const [left, right] = trimmed.split(':').map((part) => Number(part.trim()));
    if (!Number.isFinite(left) || !Number.isFinite(right) || left === right) return null;
    return { number, sideAScore: Math.max(0, left), sideBScore: Math.max(0, right) };
  }
  const numeric = Number(trimmed);
  if (!Number.isFinite(numeric)) return null;
  const loser = Math.abs(Math.trunc(numeric));
  const winner = Math.max(11, loser + 2);
  return numeric >= 0
    ? { number, sideAScore: winner, sideBScore: loser }
    : { number, sideAScore: loser, sideBScore: winner };
}

function setPreview(set: MatchSet | null) {
  return set ? `${set.sideAScore}:${set.sideBScore}` : '–';
}

export function ScoringPage() {
  const { matchId } = useParams();
  const navigate = useNavigate();
  const runtime = useMemo(() => findMockRuntimeMatch(matchId), [matchId]);
  const existing = matchId ? getMockMatchConfirmation(matchId) : undefined;
  const bestOf = runtime?.match.bestOf ?? 3;
  const winsNeeded = Math.ceil(bestOf / 2);
  const [unlocked, setUnlocked] = useState(false);
  const [matchCode, setMatchCode] = useState('');
  const [setInputs, setSetInputs] = useState<string[]>(Array.from({ length: bestOf }, () => ''));
  const [completed, setCompleted] = useState(Boolean(existing?.sets.length));
  const [confirmedA, setConfirmedA] = useState(Boolean(existing?.confirmedA));
  const [confirmedB, setConfirmedB] = useState(Boolean(existing?.confirmedB));
  const sideA = runtime?.match.sideA ?? 'Müller';
  const sideB = runtime?.match.sideB ?? 'Schmidt';
  const parsedSets = setInputs.map((value, index) => parseShortSet(value, index + 1)).filter((set): set is MatchSet => Boolean(set));
  const resultSets = existing?.sets.length ? existing.sets : parsedSets;
  const winsA = resultSets.filter((set) => set.sideAScore > set.sideBScore).length;
  const winsB = resultSets.filter((set) => set.sideBScore > set.sideAScore).length;
  const hasWinner = winsA >= winsNeeded || winsB >= winsNeeded;

  function finishMatch() {
    if (!matchId || !hasWinner) return;
    completeMockMatch(matchId, parsedSets, 'FINISHED');
    setCompleted(true);
  }

  function confirm(side: 'A' | 'B') {
    if (!matchId) return;
    confirmMockMatchSide(matchId, side);
    if (side === 'A') setConfirmedA(true);
    else setConfirmedB(true);
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
          <p className="muted">{sideA} – {sideB}{runtime ? ` · ${runtime.match.table}` : ` · Match ${matchId}`} · Best-of-{bestOf}</p>
          <div className="field">
            <label htmlFor="matchCode">Gemeinsamer Spielcode</label>
            <input className="code-box" id="matchCode" value={matchCode} maxLength={8} placeholder="z. B. A7K2" onChange={(e: ChangeEvent<HTMLInputElement>) => setMatchCode(e.target.value.toUpperCase())} />
          </div>
          <div className="actions" style={{ marginTop: 16 }}>
            <button className="btn primary" disabled={!matchCode.trim()} onClick={() => setUnlocked(true)}>Freischalten</button>
            {runtime && <Link className="btn" to={`/player/${runtime.tournament.id}`}>Spieleransicht</Link>}
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
          <h1>{sideA} – {sideB}</h1>
          <div className="finished-score">{winsA} : {winsB}</div>
          <p className="score-waiting-message">Wartet auf nächste Partie.</p>
          <div className="completed-set-list">
            {resultSets.map((set) => (
              <span key={set.number}>Satz {set.number}: {set.sideAScore}:{set.sideBScore}</span>
            ))}
          </div>
        </div>

        <div className="card">
          <h2>Ergebnis bestätigen</h2>
          <p className="muted">Jede Seite bestätigt separat mit dem eigenen Spielercode. Die Partie gilt bereits als abgeschlossen; die Bestätigung sichert nur das Ergebnis ab.</p>
          <div className="confirmation-grid">
            <div className={confirmedA ? 'confirmation-side confirmed' : 'confirmation-side'}>
              <strong>{sideA}</strong>
              <input className="code-box" placeholder="Spielercode" disabled={confirmedA} />
              <button className="btn" type="button" onClick={() => confirm('A')} disabled={confirmedA}>{confirmedA ? 'Bestätigt ✓' : 'Bestätigen'}</button>
            </div>
            <div className={confirmedB ? 'confirmation-side confirmed' : 'confirmation-side'}>
              <strong>{sideB}</strong>
              <input className="code-box" placeholder="Spielercode" disabled={confirmedB} />
              <button className="btn" type="button" onClick={() => confirm('B')} disabled={confirmedB}>{confirmedB ? 'Bestätigt ✓' : 'Bestätigen'}</button>
            </div>
          </div>
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
        <div><span className="badge live">EINGABE</span>{runtime && <span className="score-table-label">{runtime.match.table}</span>}</div>
        <h1>{sideA} – {sideB}</h1>
        <p className="muted">Best-of-{bestOf} · Eingabe: <strong>7</strong> = 11:7, <strong>-7</strong> = 7:11. Bei 10 wird automatisch 12:10 bzw. 10:12 gerechnet.</p>
      </div>

      <div className="card compact-set-entry">
        <div className="control-section-head"><h2>Sätze</h2><span className="badge">{winsA}:{winsB}</span></div>
        <div className="short-set-grid">
          {setInputs.map((value, index) => {
            const parsed = parseShortSet(value, index + 1);
            const matchAlreadyDecidedBefore = setInputs.slice(0, index).map((item, priorIndex) => parseShortSet(item, priorIndex + 1)).filter((set): set is MatchSet => Boolean(set));
            const previousA = matchAlreadyDecidedBefore.filter((set) => set.sideAScore > set.sideBScore).length;
            const previousB = matchAlreadyDecidedBefore.filter((set) => set.sideBScore > set.sideAScore).length;
            const disabled = previousA >= winsNeeded || previousB >= winsNeeded;
            return (
              <label className={disabled ? 'short-set-entry disabled' : 'short-set-entry'} key={index}>
                <span>Satz {index + 1}</span>
                <input
                  value={value}
                  inputMode="numeric"
                  disabled={disabled}
                  placeholder={index === 0 ? 'z. B. 7 oder -7' : '–'}
                  onChange={(event) => setSetInputs((current) => current.map((item, itemIndex) => itemIndex === index ? event.target.value : item))}
                />
                <strong>{setPreview(parsed)}</strong>
              </label>
            );
          })}
        </div>
        <button className="btn primary score-finish-button" type="button" onClick={finishMatch} disabled={!hasWinner}>Spiel abschließen</button>
        {!hasWinner && <p className="field-hint">{winsNeeded} gewonnene {winsNeeded === 1 ? 'Satz' : 'Sätze'} werden für dieses Best-of benötigt.</p>}
      </div>
    </section>
  );
}
