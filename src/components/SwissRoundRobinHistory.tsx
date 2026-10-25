import type { StoredSwissCutoffDecision } from '@/services/mockSwissCutoffStore';
import { playoffScores, type PlayoffRound } from '@/domain/swissCutoffPlayoff';

interface Props {
  phaseNumber: string;
  decision: StoredSwissCutoffDecision;
}

/** Read-only intermediate phase in the tournament timeline. The playoff data
 * are not fixtures of the preceding Swiss stage and do not affect Buchholz. */
export function SwissRoundRobinHistory({ phaseNumber, decision }: Props) {
  const rounds = (decision.extraRounds ?? []).filter((round) => round.kind === 'ROUND_ROBIN');
  const names = [...new Set(rounds.flatMap((round) => round.matches.flatMap((m) => [m.sideA, m.sideB])))];
  const rows = playoffScores(names, rounds as PlayoffRound[]);
  const qualified = new Set(decision.winners ?? []);
  const completed = rounds.length > 0 && rounds.every((round) => round.matches.every((m) =>
    m.pointsA !== undefined && m.pointsB !== undefined));

  return (
    <section className="competition-stage-section swiss-intermediate-stage" aria-label={`Phase ${phaseNumber}: Jeder gegen Jeden`}>
      <div className="competition-stage-head">
        <div><span className="badge">ENTSCHEIDUNGSPHASE</span><h3>Phase {phaseNumber} · Jeder gegen Jeden</h3></div>
        <span className="badge">{completed ? 'Partien abgeschlossen' : 'Entscheidung läuft'}</span>
      </div>
      <p className="muted">Zusätzliche Entscheidung zwischen den im Schweizer System gleichplatzierten Spielern.
        Die Ergebnisse werden separat gewertet und verändern die regulären Schweizer Spiele und die Buchholzzahl nicht.</p>
      <div className="swiss-intermediate-grid">
        <div className="card table-wrap">
          <h4>Entscheidungstabelle</h4>
          <table className="compact-table">
            <thead><tr><th>#</th><th>Teilnehmer</th><th>S</th><th>±</th><th>Ergebnis</th></tr></thead>
            <tbody>
              {rows.map((row, index) => <tr key={row.name}>
                <td>{index + 1}</td>
                <td><strong>{row.name}</strong>{qualified.has(row.name) &&
                  <span className="swiss-intermediate-qualified">Qualifiziert</span>}</td>
                <td>{row.points.toLocaleString('de-DE')}</td>
                <td>{row.difference > 0 ? `+${row.difference}` : row.difference}</td>
                <td>{row.scored}</td>
              </tr>)}
            </tbody>
          </table>
        </div>
        <div className="card swiss-intermediate-matches">
          <h4>Entscheidungsspiele</h4>
          {rounds.map((round, roundIndex) => (
            <div key={roundIndex}>
              {rounds.length > 1 && <strong>Durchgang {roundIndex + 1}</strong>}
              {round.matches.map((match, index) => (
                <div className="swiss-intermediate-game" key={index}>
                  <span>{match.sideA}</span><strong>{match.pointsA === undefined ? 'Offen' : `${match.pointsA} : ${match.pointsB}`}</strong><span>{match.sideB}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
      {!decision.winners?.length && <p className="swiss-cutoff-still-tied">Die Qualifikationsgrenze ist noch nicht eindeutig entschieden; die Turnierleitung trifft eine weitere Entscheidung.</p>}
      {decision.mode === 'LOT' && <p className="muted">Die endgültige Auswahl wurde anschließend durch einen physischen Losentscheid dokumentiert.</p>}
    </section>
  );
}
