import { useState } from 'react';
import { getVenueTerminology } from '@/domain/venueTerminology';
import {
  dockVenueDesk,
  placeVenueCell,
  resizeVenueLayout,
  type VenueCell,
  type VenueLayout,
  type DeskDock,
} from '@/domain/venueLayout';

const dockPositions: { value: DeskDock; label: string; description: string }[] = [
  { value: 'top', label: 'TL oben', description: 'Turnierleitung oberhalb des Spielplans' },
  { value: 'right', label: 'TL rechts', description: 'Turnierleitung rechts neben dem Spielplan' },
  { value: 'bottom', label: 'TL unten', description: 'Turnierleitung unterhalb des Spielplans' },
  { value: 'left', label: 'TL links', description: 'Turnierleitung links neben dem Spielplan' },
  { value: 'none', label: 'Ohne TL-Dock', description: 'Keine Turnierleitung außerhalb des Spielplans' },
];

function tileLabel(token: VenueCell, compact: boolean, sport: string) {
  if (token === 'desk') return compact ? 'TL' : 'Turnierleitung';
  if (token === 'space') return compact ? '·' : 'Freifläche';
  if (token.startsWith('table:')) return compact ? token.slice(6) : `${getVenueTerminology(sport).singular} ${token.slice(6)}`;
  return '';
}

function HallGrid({ layout, compact, selected, onPlace, onSelect, sport }: {
  layout: VenueLayout;
  sport: string;
  compact: boolean;
  selected?: VenueCell | null;
  onPlace?: (index: number, source?: VenueCell) => void;
  onSelect?: (value: VenueCell) => void;
}) {
  // Render at most about 1,200 interactive cells. Large venues are divided
  // into contiguous navigable row windows, preserving all absolute cell IDs.
  const windowed = layout.cells.length > 1200;
  const rowsPerPage = windowed ? Math.max(1, Math.floor(1200 / layout.columns)) : layout.rows;
  const [selectedPage, setSelectedPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil(layout.rows / rowsPerPage));
  const page = Math.max(0, Math.min(selectedPage, totalPages - 1));
  const firstRow = page * rowsPerPage;
  const lastRow = Math.min(layout.rows, firstRow + rowsPerPage);
  const firstIndex = firstRow * layout.columns;
  const visibleCells = layout.cells.slice(firstIndex, lastRow * layout.columns);
  return (
    <div className={compact ? 'hall-plan-scroller compact' : 'hall-plan-scroller'}>
      <div className={`hall-plan-wrap ${compact ? 'compact' : ''}`}>
        {layout.deskDock === 'top' && <div className="hall-desk-outside top">TL</div>}
        <div className="hall-grid-center">
          {layout.deskDock === 'left' && <div className="hall-desk-outside side">TL</div>}
          <div className="hall-grid" style={{ gridTemplateColumns: `repeat(${layout.columns}, minmax(${compact ? 12 : 62}px, 1fr))` }}>
            {visibleCells.map((token, offset) => {
              const index = firstIndex + offset;
              return (
              <button
                key={index}
                type="button"
                title={tileLabel(token, false, sport) || 'Freier Rasterplatz'}
                className={`hall-cell ${token.startsWith('table:') ? 'table-cell' : token === 'desk' ? 'desk-cell' : token === 'space' ? 'space-cell' : 'blank-cell'} ${selected && token === selected ? 'selected' : ''}`}
                disabled={!onPlace}
                draggable={Boolean(onPlace && token && token !== 'space')}
                onDragStart={(event) => { event.dataTransfer.setData('text/venue-token', token); event.dataTransfer.effectAllowed = 'move'; }}
                onDragOver={(event) => { if (onPlace) event.preventDefault(); }}
                onDrop={(event) => { event.preventDefault(); const raw = event.dataTransfer.getData('text/venue-token') as VenueCell; if (raw && onPlace) onPlace(index, raw); }}
                onClick={() => {
                  if (!onPlace) return;
                  if (selected !== null) onPlace(index);
                  else if (token && onSelect) onSelect(token);
                }}
              >{tileLabel(token, compact, sport)}</button>
            ); })}
          </div>
          {layout.deskDock === 'right' && <div className="hall-desk-outside side">TL</div>}
        </div>
        {layout.deskDock === 'bottom' && <div className="hall-desk-outside bottom">TL</div>}
        {windowed && <nav className="hall-grid-page-navigation" aria-label="Reihen des Hallenplans">
          <button type="button" className="btn small" disabled={page === 0}
            onClick={() => setSelectedPage(Math.max(0, page - 1))}>Vorherige Reihen</button>
          <span role="status">Reihen {firstRow + 1}–{lastRow} von {layout.rows} · Seite {page + 1}/{totalPages}</span>
          <button type="button" className="btn small" disabled={page >= totalPages - 1}
            onClick={() => setSelectedPage(Math.min(totalPages - 1, page + 1))}>Nächste Reihen</button>
        </nav>}
      </div>
    </div>
  );
}

