import { describe, expect, it } from 'vitest';
import { createVenueLayout, dockVenueDesk, layoutTableNumbers, placeVenueCell, resizeVenueLayout } from '@/domain/venueLayout';

describe('optional hall layout', () => {
  it('starts with all tables in a single row', () => {
    const layout = createVenueLayout(19);
    expect(layout.columns).toBe(19);
    expect(layout.rows).toBe(1);
    expect(layoutTableNumbers(layout)).toEqual(Array.from({ length: 19 }, (_, i) => i + 1));
  });

  it('preserves tables when growing and swapping', () => {
    const initial = createVenueLayout(4);
    const withExtraRow = resizeVenueLayout(initial, 4, 2, 4);
    const moved = placeVenueCell(withExtraRow, 'table:2', 7);
    expect(layoutTableNumbers(moved).sort((a, b) => a - b)).toEqual([1, 2, 3, 4]);
    expect(moved.cells[7]).toBe('table:2');
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
