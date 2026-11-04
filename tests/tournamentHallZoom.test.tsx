import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { HALL_ZOOM_MAX, HALL_ZOOM_MIN, HALL_ZOOM_STEP, clampHallZoom, TournamentHallView } from '@/components/TournamentHallView';
import type { VenueLayout } from '@/domain/venueLayout';

const layout: VenueLayout = {
  columns: 2,
  rows: 2,
  cells: ['table:1', 'space', 'table:2', 'desk'],
  deskDock: 'none',
};

describe('Zoom der Planansicht', () => {
  it('begrenzt die Zoomstufen auf 70–150 Prozent in 10-Prozent-Schritten', () => {
    expect([HALL_ZOOM_MIN, HALL_ZOOM_MAX, HALL_ZOOM_STEP]).toEqual([70, 150, 10]);
    expect(clampHallZoom(30)).toBe(70);
    expect(clampHallZoom(75)).toBe(80);
    expect(clampHallZoom(100)).toBe(100);
    expect(clampHallZoom(147)).toBe(150);
    expect(clampHallZoom(400)).toBe(150);
  });

  it('zeichnet echte Planfelder sowie Zoomsteuerung bei Standardgröße', () => {
    const markup = renderToStaticMarkup(<TournamentHallView
      layout={layout}
      matchesByTable={new Map()}
      blockedTables={new Set()}
      selectedTable={null}
      canAssign
      sport="table_tennis"
      onSelectTable={() => {}}
      onAssignToTable={() => true}
    />);
    expect(markup).toContain('aria-label="Zoom der Planansicht"');
    expect(markup).toContain('aria-label="Plan vergrößern"');
    expect(markup).toContain('aria-label="Plan verkleinern"');
    expect(markup).toContain('100 %');
    expect(markup).toContain('--hall-zoom:1');
    expect(markup).toContain('repeat(2, var(--hall-tile-width))');
    expect(markup).toContain('aria-label="Tisch 1, frei. Details öffnen"');
    expect(markup).toContain('aria-label="Tisch 2, frei. Details öffnen"');
  });
});
