import type { VenueLayout } from '@/domain/venueLayout';
import { displayVenueName, getVenueTerminology } from '@/domain/venueTerminology';
import type { MockRuntimeMatch } from '@/services/mockRuntime';

interface TournamentHallViewProps {
  layout: VenueLayout;
  matchesByTable: Map<string, MockRuntimeMatch>;
  blockedTables: Set<string>;
  selectedTable: string | null;
  canAssign: boolean;
  sport: string;
  onSelectTable: (table: string) => void;
  onAssignToTable: (matchId: string, table: string) => boolean;
}

export function TableStateLegend({ sport }: { sport: string }) {
  const venue = getVenueTerminology(sport);
  return (
    <div className="tournament-hall-legend" aria-label="Legende der Spielflächenzustände">
      <span className="hall-legend-item running">Laufendes Spiel</span>
      <span className="hall-legend-item free">{venue.free}</span>
      <span className="hall-legend-item locked">{venue.locked}</span>
    </div>
  );
}

/** The plan uses fixed-width, readable tiles; large halls scroll rather than shrink. */
export function TournamentHallView({
  layout, matchesByTable, blockedTables, selectedTable, canAssign, sport, onSelectTable, onAssignToTable,
}: TournamentHallViewProps) {
  const venue = getVenueTerminology(sport);
  return (
    <div className="tournament-hall">
      <p className="muted tournament-hall-hint">{venue.singular} auswählen, um Ergebnis und Zuweisung zu bearbeiten. Wartende Spiele können per Drag & Drop auf freie Spielflächen gezogen werden. Bei breiten Plänen horizontal scrollen.</p>
      <div className="tournament-hall-scroller" role="region" aria-label="Spielflächenplan" tabIndex={0}>
        <div className="tournament-hall-plan">
          {layout.deskDock === 'top' && <div className="tournament-hall-desk outside">Turnierleitung</div>}
          <div className="tournament-hall-row">
            {layout.deskDock === 'left' && <div className="tournament-hall-desk outside side">TL</div>}
            <div className="tournament-hall-grid" style={{ gridTemplateColumns: `repeat(${layout.columns}, 162px)` }}>
              {layout.cells.map((cell, index) => {
                if (cell.startsWith('table:')) {
                  const table = `Tisch ${cell.slice(6)}`;
                  const displayName = displayVenueName(sport, table);
                  const match = matchesByTable.get(table);
                  const blocked = blockedTables.has(table);
                  const selected = selectedTable === table;
                  return (
                    <button
                      type="button"
                      key={index}
                      className={`tournament-hall-table ${match ? 'running' : blocked ? 'locked' : 'free'}${selected ? ' selected' : ''}`}
                      aria-pressed={selected}
                      aria-label={`${displayName}, ${match ? `${match.sideA} gegen ${match.sideB}, ${match.score || 'noch kein Ergebnis'}` : blocked ? 'gesperrt' : 'frei'}. Details öffnen`}
                      onClick={() => onSelectTable(table)}
                      onDragOver={(event) => { if (canAssign && !match && !blocked) event.preventDefault(); }}
                      onDrop={(event) => {
                        if (!canAssign || match || blocked) return;
                        event.preventDefault();
                        const matchId = event.dataTransfer.getData('text/mock-match-id');
                        if (matchId && onAssignToTable(matchId, table)) onSelectTable(table);
                      }}
                    >
                      <span className="tournament-hall-table-head"><strong>{displayName}</strong><span>{match ? 'läuft' : blocked ? 'gesperrt' : 'frei'}</span></span>
                      {match ? (
                        <span className="tournament-hall-match">
                          <span title={match.sideA}>{match.sideA}</span>
                          <strong className="tournament-hall-score">{match.score && match.score !== '–' ? match.score : '– : –'}</strong>
                          <span title={match.sideB}>{match.sideB}</span>
                        </span>
                      ) : <span className="tournament-hall-empty">{blocked ? 'Keine Zuweisung' : 'Spiel zuweisen'}</span>}
                    </button>
                  );
                }
                return <div key={index} aria-hidden="true" className={`tournament-hall-space ${cell === 'desk' ? 'desk' : cell === 'space' ? 'walkway' : ''}`}>{cell === 'desk' ? 'TL' : ''}</div>;
              })}
            </div>
            {layout.deskDock === 'right' && <div className="tournament-hall-desk outside side">TL</div>}
          </div>
          {layout.deskDock === 'bottom' && <div className="tournament-hall-desk outside">Turnierleitung</div>}
        </div>
      </div>
    </div>
  );
}
