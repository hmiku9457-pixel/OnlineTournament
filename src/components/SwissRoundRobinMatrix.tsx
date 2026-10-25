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
  const scoreSport = sportScoring(sport).mode === 'score';
  const fixtures = rounds.flatMap((round, roundIndex) => round.kind === 'ROUND_ROBIN'
    ? round.matches.map((match, index) => ({
      ...match, game: matches.find((game) => game.id.endsWith(`-sw-playoff-r${roundIndex + 1}-m${index + 1}`)),
    })) : []);

  return <div className="card swiss-intermediate-matrix">
    <div className="swiss-intermediate-matrix-head">
      <h4>Kreuztabelle</h4>
      <span className="muted">Ergebnisse aus Sicht des Zeilenspielers</span>
    </div>
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
                  score: scoreSport ? `${a}:${b}` : `${a > b ? 1 : 0}:${b > a ? 1 : 0}`,
                  points: `${a}:${b}`,
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
              const label = `${rowName} gegen ${columnName}: ${score || (live ? 'läuft' : 'noch offen')}`
                + (!scoreSport && scores.length ? ` (Satzpunkte ${scores.map((item) => item.points).join(', ')})` : '');
              return <td key={columnName} className={`swiss-matrix-result ${status}${live && !scores.length ? ' live' : ''}`} title={label}>
                {editable?.game && onEditResult
                  ? <button type="button" aria-label={`${label} – Ergebnis öffnen`} onClick={() => onEditResult(editable.game!.id)}>
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
  </div>;
}
