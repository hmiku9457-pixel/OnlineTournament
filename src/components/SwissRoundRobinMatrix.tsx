import { useState } from 'react';
import { sportScoring } from '@/domain/sportScoring';
import type { PlayoffRound } from '@/domain/swissCutoffPlayoff';
import type { MockRuntimeMatch } from '@/services/mockRuntime';

interface Props {
  players: readonly string[];
  rounds: readonly PlayoffRound[];
  sport: string;
  matches?: readonly MockRuntimeMatch[];
  onEditResult?: (id: string) => void;
}

/** Head-to-head matrix. Every cell shows the match from the perspective of
 * its row player; diagonal cells represent impossible self-matches. */
export function SwissRoundRobinMatrix({ players, rounds, sport, matches = [], onEditResult }: Props) {
  const [expanded, setExpanded] = useState(false);
  const fixtures = rounds.flatMap((round, roundIndex) => round.kind === 'ROUND_ROBIN'
    ? round.matches.map((match, index) => ({
      ...match, game: matches.find((game) => game.id.endsWith(`-sw-playoff-r${roundIndex + 1}-m${index + 1}`)),
    })) : []);

  // Use one table renderer for both the compact card and large modal.
  // Changes to fixtures/results appear identically in both views.
  const renderTable = (large = false) => (
    <>
    <div className="swiss-intermediate-matrix-scroll">
      <table className="swiss-intermediate-matrix-table">
        <thead>
          <tr>
            <th scope="col" className="swiss-matrix-name">Teilnehmer</th>
            {players.map((name, index) => <th scope="col" key={name} title={name}>{index + 1}</th>)}
          </tr>
        </thead>
        <tbody>
          {players.map((rowName, rowIndex) => <tr key={rowName}>
            <th scope="row" className="swiss-matrix-name">
              <span className="swiss-matrix-seed">{rowIndex + 1}.</span>
              <span title={rowName}>{rowName}</span>
            </th>
            {players.map((columnName) => {
              if (rowName === columnName) {
                return <td key={columnName} className="swiss-matrix-diagonal" aria-label={`${rowName} gegen sich selbst`}>×</td>;
              }
              const meeting = fixtures.filter((match) => (match.sideA === rowName && match.sideB === columnName)
                || (match.sideA === columnName && match.sideB === rowName));
              const finished = meeting.filter((match) => match.pointsA !== undefined && match.pointsB !== undefined);
              const scores = finished.map((match) => {
                const a = rowName === match.sideA ? match.pointsA! : match.pointsB!;
                const b = rowName === match.sideA ? match.pointsB! : match.pointsA!;
                return {
                  score: `${a}:${b}`,
                  result: a > b ? 'win' : a < b ? 'loss' : 'draw',
                  game: match.game,
                };
              });
              const score = scores.map((item) => item.score).join(' · ');
              const status = scores.some((item) => item.result === 'win') ? 'win'
                : scores.some((item) => item.result === 'loss') ? 'loss' : scores.length ? 'draw' : 'open';
              const live = meeting.some((match) => match.game && ['LIVE', 'READY', 'CONFIRMATION'].includes(match.game.status));
              const editable = meeting.find((match) => match.game && onEditResult
                && ['LIVE', 'READY', 'CONFIRMATION', 'FINISHED'].includes(match.game.status));
              const label = `${rowName} gegen ${columnName}: ${score || (live ? 'läuft' : 'noch offen')}`;
              return <td key={columnName} className={`swiss-matrix-result ${status}${live && !scores.length ? ' live' : ''}`} title={label}>
                {editable?.game && onEditResult
                  ? <button type="button" aria-label={`${label} – Ergebnis öffnen`} onClick={() => { if (large) setExpanded(false); onEditResult(editable.game!.id); }}>
                      {score || (live ? 'Live' : '–')}
                    </button>
                  : <span aria-label={label}>{score || (live ? 'Live' : '–')}</span>}
              </td>;
            })}
          </tr>)}
        </tbody>
      </table>
    </div>
    <p className="muted swiss-matrix-footnote">Die Nummern entsprechen der Reihenfolge in der Entscheidungstabelle.</p>
    </>
  );

  return <>
    <div className="card swiss-intermediate-matrix">
      <div className="swiss-intermediate-matrix-head">
        <div className="swiss-intermediate-matrix-title">
          <h4>Kreuztabelle</h4>
          <span className="muted">{sportScoring(sport).mode === 'sets' ? 'Satzpunkte aus Sicht des Zeilenspielers' : 'Ergebnisse aus Sicht des Zeilenspielers'}</span>
        </div>
        <button type="button" className="btn small swiss-intermediate-expand-button"
          aria-label="Kreuztabelle vergrößern" aria-haspopup="dialog"
          onClick={() => setExpanded(true)} title="Kreuztabelle groß anzeigen">
          <span aria-hidden="true">⛶</span> Vergrößern
        </button>
      </div>
      {renderTable()}
    </div>
    {expanded && (
      <div className="prototype-modal-backdrop swiss-intermediate-matrix-backdrop" role="presentation">
        <section className="prototype-modal swiss-intermediate-matrix-modal" role="dialog" aria-modal="true"
          aria-label="Kreuztabelle – vergrößerte Ansicht"
          onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); setExpanded(false); } }}>
          <div className="swiss-intermediate-matrix-modal-head">
            <div>
              <h2>Kreuztabelle</h2>
              <p className="muted">{sportScoring(sport).mode === 'sets'
                ? 'Alle Entscheidungssätze – Ergebnisse aus Sicht des Zeilenspielers'
                : 'Alle direkten Begegnungen – Ergebnisse aus Sicht des Zeilenspielers'}</p>
            </div>
            <button type="button" className="btn small" autoFocus onClick={() => setExpanded(false)}>Schließen</button>
          </div>
          {renderTable(true)}
        </section>
      </div>
    )}
  </>;
}