type VenuePreset = 'rows' | 'line' | 'aisle' | 'square';

/** Simple layouts are easier to start with than an oversized empty raster. */
export function makeVenuePreset(tableCount: number, deskDock: DeskDock, preset: VenuePreset): VenueLayout {
  const count = Math.max(1, Math.trunc(tableCount));
  const squareSide = Math.ceil(Math.sqrt(count));
  // Larger halls retain the central aisle, but use compact banks of rows
  // instead of two extremely wide rows separated by empty space.
  const compactAisle = preset === 'aisle' && count > 80;
  const wingColumns = Math.ceil(Math.sqrt(count / 2));
  const columns = compactAisle ? wingColumns * 2 + 1
    : preset === 'square' ? squareSide : preset === 'line' ? count : Math.max(2, Math.ceil(count / 2));
  const rows = compactAisle ? Math.ceil(count / (wingColumns * 2))
    : preset === 'square' ? squareSide : preset === 'line' ? 1 : preset === 'aisle' ? 3 : 2;
  const cells: VenueCell[] = Array.from({ length: columns * rows }, () => '');
  for (let index = 0; index < count; index += 1) {
    const row = compactAisle ? Math.floor(index / (wingColumns * 2))
      : preset === 'square' ? Math.floor(index / columns)
        : preset === 'line' || index < columns ? 0 : (preset === 'aisle' ? 2 : 1);
    const withinBank = index % (wingColumns * 2);
    const column = compactAisle ? withinBank + (withinBank >= wingColumns ? 1 : 0) : index % columns;
    cells[row * columns + column] = `table:${index + 1}`;
  }
  return { columns, rows, cells, deskDock };
}

