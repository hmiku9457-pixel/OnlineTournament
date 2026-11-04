import { useEffect, useState, type CSSProperties } from 'react';
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

/** The hall changes its actual grid dimensions instead of using a CSS transform,
 * keeping button hitboxes and native drag-and-drop coordinates aligned. */
export const HALL_ZOOM_MIN = 70;
export const HALL_ZOOM_MAX = 150;
export const HALL_ZOOM_STEP = 10;

export function clampHallZoom(zoom: number) {
  return Math.max(HALL_ZOOM_MIN, Math.min(HALL_ZOOM_MAX,
    Math.round(zoom / HALL_ZOOM_STEP) * HALL_ZOOM_STEP));
}

// Deliberately not prefixed with "online-tournament:": the canonical tournament
// storage migration clears that namespace in window.localStorage. This is only
// a browser-profile display preference, independent of tournament data.
export const HALL_ZOOM_PREFERENCE_KEY = 'turnierseite:hall-zoom:v1';

export function readHallZoomPreference(): number {
  if (typeof window === 'undefined') return 100;
  try {
    const raw = window.localStorage.getItem(HALL_ZOOM_PREFERENCE_KEY);
    if (raw === null || raw.trim() === '') return 100;
    const value = Number(raw);
    return Number.isFinite(value) ? clampHallZoom(value) : 100;
  } catch {
    // Browser settings may disallow persistent storage.
    return 100;
  }
}

export function saveHallZoomPreference(zoom: number): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(HALL_ZOOM_PREFERENCE_KEY, String(clampHallZoom(zoom)));
  } catch {
    // The current view stays usable even if the preference cannot be stored.
  }
}

/** The plan uses fixed-width, readable tiles; large halls scroll rather than shrink. */
export function TournamentHallView({
  layout, matchesByTable, blockedTables, selectedTable, canAssign, sport, onSelectTable, onAssignToTable,
}: TournamentHallViewProps) {
  const venue = getVenueTerminology(sport);
  const [zoom, setZoom] = useState(readHallZoomPreference);
  useEffect(() => { saveHallZoomPreference(zoom); }, [zoom]);
  return (
    <div className="tournament-hall" style={{ '--hall-zoom': zoom / 100 } as CSSProperties}>
      <div className="tournament-hall-toolbar">
        <p className="muted tournament-hall-hint">{venue.singular} auswählen, um Ergebnis und Zuweisung zu bearbeiten. Wartende Spiele können per Drag & Drop auf freie Spielflächen gezogen werden. Bei breiten Plänen horizontal scrollen.</p>
        <div className="tournament-hall-zoom" role="group" aria-label="Zoom der Planansicht">
          <button type="button" className="btn small" disabled={zoom <= HALL_ZOOM_MIN}
            title="Plan verkleinern" aria-label="Plan verkleinern"
            onClick={() => setZoom((value) => clampHallZoom(value - HALL_ZOOM_STEP))}>−</button>
          <button type="button" className="btn small tournament-hall-zoom-reset"
            title="Auf 100 Prozent zurücksetzen" aria-label={`Zoom ${zoom} Prozent, auf 100 Prozent zurücksetzen`}
            disabled={zoom === 100} onClick={() => setZoom(100)}>{zoom} %</button>
          <button type="button" className="btn small" disabled={zoom >= HALL_ZOOM_MAX}
            title="Plan vergrößern" aria-label="Plan vergrößern"
            onClick={() => setZoom((value) => clampHallZoom(value + HALL_ZOOM_STEP))}>+</button>
        </div>
      </div>
      <div className="tournament-hall-scroller" role="region" aria-label="Spielflächenplan" tabIndex={0}>
        <div className="tournament-hall-plan">
          {layout.deskDock === 'top' && <div className="tournament-hall-desk outside">Turnierleitung</div>}
          <div className="tournament-hall-row">
            {layout.deskDock === 'left' && <div className="tournament-hall-desk outside side">TL</div>}
            <div className="tournament-hall-grid" style={{ gridTemplateColumns: `repeat(${layout.columns}, var(--hall-tile-width))` }}>
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
                        event.stopPropagation();
                        if (matchId) onAssignToTable(matchId, table);
                      }}
                    >
                      <span className="tournament-hall-table-head"><strong>{displayName}</strong><span>{match ? 'läuft' : blocked ? 'gesperrt' : 'frei'}</span></span>
                      {match ? (
                        <span className="tournament-hall-match">
                          <span title={match.sideA}>{match.sideA}</span>
                          <strong className="tournament-hall-score">{match.score && match.score !== '–' ? match.score : '– : –'}</strong>
                          {match.extraTimeProgress && <small className="tournament-hall-extra-time">n.V. · LIVE</small>}
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
