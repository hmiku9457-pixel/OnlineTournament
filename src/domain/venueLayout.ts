/** Optional hall plan for the local prototype. Empty slots are intentional walkways. */
export type DeskDock = 'none' | 'top' | 'right' | 'bottom' | 'left';
export type VenueCell = '' | 'space' | 'desk' | `table:${number}`;

export interface VenueLayout {
  columns: number;
  rows: number;
  cells: VenueCell[];
  deskDock: DeskDock;
}

export function createVenueLayout(tableCount: number): VenueLayout {
  const tables = Math.max(1, Math.floor(tableCount));
  const columns = 10;
  const rows = Math.max(3, Math.ceil(tables / columns));
  return {
    columns,
    rows,
    cells: Array.from({ length: columns * rows }, (_, i): VenueCell => i < tables ? `table:${i + 1}` : ''),
    deskDock: 'none',
  };
}

export function layoutTableNumbers(layout: VenueLayout): number[] {
  return layout.cells.filter((cell) => cell.startsWith('table:')).map((cell) => Number(cell.slice(6)));
}

/** Preserve valid table positions and repack overflow if dimensions change. */
export function resizeVenueLayout(layout: VenueLayout, columns: number, rows: number, tableCount: number): VenueLayout {
  const count = Math.max(1, Math.floor(tableCount));
  const width = Math.max(1, Math.floor(columns));
  const height = Math.max(1, Math.floor(rows));
  if (width * height < count + (layout.deskDock === 'none' && layout.cells.includes('desk') ? 1 : 0)) return layout;
  const cells: VenueCell[] = Array.from({ length: width * height }, () => '');
  const overflow: VenueCell[] = [];
  for (let r = 0; r < layout.rows; r++) {
    for (let c = 0; c < layout.columns; c++) {
      const token = layout.cells[r * layout.columns + c] ?? '';
      if (!token) continue;
      if (token.startsWith('table:') && Number(token.slice(6)) > count) continue;
      if (r < height && c < width) cells[r * width + c] = token;
      else if (token !== 'space') overflow.push(token);
    }
  }
  const present = new Set(layoutTableNumbers({ ...layout, cells }));
  for (let table = 1; table <= count; table++) {
    if (!present.has(table) && !overflow.includes(`table:${table}`)) overflow.push(`table:${table}`);
  }
  for (const token of overflow) {
    // Markierte Freiflächen behalten ihre Position, solange genug Raum bleibt.
    // Fehlt beim Verkleinern Platz, haben Tische und Turnierleitung Vorrang.
    const empty = cells.findIndex((cell) => cell === '');
    const slot = empty >= 0 ? empty : cells.findIndex((cell) => cell === 'space');
    if (slot < 0) return layout;
    cells[slot] = token;
  }
  return { ...layout, columns: width, rows: height, cells };
}

export function placeVenueCell(layout: VenueLayout, cell: VenueCell, target: number): VenueLayout {
  if (!Number.isInteger(target) || target < 0 || target >= layout.cells.length) return layout;
  const next = [...layout.cells];
  if (cell === 'space' || cell === '') {
    // A table may never be erased by painting a walkway/blank cell.
    if (next[target].startsWith('table:')) return layout;
    if (next[target] === 'desk') return layout;
    next[target] = cell === 'space' && next[target] === 'space' ? '' : cell;
    return { ...layout, cells: next };
  }
  const source = next.findIndex((entry) => entry === cell);
  if (source === target) return layout;
  if (source >= 0) next[source] = next[target];
  else if (next[target].startsWith('table:')) return layout;
  next[target] = cell;
  return { ...layout, cells: next, deskDock: cell === 'desk' ? 'none' : layout.deskDock };
}

export function dockVenueDesk(layout: VenueLayout, dock: DeskDock): VenueLayout {
  return { ...layout, deskDock: dock, cells: dock === 'none' ? [...layout.cells] : layout.cells.map((cell) => cell === 'desk' ? '' : cell) };
}
