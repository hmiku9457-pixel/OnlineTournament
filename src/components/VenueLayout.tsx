import { useState } from 'react';
import {
  createVenueLayout,
  dockVenueDesk,
  placeVenueCell,
  resizeVenueLayout,
  type VenueCell,
  type VenueLayout,
  type DeskDock,
} from '@/domain/venueLayout';

const dockNames: Record<DeskDock, string> = {
  none: 'Kein Außen-Dock', top: 'Oben', right: 'Rechts', bottom: 'Unten', left: 'Links',
};

function tileLabel(token: VenueCell, compact: boolean) {
  if (token === 'desk') return compact ? 'TL' : 'Turnierleitung';
  if (token === 'space') return compact ? '·' : 'Freifläche';
  if (token.startsWith('table:')) return compact ? token.slice(6) : `Tisch ${token.slice(6)}`;
  return '';
}

function HallGrid({ layout, compact, selected, onPlace, onSelect }: {
  layout: VenueLayout;
  compact: boolean;
  selected?: VenueCell | null;
  onPlace?: (index: number, source?: VenueCell) => void;
  onSelect?: (value: VenueCell) => void;
}) {
  return (
    <div className={compact ? 'hall-plan-scroller compact' : 'hall-plan-scroller'}>
      <div className={`hall-plan-wrap ${compact ? 'compact' : ''}`}>
        {layout.deskDock === 'top' && <div className="hall-desk-outside top">TL</div>}
        <div className="hall-grid-center">
          {layout.deskDock === 'left' && <div className="hall-desk-outside side">TL</div>}
          <div className="hall-grid" style={{ gridTemplateColumns: `repeat(${layout.columns}, minmax(${compact ? 12 : 62}px, 1fr))` }}>
            {layout.cells.map((token, index) => (
              <button
                key={index}
                type="button"
                title={tileLabel(token, false) || 'Freier Rasterplatz'}
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
              >{tileLabel(token, compact)}</button>
            ))}
          </div>
          {layout.deskDock === 'right' && <div className="hall-desk-outside side">TL</div>}
        </div>
        {layout.deskDock === 'bottom' && <div className="hall-desk-outside bottom">TL</div>}
      </div>
    </div>
  );
}

export function VenueLayoutEditor({ layout, tableCount, onChange }: {
  layout: VenueLayout;
  tableCount: number;
  onChange: (layout: VenueLayout) => void;
}) {
  const [selected, setSelected] = useState<VenueCell | null>(null);
  function place(target: number, source?: VenueCell) {
    const token = source ?? selected;
    if (!token) return;
    onChange(placeVenueCell(layout, token, target));
    setSelected(null);
  }
  return (
    <div className="hall-editor">
      <div className="hall-editor-controls">
        <div className="hall-editor-dimensions">
          <label className="field">Spalten
            <input type="number" min="1" max="100" value={layout.columns} onChange={(e) => onChange(resizeVenueLayout(layout, Number(e.target.value), layout.rows, tableCount))} />
          </label>
          <label className="field">Reihen
            <input type="number" min="1" max="40" value={layout.rows} onChange={(e) => onChange(resizeVenueLayout(layout, layout.columns, Number(e.target.value), tableCount))} />
          </label>
        </div>
        <button type="button" className="btn small" onClick={() => onChange({ ...createVenueLayout(tableCount), deskDock: layout.deskDock })}>Tische in eine Reihe</button>
      </div>
      <p className="field-hint">Wähle einen Tisch oder ziehe ihn auf ein anderes Feld. Belegte Felder werden getauscht. Freiflächen bleiben absichtlich leer.</p>
      <div className="hall-editor-tools">
        <button type="button" className={`btn small ${selected === 'space' ? 'primary' : ''}`} onClick={() => setSelected('space')}>Freifläche setzen</button>
        <button type="button" className={`btn small ${selected === '' ? 'primary' : ''}`} onClick={() => setSelected('')}>Freies Feld</button>
        <button type="button" className={`btn small ${selected === 'desk' ? 'primary' : ''}`} onClick={() => setSelected('desk')}>Turnierleitung im Raster</button>
        {selected !== null && <button type="button" className="btn small" onClick={() => setSelected(null)}>Auswahl aufheben</button>}
      </div>
      <HallGrid layout={layout} compact={false} selected={selected} onPlace={place} onSelect={setSelected} />
      <label className="field hall-dock-field">Turnierleitung außerhalb des Rasters
        <select value={layout.deskDock} onChange={(e) => { onChange(dockVenueDesk(layout, e.target.value as DeskDock)); setSelected(null); }}>
          {Object.entries(dockNames).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
    </div>
  );
}

export function VenueLayoutMini({ layout }: { layout: VenueLayout }) {
  return (
    <div className="hall-mini">
      <div className="hall-mini-legend"><span>■ Tisch</span><span>▤ Turnierleitung</span><span>· Freifläche</span></div>
      <HallGrid layout={layout} compact />
    </div>
  );
}
