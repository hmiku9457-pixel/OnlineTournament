interface SwissBuchholzHelpModalProps {
  rounds: number;
  onClose: () => void;
}

/** Erklärung der tatsächlich verwendeten Schweizer Buchholz-Formel. */
export function SwissBuchholzHelpModal({ rounds, onClose }: SwissBuchholzHelpModalProps) {
  const exampleRounds = Math.max(1, rounds);
  const virtualByeLimit = exampleRounds / 2;
  const format = (value: number) => value.toLocaleString('de-DE', { maximumFractionDigits: 1 });

  return (
    <div className="prototype-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="prototype-modal swiss-bhz-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="swiss-bhz-modal-title"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); onClose(); } }}
      >
        <div className="player-games-modal-head">
          <div>
            <span className="badge">SCHWEIZER SYSTEM</span>
            <h2 id="swiss-bhz-modal-title">Was ist die Buchholzzahl (BHZ)?</h2>
          </div>
          <button type="button" className="btn small" onClick={onClose} autoFocus>Schließen</button>
        </div>

        <p>Die Buchholzzahl misst, wie stark die bisherigen Gegner eines Spielers sind. Bei gleicher eigener Wertung wird der Spieler mit der höheren BHZ vorgezogen.</p>

        <h3>So wird die BHZ berechnet</h3>
        <ol className="swiss-bhz-explanation-steps">
          <li>Jeder Sieg zählt für die BHZ-Berechnung als <strong>1 Wertungspunkt</strong>, jedes Unentschieden als <strong>0,5</strong>, eine Niederlage als <strong>0</strong>.</li>
          <li>Für jede tatsächlich gespielte Partie werden die bisherigen Gesamtwertungspunkte des jeweiligen Gegners addiert. Derselbe Gegner zählt bei mehreren Begegnungen entsprechend mehrfach.</li>
          <li>Die Summe ergibt die <strong>Buchholzzahl</strong>. Beispiel: Gegner mit 4, 3 und 2,5 Punkten ergeben eine BHZ von <strong>9,5</strong>.</li>
        </ol>

        <div className="swiss-bhz-exception">
          <h3>Freilose und kampflose Partien</h3>
          <p>Damit ein ausgefallenes Spiel die BHZ nicht auf null setzt, verwendet unsere Turnierwertung virtuelle Gegnerwerte:</p>
          <ul>
            <li><strong>Freilos:</strong> Es zählt der kleinere Wert aus den eigenen Wertungspunkten und der halben Zahl geplanter Runden. Bei {exampleRounds} Runden liegt die Obergrenze deshalb bei {format(virtualByeLimit)} pro Freilos.</li>
            <li><strong>Kampfloses Spiel:</strong> Es zählt der kleinere Wert aus den eigenen Wertungspunkten und denen des zugelosten Gegners. Das gilt für beide beteiligten Spieler.</li>
          </ul>
          <p className="muted">Diese Ersatzwerte betreffen nur die BHZ. Siege, Niederlagen sowie Satz- und Ballstatistiken werden separat gewertet.</p>
        </div>
        <p className="muted swiss-bhz-footnote">Hinweis: Bei der BHZ gelten für alle Sportarten 1 / 0,5 / 0 Wertungspunkte, auch wenn in anderen Tabellenspalten andere Punktesysteme verwendet werden. Dies ist die für OnlineTournament hinterlegte Variante.</p>
      </section>
    </div>
  );
}
