/** Optional hall plan for the local prototype. Empty slots are intentional walkways. */
/** Protect layout editing and browser rendering from accidental giant rasters. */
export const MAX_VENUE_GRID_CELLS = 12_000;
export const MAX_VENUE_GRID_DIMENSION = 200;

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
  // A square is the default starting point for every table count.
  const side = Math.ceil(Math.sqrt(tables));
  const columns = side;
  const rows = side;
  return {
    columns,
    rows,
    cells: Array.from({ length: columns * rows }, (_, i): VenueCell => i < tables ? `table:${i + 1}` : ''),
    deskDock: 'none',
  };
}

/** Validate the exact current layout; duplicated, missing or nonexisting tables
 * must never be accepted in a newly created tournament. */
export function validateVenueLayout(layout: VenueLayout | undefined, tableCount: number): string[] {
  if (!layout) return [];
  if (!Number.isSafeInteger(tableCount) || tableCount < 1 || tableCount > 9999) return ['Ungültige Spielflächenanzahl.'];
  if (!Number.isInteger(layout.columns) || !Number.isInteger(layout.rows)
    || layout.columns < 1 || layout.rows < 1
    || layout.columns > MAX_VENUE_GRID_DIMENSION || layout.rows > MAX_VENUE_GRID_DIMENSION
    || layout.columns * layout.rows > MAX_VENUE_GRID_CELLS
    || !Array.isArray(layout.cells) || layout.cells.length !== layout.columns * layout.rows) {
    return ['Der Hallenplan überschreitet die Rastergrenzen oder ist unvollständig.'];
  }
  if (!['none', 'top', 'right', 'bottom', 'left'].includes(layout.deskDock)) return ['Ungültige Position der Turnierleitung.'];
  const found = new Set<number>();
  let desks = 0;
  for (const cell of layout.cells) {
    if (cell === 'desk') { desks++; continue; }
    if (cell === '' || cell === 'space') continue;
    if (!/^table:[1-9]\d*$/.test(cell)) return ['Der Hallenplan enthält ein ungültiges Feld.'];
    const number = Number(cell.slice(6));
    if (!Number.isInteger(number) || number > tableCount || found.has(number))
      return ['Der Hallenplan enthält eine doppelte oder ungültige Spielfläche.'];
    found.add(number);
  }
  if (found.size !== tableCount) return ['Im Hallenplan fehlen Spielflächen.'];
  if (desks > 1 || (desks && layout.deskDock !== 'none')) return ['Die Turnierleitung darf nur einmal platziert werden.'];
  return [];
}

/** Grow a custom hall without violating rendering limits. Prefer retaining
 * its existing dimensions and cell positions over resetting the layout. */
export function resizeVenueLayoutForTableCount(layout: VenueLayout, tableCount: number): VenueLayout {
  const required = tableCount + (layout.deskDock === 'none' && layout.cells.includes('desk') ? 1 : 0);
  if (required > MAX_VENUE_GRID_CELLS) return createVenueLayout(tableCount);
  if (layout.columns <= MAX_VENUE_GRID_DIMENSION && layout.rows <= MAX_VENUE_GRID_DIMENSION
    && layout.columns * layout.rows <= MAX_VENUE_GRID_CELLS && layout.columns * layout.rows >= required) {
    return resizeVenueLayout(layout, layout.columns, layout.rows, tableCount);
  }
  let candidate: { columns: number; rows: number; cost: number } | null = null;
  for (let columns = Math.max(1, layout.columns); columns <= MAX_VENUE_GRID_DIMENSION; columns++) {
    const rows = Math.max(layout.rows, Math.ceil(required / columns));
    if (rows > MAX_VENUE_GRID_DIMENSION || columns * rows > MAX_VENUE_GRID_CELLS) continue;
    const cost = (columns - layout.columns) + (rows - layout.rows) + (columns * rows - required) / 1000;
    if (!candidate || cost < candidate.cost) candidate = { columns, rows, cost };
  }
  return candidate ? resizeVenueLayout(layout, candidate.columns, candidate.rows, tableCount)
    : createVenueLayout(tableCount);
}

export function layoutTableNumbers(layout: VenueLayout): number[] {
  return layout.cells.filter((cell) => cell.startsWith('table:')).map((cell) => Number(cell.slice(6)));
}

/** Preserve valid table positions and repack overflow if dimensions change. */
export function resizeVenueLayout(layout: VenueLayout, columns: number, rows: number, tableCount: number): VenueLayout {
  const count = Math.max(1, Math.floor(tableCount));
  const width = Math.max(1, Math.floor(columns));
  const height = Math.max(1, Math.floor(rows));
  if (width > MAX_VENUE_GRID_DIMENSION || height > MAX_VENUE_GRID_DIMENSION
    || width * height > MAX_VENUE_GRID_CELLS) return layout;
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