export function VenueLayoutEditor({ layout, tableCount, sport, onChange }: {
  layout: VenueLayout;
  tableCount: number;
  sport: string;
  onChange: (layout: VenueLayout) => void;
}) {
  const [selected, setSelected] = useState<VenueCell | null>(null);
  const venue = getVenueTerminology(sport);
  const MIN_SIZE = 1;
  // Manual grids must stay editable even when the venue is larger than 100×40.
  const MAX_COLUMNS = Math.max(100, tableCount, layout.columns);
  const MAX_ROWS = Math.max(40, tableCount, layout.rows);
  // Beim Verkleinern müssen alle Tische und ggf. die Turnierleitung im Raster Platz behalten.
  const requiredCells = tableCount + (layout.cells.includes('desk') ? 1 : 0);
  const canRemoveColumn = layout.columns > MIN_SIZE && (layout.columns - 1) * layout.rows >= requiredCells;
  const canRemoveRow = layout.rows > MIN_SIZE && layout.columns * (layout.rows - 1) >= requiredCells;

  function adjustGrid(columns: number, rows: number) {
    if (columns < MIN_SIZE || columns > MAX_COLUMNS || rows < MIN_SIZE || rows > MAX_ROWS) return;
    if (columns * rows < requiredCells) return;
    onChange(resizeVenueLayout(layout, columns, rows, tableCount));
  }

  function place(target: number, source?: VenueCell) {
    const token = source ?? selected;
    if (!token) return;
    onChange(placeVenueCell(layout, token, target));
    setSelected(null);
  }
  return (
    <div className="hall-editor">
      <div className="hall-editor-intro">
        <div>
          <strong>Aufbau auswählen</strong>
          <p>Wähle einen Ausgangspunkt oder verschiebe die {venue.plural} anschließend direkt im Plan.</p>
        </div>
        <div className="hall-editor-presets" role="group" aria-label="Vorlage für die Spielflächenanordnung">
          <button type="button" className="btn small" onClick={() => { onChange(makeVenuePreset(tableCount, layout.deskDock, 'square')); setSelected(null); }}>Quadrat</button>
          {tableCount <= 80 && <button type="button" className="btn small" onClick={() => { onChange(makeVenuePreset(tableCount, layout.deskDock, 'rows')); setSelected(null); }}>Zwei Reihen</button>}
          <button type="button" className="btn small" onClick={() => { onChange(makeVenuePreset(tableCount, layout.deskDock, 'aisle')); setSelected(null); }}>Mit Mittelgang</button>
          {tableCount <= 40 && <button type="button" className="btn small" onClick={() => { onChange(makeVenuePreset(tableCount, layout.deskDock, 'line')); setSelected(null); }}>Eine Reihe</button>}
        </div>
      </div>
      <div className="hall-editor-toolrow">
        <div className="hall-editor-tools">
          <button type="button" className={`btn small ${selected === 'space' ? 'primary' : ''}`} aria-pressed={selected === 'space'} onClick={() => setSelected((old) => old === 'space' ? null : 'space')}>Freifläche markieren</button>
          <button type="button" className={`btn small ${selected === 'desk' ? 'primary' : ''}`} aria-pressed={selected === 'desk'} onClick={() => setSelected((old) => old === 'desk' ? null : 'desk')}>TL in Spielplan setzen</button>
          <div className="hall-editor-dock-actions" role="group" aria-label="TL-Docking außerhalb des Spielplans">
            {dockPositions.map(({ value, label, description }) => (
              <button key={value} type="button"
                className={`btn small hall-editor-dock-button ${layout.deskDock === value ? 'is-active' : ''}`}
                aria-label={description} title={description} aria-pressed={layout.deskDock === value}
                onClick={() => { onChange(dockVenueDesk(layout, value)); setSelected(null); }}>
                {label}
              </button>
            ))}
          </div>
          {selected !== null && <button type="button" className="btn small" onClick={() => setSelected(null)}>Auswahl aufheben</button>}
        </div>
        <span className="hall-editor-tl-hint">TL = Turnierleitung</span>
      </div>
      <div className="hall-editor-grid-controls" role="group" aria-label="Rastergröße ändern">
        <div className="hall-editor-stepper">
          <span className="hall-editor-stepper-label">Spalten</span>
          <div className="hall-editor-stepper-actions">
            <button type="button" aria-label="Spalte entfernen" title="Spalte entfernen"
              disabled={!canRemoveColumn} onClick={() => adjustGrid(layout.columns - 1, layout.rows)}>−</button>
            <output aria-label="Anzahl Spalten">{layout.columns}</output>
            <button type="button" aria-label="Spalte hinzufügen" title="Spalte hinzufügen"
              disabled={layout.columns >= MAX_COLUMNS} onClick={() => adjustGrid(layout.columns + 1, layout.rows)}>+</button>
          </div>
        </div>
        <div className="hall-editor-stepper">
          <span className="hall-editor-stepper-label">Reihen</span>
          <div className="hall-editor-stepper-actions">
            <button type="button" aria-label="Reihe entfernen" title="Reihe entfernen"
              disabled={!canRemoveRow} onClick={() => adjustGrid(layout.columns, layout.rows - 1)}>−</button>
            <output aria-label="Anzahl Reihen">{layout.rows}</output>
            <button type="button" aria-label="Reihe hinzufügen" title="Reihe hinzufügen"
              disabled={layout.rows >= MAX_ROWS} onClick={() => adjustGrid(layout.columns, layout.rows + 1)}>+</button>
          </div>
        </div>
        <span className="hall-editor-grid-size">Raster: {layout.columns} × {layout.rows}</span>
      </div>
      <div className="hall-editor-canvas">
        <HallGrid layout={layout} sport={sport} compact={false} selected={selected} onPlace={place} onSelect={setSelected} />
      </div>
      <p className="hall-editor-hint">
        {selected === 'space' ? 'Klicke auf ein freies Feld, um eine Freifläche zu markieren oder zu entfernen.' :
          selected === 'desk' ? 'Klicke auf ein leeres Feld, um die Turnierleitung zu platzieren.' :
          `Klicke zuerst auf ${venue.singular === 'Spielfeld' ? 'ein Spielfeld' : `einen ${venue.singular}`} und dann auf das Zielfeld – oder ziehe es mit der Maus.`}
        {' '}Belegte Felder werden getauscht.
      </p>
    </div>
  );
}

export function VenueLayoutMini({ layout, sport }: { layout: VenueLayout; sport: string }) {
  return (
    <div className="hall-mini">
      <div className="hall-mini-legend"><span>■ {getVenueTerminology(sport).singular}</span><span>▤ Turnierleitung</span><span>· Freifläche</span></div>
      <HallGrid layout={layout} sport={sport} compact />
    </div>
  );
}
