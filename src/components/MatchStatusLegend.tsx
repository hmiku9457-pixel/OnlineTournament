/** Compact visual key shared by competition and match overviews. */
export function MatchStatusLegend() {
  return (
    <div className="match-status-legend" aria-label="Farblegende der Spiele">
      <span className="match-status-legend-item match-state-finished">Abgeschlossen</span>
      <span className="match-status-legend-item match-state-live">Läuft gerade</span>
      <span className="match-status-legend-item match-state-waiting">Ausstehend</span>
    </div>
  );
}
