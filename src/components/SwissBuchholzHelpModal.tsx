interface SwissBuchholzHelpModalProps {
  rounds: number;
  onClose: () => void;
}

/** Erläutert die Sonneborn-Berger-Wertung der Schweizer Phase.
 * Der Komponentenname bleibt für die bestehenden Aufrufer kompatibel. */
export function SwissBuchholzHelpModal({ rounds, onClose }: SwissBuchholzHelpModalProps) {
  const exampleRounds = Math.max(1, rounds);
  const virtualByeLimit = exampleRounds / 2;
  const format = (value: number) => value.toLocaleString('de-DE', { maximumFractionDigits: 2 });

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
            <h2 id="swiss-bhz-modal-title">Was ist die Sonneborn-Berger-Wertung (SB)?</h2>
          </div>
          <button type="button" className="btn small" onClick={onClose} autoFocus>Schließen</button>
        </div>

        <p>Die <strong>Sonneborn-Berger-Wertung</strong> belohnt Erfolge gegen starke Gegner.
          Bei gleichen eigenen Wertungspunkten steht der Spieler mit der höheren SB-Wertung vorne.
          Im Unterschied zur früheren Buchholzzahl werden <strong>verlorene Spiele nicht als Stärke-Bonus</strong> angerechnet.</p>

        <h3>So wird die SB-Wertung berechnet</h3>
        <ol className="swiss-bhz-explanation-steps">
          <li>Für jeden Spieler werden die bisherigen Wertungspunkte ermittelt:
            <strong> 1 für einen Sieg, 0,5 für ein Unentschieden, 0 für eine Niederlage</strong>.</li>
          <li>Für jeden eigenen <strong>Sieg</strong> wird die aktuelle Gesamtwertung des besiegten Gegners vollständig addiert.
            Für ein <strong>Unentschieden</strong> zählt die Hälfte seiner Gesamtwertung. Bei einer <strong>Niederlage</strong> zählt die Begegnung 0.</li>
          <li>Die gewichteten Gegnerwerte ergeben die SB-Wertung.
            Beispiel: Sieg gegen einen Spieler mit 4 Punkten (4), Remis gegen einen mit 3 Punkten (1,5),
            Niederlage gegen einen mit 5 Punkten (0) ergeben <strong>SB 5,5</strong>.
            Mehrere Begegnungen gegen denselben Gegner zählen jeweils separat.</li>
        </ol>

        <div className="swiss-bhz-exception">
          <h3>Freilose und kampflose Partien</h3>
          <p>Ungespielte Partien erhalten eine begrenzte virtuelle Gegnerwertung:</p>
          <ul>
            <li><strong>Freilos:</strong> Ein Freilos zählt als Sieg. Dafür wird der kleinere Wert aus den eigenen Wertungspunkten
              und der halben Zahl geplanter Schweizer Runden verwendet.
              Bei {exampleRounds} Runden ist dies höchstens <strong>{format(virtualByeLimit)}</strong> SB pro Freilos.</li>
            <li><strong>Kampfloser Sieg:</strong> Als Gegnerwert zählt der kleinere Wert aus den eigenen Wertungspunkten
              und denen des zugelosten Gegners.</li>
            <li><strong>Kampflose Niederlage:</strong> Der Beitrag zur SB-Wertung ist 0.</li>
          </ul>
          <p className="muted">Diese Ersatzwerte verändern nur die SB-Wertung. Siege, Niederlagen sowie Satz- und Ballstatistiken
            werden unabhängig davon erfasst.</p>
        </div>
        <p className="muted swiss-bhz-footnote">Unsere Schweizer Wertung verwendet für die SB-Berechnung immer 1 / 0,5 / 0
          Wertungspunkte je Spiel, auch bei Sportarten mit anderer Tabellenpunktvergabe.
          Die Begrenzung ungespielter Partien orientiert sich an den FIDE-Regeln.</p>
      </section>
    </div>
  );
}
