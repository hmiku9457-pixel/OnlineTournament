import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { VenueLayoutEditor, makeVenuePreset } from '@/components/VenueLayout';
import { createVenueLayout, dockVenueDesk, layoutTableNumbers, placeVenueCell, resizeVenueLayout } from '@/domain/venueLayout';

describe('optional hall layout', () => {
  it('starts with a square grid, accommodating larger tournaments', () => {
    const layout = createVenueLayout(19);
    expect(layout.columns).toBe(5);
    expect(layout.rows).toBe(5);
    expect(layout.cells).toHaveLength(25);
    expect(layoutTableNumbers(layout)).toEqual(Array.from({ length: 19 }, (_, i) => i + 1));
  });

  it('uses compact multi-row banks around the middle aisle above 80 surfaces', () => {
    for (const count of [81, 200, 1000]) {
      const venue = makeVenuePreset(count, 'none', 'aisle');
      const middle = Math.floor(venue.columns / 2);
      expect(venue.columns).toBeLessThan(Math.ceil(count / 2));
      expect(venue.rows).toBeGreaterThan(3);
      expect(layoutTableNumbers(venue)).toHaveLength(count);
      for (let row = 0; row < venue.rows; row++) {
        expect(venue.cells[row * venue.columns + middle]).toBe('');
      }
    }
    const html41 = renderToStaticMarkup(<VenueLayoutEditor layout={createVenueLayout(41)}
      tableCount={41} sport="table_tennis" onChange={() => {}} />);
    expect(html41).not.toContain('>Eine Reihe<');
    expect(html41).toContain('>Zwei Reihen<');
    const html81 = renderToStaticMarkup(<VenueLayoutEditor layout={createVenueLayout(81)}
      tableCount={81} sport="table_tennis" onChange={() => {}} />);
    expect(html81).not.toContain('>Zwei Reihen<');
    expect(html81).toContain('>Mit Mittelgang<');
  });

  it('preserves tables when growing and swapping', () => {
    const initial = createVenueLayout(4);
    const withExtraRow = resizeVenueLayout(initial, 4, 2, 4);
    const moved = placeVenueCell(withExtraRow, 'table:2', 7);
    expect(layoutTableNumbers(moved).sort((a, b) => a - b)).toEqual([1, 2, 3, 4]);
    expect(moved.cells[7]).toBe('table:2');
  });

  it('can use all tables in one row when explicitly requested', () => {
    const oneRow = resizeVenueLayout(createVenueLayout(19), 19, 1, 19);
    expect(oneRow.columns).toBe(19);
    expect(oneRow.rows).toBe(1);
    expect(layoutTableNumbers(oneRow)).toHaveLength(19);
  });

  it('can dock the tournament desk outside and retain empty gaps', () => {
    const base = resizeVenueLayout(createVenueLayout(3), 5, 2, 3);
    const gap = placeVenueCell(base, 'space', 8);
    const desk = dockVenueDesk(placeVenueCell(gap, 'desk', 6), 'right');
    expect(desk.cells).not.toContain('desk');
    expect(desk.cells[8]).toBe('space');
    expect(desk.deskDock).toBe('right');
  });
});
